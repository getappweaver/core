import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import type { JSX } from 'solid-js';
import type { EventTemplate, NostrEvent } from 'nostr-tools';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';
import {
  materializeRoadmap,
  normalizeRoadmapRelay,
  PROFILE_KIND,
  uniqueRoadmapRelays,
} from '@src/commands/roadmap/model';
import {
  renderRoadmapFundWeb,
  renderRoadmapIssueModalWeb,
  renderRoadmapNewIssueWeb,
  renderRoadmapWeb,
  issuePayload,
  workflowPayload,
} from '@src/commands/roadmap/renderers/web';
import {
  type AuthorIdentity,
  verifiedNip05AuthorIdentity,
} from '@src/nostr/author-identity';
import { WebNodeShadowRoot } from '@web/src/components/WebNodeShadowRoot';
import { ConnectModal } from '@web/src/components/ConnectModal';
import { UnlockModal } from '@web/src/components/UnlockModal';
import { useNostrAuth } from '@web/src/contexts/NostrAuthContext';
import { handleRoadmapCommentIssue } from '@web/src/roadmap/commentIssue';
import { handleRoadmapCreateIssue } from '@web/src/roadmap/createIssue';
import { handleRoadmapLightningZap } from '@web/src/roadmap/lightningZap';
import {
  handleRoadmapDeleteIssue,
  handleRoadmapMarkIssue,
  handleRoadmapTrackIssue,
} from '@web/src/roadmap/markIssue';

import {
  loadRoadmapSnapshot,
  type RoadmapTarget,
} from '@src/roadmap';

const DEFAULT_ROADMAP_LNURLP_DEV =
  'https://getappweaver.com/.well-known/lnurlp/donations_test';
const DEFAULT_ROADMAP_LNURLP_PROD = '/.well-known/lnurlp/donations';
const ROADMAP_DEBUG = true;

type LnurlpResponse = {
  allowsNostr?: unknown;
  nostrPubkey?: unknown;
};

type WorkflowZapSigner = {
  projectAddress: string;
  lnurlpUrl: string;
};

export type RoadmapPanelProps = {
  title: string;
  boardKey: string;
  target: RoadmapTarget;
};

const APPWEAVER_ROADMAP_OWNER_PUBKEY =
  '721e69c3f3f4e094a90ac00c3a4900c36271ee63aeebe67fbeedc112c31fb298';
const APPWEAVER_ROADMAP_RELAYS = [
  'wss://relay.ngit.dev',
  'wss://gitnostr.com',
];

export function appWeaverRoadmapTarget(repoId: string): RoadmapTarget {
  return {
    ownerPubkey: APPWEAVER_ROADMAP_OWNER_PUBKEY,
    repoId,
    relayHints: [...APPWEAVER_ROADMAP_RELAYS],
  };
}

type SignEventOptions = {
  title: string | null;
  allowedPubkeys?: string[] | null;
};

type ReloadOptions = {
  showLoading: boolean;
};

type RefreshedIssueOptions = {
  issueId: string | null;
  title: string | null;
  focus: 'activity' | 'comments' | 'manage';
};

function roadmapLnurlpUrl(): string {
  return (
    import.meta.env.VITE_APPWEAVER_ROADMAP_LNURLP_URL?.trim() ||
    (import.meta.env.DEV
      ? DEFAULT_ROADMAP_LNURLP_DEV
      : DEFAULT_ROADMAP_LNURLP_PROD)
  );
}

function lnurlpUrlFromLud16(lud16: string): string | null {
  const [name, domain] = lud16.split('@');

  if (!name || !domain) {
    return null;
  }

  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
}

function logRoadmapDebug(label: string, details: Record<string, unknown>): void {
  if (!ROADMAP_DEBUG) {
    return;
  }

  console.info(`[roadmap] ${label}`, details);
}

