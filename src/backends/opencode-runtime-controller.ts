import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { AiModelRuntimeConfig } from '@src/capabilities/ai-model-source.v1';
import type { WorkspaceTarget } from '@src/db';
import { log } from '@src/logger';

import {
  materializeOpencodeRuntimeConfig,
  runtimeModelId,
} from './opencode-managed-config';
import {
  areOpencodeSessionsIdle,
  restartOpencodeSdk,
  verifyOpencodeRuntimeProvider,
} from './opencode-sdk';

export type OpencodeRuntimeState =
  'running' | 'drain_requested' | 'draining' | 'restarting' | 'failed';

export type OpencodeRuntimeStatus = {
  state: OpencodeRuntimeState;
  activeRuns: number;
  queuedRuns: number;
  pendingTransitions: number;
  lastError: string | null;
};

type Roots = Record<WorkspaceTarget, string>;
type PendingTransition = {
  workspaceRoot: string;
  config: AiModelRuntimeConfig;
};

export class StaleRuntimeTransitionError extends Error {
  constructor() {
    super('OpenCode model source changed while preparing the run.');
  }
}

class OpencodeRuntimeController {
  private roots: Roots | null = null;
  private state: OpencodeRuntimeState = 'running';
  private activeRuns = 0;
  private credentialRevision = 0;
  private queuedRuns = 0;
  private lastError: string | null = null;
  private pending = new Map<string, PendingTransition>();
  private appliedSignatures = new Map<string, string>();
  private appliedConfigs = new Map<string, AiModelRuntimeConfig>();
  private transitionPromise: Promise<void> | null = null;
  private manualRestart = false;
  private cancelRequested = false;
  private admissionWaiters = new Set<() => void>();
  private drainWaiters = new Set<() => void>();
  private readonly leaseContext = new AsyncLocalStorage<{ active: boolean }>();

  configure(roots: Roots): void {
    this.roots = {
      parent: resolve(roots.parent),
      appweaver: resolve(roots.appweaver),
    };
  }

  workspaceRoot(workspace: WorkspaceTarget): string {
    if (!this.roots) {
      throw new Error('OpenCode runtime controller is not configured.');
    }

    return this.roots[workspace];
  }

  runtimeModelFor(workspace: WorkspaceTarget): string | null {
    const config = this.appliedConfigs.get(this.workspaceRoot(workspace));

    return config ? runtimeModelId(config) : null;
  }

  status(): OpencodeRuntimeStatus {
    return {
      state: this.state,
      activeRuns: this.activeRuns,
      queuedRuns: this.queuedRuns,
      pendingTransitions: this.pending.size,
      lastError: this.lastError,
    };
  }

  private announce(
    event: 'waiting' | 'restarting' | 'completed' | 'cancelled' | 'failed',
  ): void {
    const message = `OpenCode configuration transition ${event}.`;

    if (event === 'failed') {
      log.error(message);
    } else {
      log.info(message);
    }

    if (!this.roots) {
      return;
    }

    try {
      const filePath = join(
        this.roots.appweaver,
        '.logs',
        'system',
        'opencode-runtime.jsonl',
      );

      mkdirSync(dirname(filePath), { recursive: true });

      appendFileSync(
        filePath,
        `${JSON.stringify({ timestamp: new Date().toISOString(), event })}\n`,
        'utf8',
      );
    } catch {
      log.warn('Could not persist the OpenCode transition system-log entry.');
    }
  }

  private async waitForAdmission(): Promise<void> {
    while (this.state !== 'running') {
      if (this.state === 'failed') {
        throw new Error(
          this.lastError ?? 'OpenCode configuration transition failed.',
        );
      }

      this.queuedRuns += 1;

      try {
        await new Promise<void>((resolveWaiter) => {
          this.admissionWaiters.add(resolveWaiter);
        });
      } finally {
        this.queuedRuns -= 1;
      }
    }
  }

  private releaseAdmissionWaiters(): void {
    const waiters = [...this.admissionWaiters];
    this.admissionWaiters.clear();
    waiters.forEach((resolveWaiter) => resolveWaiter());
  }

  private acquire(): { token: { active: boolean }; release: () => void } {
    this.activeRuns += 1;
    const token = { active: true };

    return {
      token,
      release: () => {
        if (!token.active) {
          return;
        }

        token.active = false;
        this.activeRuns -= 1;

        if (this.activeRuns === 0) {
          const waiters = [...this.drainWaiters];
          this.drainWaiters.clear();
          waiters.forEach((resolveWaiter) => resolveWaiter());
        }
      },
    };
  }

