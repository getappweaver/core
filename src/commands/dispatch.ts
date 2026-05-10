// ---------------------------------------------------------------------------
// src/commands/dispatch.ts — types, constants, error wrapper, route prefixed input
// ---------------------------------------------------------------------------

import type { VerifiedEvent } from 'nostr-tools';
import type { SimplePool } from 'nostr-tools/pool';

import type { PromptFn, RunAgentFn, SendReplyFn } from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type { WebHandlerResult } from '@src/web/ui-schema';

import type { AgentBackend } from '../backends/types';
import { dispatchPluginCommand } from '../core/registry';
import type { CoreDb } from '../db';
import {
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getModelOverride,
  getRoutstrSkKey,
  getWorkspaceTarget,
} from '../db';
import type { BotConfig } from '../env';
import { log } from '../logger';
import type { ProviderDb } from '../providers/db';
import { getOrCreateCurrentSession } from '../session';
import type { WalletDb } from '../wallet/db';

import { parseBuiltinTokens } from './parse-prefixed';
import { builtinCommandHandlers } from './prefixed-handlers';

async function createRunAgentForPluginDispatch(props: {
  seenDb: CoreDb;
  backend: AgentBackend;
  cwd: string;
}): Promise<RunAgentFn> {
  const { seenDb, backend, cwd } = props;
  const modelOverride = getModelOverride(seenDb, backend.name);
  const executionProfile = getBackendExecutionProfile(seenDb, backend.name);

  const sessionId = await getOrCreateCurrentSession({
    db: seenDb,
    backend,
    cwd,
  });

  return async (prompt: string) =>
    backend.runMessage({
      sessionId,
      content: prompt,
      cursorMode:
        executionProfile.kind === 'cursor'
          ? executionProfile.mode
          : getCurrentOrDefaultMode(seenDb),
      opencodeAgentName:
        executionProfile.kind === 'opencode' ? executionProfile.agent : null,
      cwd,
      getRoutstrSkKey: () => getRoutstrSkKey(seenDb),
      modelOverride,
      onAgentStreamChunk: null,
      streamAbortSignal: null,
    });
}

// --- types

export type RouteCommandProps = {
  /** User message (must start with `prefix`). */
  input: string;
  /** Display prefix for built-in and plugin commands in this transport (e.g. `!` or `/`). */
  prefix: string;
  botRelayUrls: string[];
  version: string;
  parentOfBotRoot: string;
  dmBotRoot: string;
  attachUrl: string | null;
  backend: AgentBackend;
  botPubkey: string | null;
  seenDb: CoreDb;
  pool: SimplePool;
  walletDb: WalletDb | null;
  providerDb: ProviderDb | null;
  config: BotConfig;
  source: MessageSource;
  sendReply?: SendReplyFn;
  sendDm?: SendReplyFn;
  promptFn?: PromptFn;
  signEncryptedSelfEvent?: (props: {
    kind: number;
    plaintext: string;
    tags: string[][];
  }) => Promise<VerifiedEvent>;
  decryptSelfContent?: (ciphertext: string) => Promise<string>;
  jsonPayload?: unknown;
};

export type RouteCommandContext = RouteCommandProps & {
  cmd: string;
  args: string[];
  cwd: string;
};

export type BuiltinHandler = (
  ctx: RouteCommandContext,
) => Promise<WebHandlerResult>;

// --- error wrapper

export async function handleError(
  fn: () => Promise<WebHandlerResult>,
  errorPrefix: string,
): Promise<WebHandlerResult> {
  try {
    return await fn();
  } catch (err) {
    return `${errorPrefix}: ${String(err)}`;
  }
}

// --- routing

export async function routeCommand(
  props: RouteCommandProps,
): Promise<WebHandlerResult | null> {
  const {
    input,
    prefix,
    seenDb,
    parentOfBotRoot,
    dmBotRoot,
    backend,
    source,
    sendReply,
    promptFn,
  } = props;

  const parsed = parseBuiltinTokens({ input, prefix });

  if (!parsed) {
    log.warn(`Input does not start with ${prefix}: ${input}`);

    return null;
  }

  const { cmd, args } = parsed;

  const cwd =
    getWorkspaceTarget(seenDb) === 'appweaver' ? dmBotRoot : parentOfBotRoot;

  const ctx = {
    ...props,
    cmd,
    args,
    cwd,
  };

  const builtIn = builtinCommandHandlers[cmd];

  if (builtIn) {
    return builtIn(ctx);
  }

  const runAgent: RunAgentFn = await createRunAgentForPluginDispatch({
    seenDb,
    backend,
    cwd,
  });

  const pluginResult = await dispatchPluginCommand(cmd, args, {
    prefix,
    source,
    runAgent,
    sendReply,
    promptFn,
  });

  if (pluginResult !== null) {
    return pluginResult;
  }

  return `Unknown command: ${prefix}${cmd}. Use ${prefix}help for commands.`;
}