export function RoadmapPanel(props: RoadmapPanelProps): JSX.Element {
  const auth = useNostrAuth();
  const targetRelays = uniqueRoadmapRelays(props.target.relayHints);
  const [activeRelays, setActiveRelays] = createSignal<string[]>(targetRelays);
  const relay = createMemo(() => activeRelays()[0] ?? targetRelays[0] ?? '');
  const relayLabel = createMemo(() => activeRelays().join(', '));
  const lnurlpUrl = roadmapLnurlpUrl();
  const [events, setEvents] = createSignal<NostrEvent[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [selectedBoardKey, setSelectedBoardKey] = createSignal(props.boardKey);
  const [paymentRoot, setPaymentRoot] = createSignal<WebNodeRoot | null>(null);
  const [modalTitle, setModalTitle] = createSignal('Roadmap payment');
  const [paymentText, setPaymentText] = createSignal<string | null>(null);
  const [paymentError, setPaymentError] = createSignal<string | null>(null);
  const [paymentLoading, setPaymentLoading] = createSignal(false);
  const [connectModalOpen, setConnectModalOpen] = createSignal(false);
  const [unlockModalOpen, setUnlockModalOpen] = createSignal(false);
  const [authorIdentities, setAuthorIdentities] = createSignal<
    Map<string, AuthorIdentity>
  >(new Map());
  const [zapReceiptPubkeys, setZapReceiptPubkeys] = createSignal<Set<string>>(
    new Set(),
  );
  const [zapReceiptPubkeysByProjectAddress, setZapReceiptPubkeysByProjectAddress] =
    createSignal<Map<string, Set<string>>>(new Map());
  let authWaiter: ((connected: boolean) => void) | null = null;
  let mounted = true;

  onCleanup(() => {
    mounted = false;
  });

  createEffect(() => {
    if (auth.authState().status !== 'connected' || authWaiter === null) {
      return;
    }

    const resolve = authWaiter;
    authWaiter = null;
    setConnectModalOpen(false);
    setUnlockModalOpen(false);
    resolve(true);
  });

  function closeConnectModal(): void {
    setConnectModalOpen(false);

    if (authWaiter !== null) {
      const resolve = authWaiter;
      authWaiter = null;
      resolve(false);
    }
  }

  function closeUnlockModal(): void {
    setUnlockModalOpen(false);

    if (authWaiter !== null) {
      const resolve = authWaiter;
      authWaiter = null;
      resolve(false);
    }
  }

  function waitForSigner(mode: 'connect' | 'unlock'): Promise<boolean> {
    return new Promise((resolve) => {
      authWaiter = resolve;

      if (mode === 'connect') {
        setConnectModalOpen(true);
      } else {
        setUnlockModalOpen(true);
      }
    });
  }

  async function signEventForLanding(
    event: EventTemplate,
    options?: SignEventOptions,
  ): Promise<NostrEvent | null> {
    const state = auth.authState();

    if (state.status === 'disconnected') {
      const connected = await waitForSigner('connect');

      if (!connected) {
        return null;
      }
    } else if (state.status === 'locked') {
      const connected = await waitForSigner('unlock');

      if (!connected) {
        return null;
      }
    }

    return auth.signEvent(event, options);
  }

  function currentUserPubkey(): string | null {
    const state = auth.authState();

    return state.status === 'connected' ? state.pubkey : null;
  }

  function availableSignerPubkeys(): string[] {
    const pubkey = currentUserPubkey();

    return pubkey ? [pubkey] : [];
  }

  async function reloadRoadmapEvents(options: ReloadOptions): Promise<void> {
    if (options.showLoading) {
      setLoading(true);
    }

    setError(null);

    try {
      const snapshot = await loadRoadmapSnapshot({
        target: props.target,
        boardKey: props.boardKey,
        pool: null
      });

      if (!mounted) {
        return;
      }

      logRoadmapDebug('scoped events fetched', {
        target: props.target,
        relays: snapshot.relays,
        totalEvents: snapshot.events.length,
        zapReceipts: snapshot.events
          .filter((event) => event.kind === 9735)
          .map((event) => ({
            id: event.id,
            pubkey: event.pubkey,
            amount: event.tags.find((tag) => tag[0] === 'amount')?.[1] ?? null,
            issue: event.tags.find((tag) => tag[0] === 'e')?.[1] ?? null,
          })),
      });

      setEvents(snapshot.events);
      setActiveRelays(snapshot.relays);
    } catch (err) {
      if (mounted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mounted && options.showLoading) {
        setLoading(false);
      }
    }
  }

  function refreshedIssueRoot({
    issueId,
    title,
    focus,
  }: RefreshedIssueOptions): WebNodeRoot | null {
    const normalizedTitle = title?.trim().toLowerCase() ?? '';

    for (const workflow of view().workflows) {
      for (const column of workflow.columns) {
        const issue = column.issues.find(
          (candidate) =>
            (issueId !== null && candidate.id === issueId) ||
            (issueId === null &&
              normalizedTitle.length > 0 &&
              candidate.subject.trim().toLowerCase() === normalizedTitle),
        );

        if (!issue) {
          continue;
        }

        return renderRoadmapIssueModalWeb({
          issue: issuePayload(issue),
          workflow: workflowPayload(workflow),
          relay: relay(),
          boardKey: workflow.key,
          columnId: column.id,
          focus,
          availableSignerPubkeys: availableSignerPubkeys(),
        });
      }
    }

    return null;
  }

  async function refreshAfterRoadmapMutation(
    options: RefreshedIssueOptions,
  ): Promise<void> {
    if (paymentError()) {
      return;
    }

    await reloadRoadmapEvents({ showLoading: false });

    const root = refreshedIssueRoot(options);

    if (root) {
      setPaymentRoot(root);
      setPaymentText(null);
      setPaymentError(null);
    }
  }

  const unverifiedView = createMemo(() =>
    materializeRoadmap({
      relay: relay(),
      events: events(),
      authorIdentities: authorIdentities(),
      zapReceiptPubkeys: null,
      zapReceiptPubkeysByProjectAddress: null,
    }),
  );

  const view = createMemo(() =>
    materializeRoadmap({
      relay: relay(),
      events: events(),
      authorIdentities: authorIdentities(),
      zapReceiptPubkeys: zapReceiptPubkeys(),
      zapReceiptPubkeysByProjectAddress: zapReceiptPubkeysByProjectAddress(),
    }),
  );

  createEffect(() => {
    const loadedEvents = events();
    const materialized = view();

    logRoadmapDebug('materialized', {
      relay: relay(),
      relays: activeRelays(),
      lnurlpUrl,
      totalEvents: loadedEvents.length,
      fetchedZapReceipts: loadedEvents.filter((event) => event.kind === 9735)
        .length,
      acceptedZapReceiptPubkeys: [...zapReceiptPubkeys()],
      verifiedZapCount: materialized.zapCount,
      workflows: materialized.workflows.map((workflow) => ({
        key: workflow.key,
        title: workflow.title,
        issueCount: workflow.columns.reduce(
          (sum, column) => sum + column.issues.length,
          0,
        ),
        fundingSats: workflow.columns.reduce(
          (sum, column) =>
            sum +
            column.issues.reduce(
              (issueSum, issue) => issueSum + issue.fundingSats,
              0,
            ),
          0,
        ),
      })),
    });
  });

  const selectedWorkflow = createMemo(() => {
    const target = selectedBoardKey();
    const workflows = view().workflows;

    return (
      workflows.find(
        (workflow) => workflow.key === target || workflow.id === target,
      ) ?? workflows[0]
    );
  });

  const root = createMemo(() => {
    const workflow = selectedWorkflow();

    return renderRoadmapWeb({
      ...view(),
      mode: 'board',
      workflows: workflow ? [workflow] : [],
    });
  });

  onMount(() => {
    void reloadRoadmapEvents({ showLoading: true });
  });

  createEffect(() => {
    const controller = new AbortController();
    const workflows = unverifiedView().workflows;
    const overrideUrl = import.meta.env.VITE_APPWEAVER_ROADMAP_LNURLP_URL?.trim();
    const requests: WorkflowZapSigner[] = workflows.flatMap((workflow) => {
      const lnurlUrl = overrideUrl ||
        (workflow.author.lud16
          ? lnurlpUrlFromLud16(workflow.author.lud16)
          : null) ||
        (workflow.author.lud06 ? workflow.author.lud06 : null);

      return lnurlUrl
        ? [{ projectAddress: workflow.projectAddress, lnurlpUrl: lnurlUrl }]
        : [];
    });

    void Promise.all(
      requests.map(async (request) => {
        try {
          const response = await fetch(request.lnurlpUrl, {
            signal: controller.signal,
          });

          logRoadmapDebug('lnurlp response', {
            url: request.lnurlpUrl,
            projectAddress: request.projectAddress,
            ok: response.ok,
            status: response.status,
          });

          const value = response.ok
            ? ((await response.json()) as LnurlpResponse)
            : null;

          const pubkey = value?.nostrPubkey;

          if (value?.allowsNostr === true && typeof pubkey === 'string') {
            logRoadmapDebug('lnurlp nostr pubkey accepted', {
              url: request.lnurlpUrl,
              projectAddress: request.projectAddress,
              nostrPubkey: pubkey,
            });

            return [request.projectAddress, pubkey] as const;
          }

          logRoadmapDebug('lnurlp nostr pubkey missing', {
            url: request.lnurlpUrl,
            projectAddress: request.projectAddress,
            allowsNostr: value?.allowsNostr ?? null,
            nostrPubkey: value?.nostrPubkey ?? null,
          });

          return null;
        } catch (err) {
          logRoadmapDebug('lnurlp fetch failed', {
            url: request.lnurlpUrl,
            projectAddress: request.projectAddress,
            error: err instanceof Error ? err.message : String(err),
          });

          return null;
        }
      }),
    ).then((entries) => {
      const next = new Map<string, Set<string>>();

      for (const entry of entries) {
        if (!entry) {
          continue;
        }

        const [projectAddress, pubkey] = entry;
        next.set(projectAddress, new Set([pubkey]));
      }

      setZapReceiptPubkeysByProjectAddress(next);
      setZapReceiptPubkeys(new Set([...next.values()].flatMap((set) => [...set])));
    });

    onCleanup(() => controller.abort());
  });

  createEffect(() => {
    const loadedEvents = events();
    let cancelled = false;

    const profileEvents = loadedEvents.filter(
      (event) => event.kind === PROFILE_KIND,
    );

    void Promise.all(
      profileEvents.map(async (event) => {
        let nip05: string | null = null;

        try {
          const content = JSON.parse(event.content) as { nip05?: unknown };

          nip05 = typeof content.nip05 === 'string' ? content.nip05 : null;
        } catch {
          nip05 = null;
        }

        return [
          event.pubkey,
          await verifiedNip05AuthorIdentity({ pubkey: event.pubkey, nip05 }),
        ] as const;
      }),
    ).then((entries) => {
      if (!cancelled) {
        setAuthorIdentities(new Map(entries));
      }
    });

    onCleanup(() => {
      cancelled = true;
    });
  });

  function runAction(action: WebAction): void {
    if (action.type === 'clientAction' && action.action === 'roadmap.lightningZap') {
      void handleRoadmapLightningZap({
        action,
        signEvent: (event: EventTemplate) =>
          signEventForLanding(event, { title: 'Sign zap request' }),
        setChromeWeb: setPaymentRoot,
        setChromeText: setPaymentText,
        setChromeError: setPaymentError,
        setChromeLoading: setPaymentLoading,
      });

      return;
    }

    if (action.type === 'clientAction' && action.action === 'roadmap.openFund') {
      const issueId = action.payload.issueId;
      const title = action.payload.title;
      const sats = action.payload.sats;
      const actionRelay = action.payload.relay;
      const actionRelays = action.payload.relays;

      setPaymentError(null);
      setPaymentText(null);
      setModalTitle('Roadmap payment');
      setPaymentRoot(
        renderRoadmapFundWeb({
          issueId: typeof issueId === 'string' ? issueId : '',
          title: typeof title === 'string' ? title : 'roadmap issue',
          sats: typeof sats === 'number' ? sats : 0,
          relay:
            typeof actionRelay === 'string'
              ? (normalizeRoadmapRelay(actionRelay) ?? relay())
              : relay(),
          relays: Array.isArray(actionRelays)
            ? actionRelays.filter((entry): entry is string => typeof entry === 'string')
            : activeRelays(),
        }),
      );

      return;
    }

    if (action.type === 'clientAction' && action.action === 'roadmap.openIssue') {
      setPaymentError(null);
      setPaymentText(null);
      setModalTitle('Roadmap issue');
      setPaymentRoot(
        renderRoadmapIssueModalWeb({
          issue: action.payload.issue as never,
          workflow: action.payload.workflow as never,
          relay:
            typeof action.payload.relay === 'string'
              ? action.payload.relay
              : relay(),
          boardKey:
            typeof action.payload.boardKey === 'string'
              ? action.payload.boardKey
              : props.boardKey,
          columnId:
            typeof action.payload.columnId === 'string'
              ? action.payload.columnId
              : null,
          focus:
            action.payload.focus === 'comments' || action.payload.focus === 'manage'
              ? action.payload.focus
              : 'activity',
          availableSignerPubkeys: availableSignerPubkeys(),
        }),
      );

      return;
    }

    if (action.type === 'clientAction' && action.action === 'roadmap.openNewIssue') {
      setPaymentError(null);
      setPaymentText(null);
      setModalTitle('New roadmap issue');
      setPaymentRoot(
        renderRoadmapNewIssueWeb({
          workflow: action.payload.workflow as never,
          relay:
            typeof action.payload.relay === 'string'
              ? action.payload.relay
              : relay(),
        }),
      );

      return;
    }

    if (action.type === 'clientAction' && action.action === 'roadmap.closeModal') {
      setPaymentRoot(null);
      setPaymentText(null);
      setPaymentError(null);
      setPaymentLoading(false);

      return;
    }

    if (
      action.type === 'clientAction' &&
      (action.action === 'roadmap.createIssue' ||
        action.action === 'roadmap.commentIssue' ||
        action.action === 'roadmap.markIssue' ||
        action.action === 'roadmap.trackIssue' ||
        action.action === 'roadmap.deleteIssue')
    ) {
      const deps = {
        action,
        signEvent: signEventForLanding,
        setChromeWeb: setPaymentRoot,
        setChromeText: setPaymentText,
        setChromeError: setPaymentError,
        setChromeLoading: setPaymentLoading,
        appendSystemMessage: (message: string) =>
          logRoadmapDebug('mutation published', { message }),
      };

      if (action.action === 'roadmap.createIssue') {
        void handleRoadmapCreateIssue(deps).then(() =>
          refreshAfterRoadmapMutation({
            issueId: null,
            title:
              typeof action.payload.title === 'string'
                ? action.payload.title
                : null,
            focus: 'activity',
          }),
        );
      } else if (action.action === 'roadmap.commentIssue') {
        void handleRoadmapCommentIssue(deps).then(() =>
          refreshAfterRoadmapMutation({
            issueId:
              typeof action.payload.issueId === 'string'
                ? action.payload.issueId
                : null,
            title: null,
            focus: 'comments',
          }),
        );
      } else if (action.action === 'roadmap.markIssue') {
        void handleRoadmapMarkIssue({
          ...deps,
          currentUserPubkey: currentUserPubkey(),
        }).then(() =>
          refreshAfterRoadmapMutation({
            issueId:
              typeof action.payload.issueId === 'string'
                ? action.payload.issueId
                : null,
            title: null,
            focus: 'manage',
          }),
        );
      } else if (action.action === 'roadmap.trackIssue') {
        void handleRoadmapTrackIssue({
          ...deps,
          currentUserPubkey: currentUserPubkey(),
        }).then(() =>
          refreshAfterRoadmapMutation({
            issueId:
              typeof action.payload.issueId === 'string'
                ? action.payload.issueId
                : null,
            title: null,
            focus: 'manage',
          }),
        );
      } else {
        void handleRoadmapDeleteIssue({
          ...deps,
          currentUserPubkey: currentUserPubkey(),
        });
      }

      return;
    }

    if (action.type === 'command' && action.command === 'roadmap') {
      if (action.subcommand === 'list') {
        setPaymentRoot(null);
        setSelectedBoardKey(props.boardKey);

        return;
      }

      if (action.subcommand === 'board') {
        const id = action.arguments?.id;

        if (typeof id === 'string' && id.trim()) {
          setPaymentRoot(null);
          setSelectedBoardKey(id);
        }

        return;
      }

      if (action.subcommand === 'fund' || action.subcommand === 'zap') {
        const issueId = action.arguments?.issueId;
        const title = action.options?.title;
        const sats = action.options?.sats;
        const actionRelay = action.options?.relay;
        const actionRelays = action.options?.relays;

        setPaymentError(null);
        setPaymentText(null);
        setModalTitle('Roadmap payment');
        setPaymentRoot(
          renderRoadmapFundWeb({
            issueId: typeof issueId === 'string' ? issueId : '',
            title: typeof title === 'string' ? title : 'roadmap issue',
            sats: typeof sats === 'number' ? sats : 0,
            relay:
              typeof actionRelay === 'string'
                ? (normalizeRoadmapRelay(actionRelay) ?? relay())
                : relay(),
            relays: Array.isArray(actionRelays)
              ? actionRelays.filter((entry): entry is string => typeof entry === 'string')
              : activeRelays(),
          }),
        );
      }
    }
  }

  return (
    <section class="roadmap-panel" aria-label={props.title}>
      <div class="roadmap-panel-copy">
        <h2 class="section-title short-viewport-section-title">{props.title}</h2>
      </div>
      <div class="roadmap-panel-frame">
        <Show when={error()}>
          {(message) => <div class="roadmap-panel-status">{message()}</div>}
        </Show>
        <Show when={!error()}>
          <Show
            when={!loading()}
            fallback={
              <div class="roadmap-panel-status">
                Loading roadmap from {relayLabel()}
              </div>
            }
          >
            <div class="web-surface roadmap-panel-surface">
              <WebNodeShadowRoot
                root={root()}
                stateScopeId={`landing-roadmap-${props.boardKey}`}
                renderSurface="dock"
                busy={loading()}
                onRunAction={runAction}
                onError={setError}
              />
            </div>
          </Show>
        </Show>
      </div>
      <Show when={paymentRoot() || paymentText() || paymentError()}>
        <div class="roadmap-payment-modal-backdrop">
          <div
            class="roadmap-payment-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Roadmap payment"
          >
            <div class="roadmap-payment-modal-header">
              <div class="roadmap-payment-modal-title">{modalTitle()}</div>
              <button
                class="roadmap-payment-modal-close"
                type="button"
                aria-label="Close"
                onClick={() => {
                  setPaymentRoot(null);
                  setPaymentText(null);
                  setPaymentError(null);
                  setPaymentLoading(false);
                }}
              >
                ✕
              </button>
            </div>
            <div class="modal-body web-surface roadmap-payment-modal-body">
              <Show when={paymentError()}>
                {(message) => <div class="roadmap-panel-status">{message()}</div>}
              </Show>
              <Show when={!paymentError() && paymentText()}>
                {(message) => <div class="roadmap-panel-status">{message()}</div>}
              </Show>
              <Show when={!paymentError() && !paymentText() && paymentRoot()}>
                {(modalRoot) => (
                  <WebNodeShadowRoot
                    root={modalRoot()}
                    stateScopeId={`landing-roadmap-payment-${props.boardKey}`}
                    renderSurface="modal"
                    busy={paymentLoading()}
                    onRunAction={runAction}
                    onError={setPaymentError}
                  />
                )}
              </Show>
            </div>
          </div>
        </div>
      </Show>
      <Show when={connectModalOpen()}>
        <ConnectModal auth={auth} onClose={closeConnectModal} />
      </Show>
      <Show when={unlockModalOpen() && auth.authState().status === 'locked'}>
        <UnlockModal auth={auth} onClose={closeUnlockModal} />
      </Show>
    </section>
  );
}