  async withAdmission<T>(run: () => Promise<T>): Promise<T> {
    if (this.leaseContext.getStore()) {
      return run();
    }

    await this.waitForAdmission();

    if (this.state !== 'running') {
      return this.withAdmission(run);
    }

    const { token, release } = this.acquire();

    try {
      return await this.leaseContext.run(token, run);
    } finally {
      release();
    }
  }

  holdUntil<T>(work: () => Promise<T>): Promise<T> {
    const { token, release } = this.acquire();

    return this.leaseContext.run(token, work).finally(release);
  }

  async withPreparedRun<TPrepared, TResult>(props: {
    prepare: () => Promise<TPrepared>;
    run: (prepared: TPrepared) => Promise<TResult>;
  }): Promise<TResult> {
    if (this.leaseContext.getStore()) {
      return props.run(await props.prepare());
    }

    while (true) {
      await this.waitForAdmission();
      const credentialRevision = this.credentialRevision;
      let prepared: TPrepared;

      try {
        prepared = await props.prepare();
      } catch (error) {
        if (
          error instanceof StaleRuntimeTransitionError ||
          this.state !== 'running' ||
          credentialRevision !== this.credentialRevision
        ) {
          continue;
        }

        throw error;
      }

      if (
        this.state !== 'running' ||
        credentialRevision !== this.credentialRevision
      ) {
        continue;
      }

      const { token, release } = this.acquire();

      try {
        return await this.leaseContext.run(token, () => props.run(prepared));
      } finally {
        release();
      }
    }
  }

  async ensureRuntimeConfig(
    workspace: WorkspaceTarget,
    config: AiModelRuntimeConfig,
  ): Promise<string> {
    if (this.manualRestart) {
      await this.waitForAdmission();

      return this.ensureRuntimeConfig(workspace, config);
    }

    const workspaceRoot = this.workspaceRoot(workspace);
    const signature = JSON.stringify(config);

    if (
      this.leaseContext.getStore() &&
      this.appliedSignatures.get(workspaceRoot) !== signature
    ) {
      throw new Error(
        'Cannot change OpenCode configuration during an active run.',
      );
    }

    if (
      this.state === 'running' &&
      this.appliedSignatures.get(workspaceRoot) === signature
    ) {
      return runtimeModelId(config);
    }

    this.pending.set(workspaceRoot, { workspaceRoot, config });

    if (!this.transitionPromise) {
      this.transitionPromise = this.runTransitions().finally(() => {
        this.transitionPromise = null;
      });
    }

    await this.transitionPromise;

    if (this.appliedSignatures.get(workspaceRoot) !== signature) {
      throw new StaleRuntimeTransitionError();
    }

    return runtimeModelId(config);
  }

  private async waitForDrain(): Promise<void> {
    while (this.activeRuns > 0) {
      await new Promise<void>((resolveWaiter) => {
        this.drainWaiters.add(resolveWaiter);
      });

      if (this.cancelRequested) {
        return;
      }
    }

    if (!this.roots) {
      return;
    }

    while (
      !(await areOpencodeSessionsIdle([
        this.roots.parent,
        this.roots.appweaver,
      ]))
    ) {
      if (this.cancelRequested) {
        return;
      }

      await new Promise((resolveWaiter) => setTimeout(resolveWaiter, 250));
    }
  }

  /** Keep run admission paused while a source rotates a local runtime credential. */
  async withDrainedRuns<T>(work: () => Promise<T>): Promise<T> {
    if (this.state === 'failed') {
      throw new Error(
        'Recover the OpenCode runtime before switching credentials.',
      );
    }

    while (this.manualRestart || this.transitionPromise) {
      if (this.transitionPromise) {
        await this.transitionPromise;
      } else {
        await new Promise((resolveWaiter) => setTimeout(resolveWaiter, 50));
      }
    }

    this.manualRestart = true;
    this.state = 'drain_requested';
    this.announce('waiting');

    try {
      await this.waitForDrain();
      this.state = 'draining';

      const result = await work();

      this.announce('completed');

      return result;
    } catch (error) {
      this.announce('cancelled');
      throw error;
    } finally {
      this.credentialRevision += 1;
      this.state = 'running';
      this.manualRestart = false;
      this.releaseAdmissionWaiters();
    }
  }

  private async runTransitions(): Promise<void> {
    this.state = 'drain_requested';
    this.lastError = null;
    this.cancelRequested = false;
    this.announce('waiting');

    const applied = new Map<string, PendingTransition>();
    let inFlight: PendingTransition[] = [];

    try {
      this.state = 'draining';
      await this.waitForDrain();

      if (this.cancelRequested) {
        throw new Error('OpenCode configuration transition cancelled.');
      }

      while (this.pending.size > 0) {
        const transitions = [...this.pending.values()];
        inFlight = transitions;
        this.pending.clear();
        let restartRequired = false;

        for (const transition of transitions) {
          restartRequired =
            (await materializeOpencodeRuntimeConfig(
              transition.workspaceRoot,
              transition.config,
            )) || restartRequired;

          applied.set(transition.workspaceRoot, transition);
        }

        if (restartRequired) {
          this.state = 'restarting';
          this.announce('restarting');
          await restartOpencodeSdk();
        }

        for (const transition of transitions) {
          if (transition.config.kind === 'openai-compatible') {
            await verifyOpencodeRuntimeProvider({
              directory: transition.workspaceRoot,
              providerId: transition.config.provider.id,
              modelId: transition.config.model,
            });
          }
        }

        inFlight = [];
      }

      for (const transition of applied.values()) {
        this.appliedSignatures.set(
          transition.workspaceRoot,
          JSON.stringify(transition.config),
        );

        this.appliedConfigs.set(transition.workspaceRoot, transition.config);
      }

      this.state = 'running';
      this.announce('completed');
      this.releaseAdmissionWaiters();
    } catch (error) {
      for (const transition of inFlight) {
        if (!this.pending.has(transition.workspaceRoot)) {
          this.pending.set(transition.workspaceRoot, transition);
        }
      }

      for (const transition of applied.values()) {
        if (!this.pending.has(transition.workspaceRoot)) {
          this.pending.set(transition.workspaceRoot, transition);
        }
      }

      if (this.cancelRequested) {
        this.state = 'running';
        this.pending.clear();

        this.announce('cancelled');
      } else {
        this.state = 'failed';

        this.lastError =
          'OpenCode configuration transition failed. Use ai runtime retry or force-restart.';

        this.announce('failed');
      }

      this.releaseAdmissionWaiters();
      throw error;
    }
  }

  cancelPending(): boolean {
    if (
      this.manualRestart ||
      (this.state !== 'drain_requested' && this.state !== 'draining')
    ) {
      return false;
    }

    this.cancelRequested = true;
    this.pending.clear();

    const waiters = [...this.drainWaiters];

    this.drainWaiters.clear();
    waiters.forEach((resolveWaiter) => resolveWaiter());

    return true;
  }

  invalidateRuntimeConfig(workspace: WorkspaceTarget): void {
    this.appliedSignatures.delete(this.workspaceRoot(workspace));
  }

  async retry(): Promise<void> {
    if (this.state !== 'failed' || this.pending.size === 0) {
      throw new Error('No failed OpenCode transition is available to retry.');
    }

    this.transitionPromise = this.runTransitions().finally(() => {
      this.transitionPromise = null;
    });

    await this.transitionPromise;
  }

  async forceRestart(): Promise<void> {
    if (this.transitionPromise || this.manualRestart) {
      throw new Error('OpenCode transition is already in progress.');
    }

    this.manualRestart = true;
    this.cancelRequested = false;
    this.state = 'drain_requested';
    this.announce('waiting');
    try {
      await this.waitForDrain();
      this.state = 'restarting';
      this.announce('restarting');
      await restartOpencodeSdk();
      this.pending.clear();
      this.appliedSignatures.clear();
      this.appliedConfigs.clear();
      this.state = 'running';
      this.lastError = null;
      this.announce('completed');
      this.releaseAdmissionWaiters();
    } catch {
      this.state = 'failed';
      this.lastError = 'Manual OpenCode restart failed.';
      this.announce('failed');
      this.releaseAdmissionWaiters();
      throw new Error(this.lastError);
    } finally {
      this.manualRestart = false;
    }
  }
}

export const opencodeRuntimeController = new OpencodeRuntimeController();

export function configureOpencodeRuntimeController(roots: Roots): void {
  opencodeRuntimeController.configure(roots);
}
