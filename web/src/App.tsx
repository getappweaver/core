import type { JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';

import { useChat } from './chat/useChat';
import { ChromeOverlay } from './chrome/ChromeOverlay';
import { HeaderChrome } from './chrome/HeaderChrome';
import { useChrome } from './chrome/useChrome';
import {
  ensureCommandDetail as ensureCommandDetailFromCatalog,
  resolveCommandDetail as resolveCommandDetailFromCatalog,
} from './commands/catalog';
import type { ComposerAiState } from './commands/types';
import { useCommandForms } from './commands/useCommandForms';
import { useCommands } from './commands/useCommands';
import { Composer } from './components/Composer';
import { ComposerModelOverrideButton } from './components/ComposerModelOverrideButton';
import { TimelineView } from './components/timeline/TimelineView';
import { useComposer } from './composer/useComposer';
import { ConnectOverlays } from './connect/ConnectOverlays';
import { useConnect } from './connect/useConnect';
import { NostrAuthProvider, useNostrAuth } from './contexts/NostrAuthContext';
import { PaletteView } from './palette/PaletteView';
import { usePalette } from './palette/usePalette';
import { registerWebPushNotifications } from './register-web-push';
import { useSocket } from './socket/useSocket';
import { getStoryDomTarget } from './story/dom-targets';
import {
  emitStoryWalkthroughChange,
  emitStoryQuitRequested,
  emitStoryWidgetOpened,
  onStoryCloseWidgetRequested,
  onStoryClearPromptsRequested,
  onStoryWalkthroughChange,
} from './story/events';
import { canStorySandboxHandleCommand } from './story/sandbox';
import type { StoryWalkthroughState } from './story/types';
import { WalkthroughOverlay } from './story/WalkthroughOverlay';
import {
  appendSystemMessageToTimeline,
  useTimeline,
} from './timeline/useTimeline';
import { isPiperTtsEnabled, preparePiperTts } from './tts/piper';
import type { CommandPayload, CommandDetail, TimelineItem } from './types';
import {
  createId,
  defaultPayload,
  getSubcommandQueryFromPalette,
  hasMissingRequiredInputs,
  matchesCommandToken,
  mergeCommandPayload,
  payloadFromPathTokens,
  scoreCommandMatch,
  scoreSubcommandMatch,
} from './utils';

export function App(): JSX.Element {
  return (
    <NostrAuthProvider>
      <AppInner />
    </NostrAuthProvider>
  );
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }

  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}k`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return String(value);
}

function formatComposerContextStats(
  state: ComposerAiState | null,
): string | null {
  const stats = state?.contextStats;

  if (!stats) {
    return null;
  }

  if (stats.contextPercent === null) {
    return formatTokenCount(stats.tokensTotal);
  }

  return `${formatTokenCount(stats.tokensTotal)} (${Math.round(stats.contextPercent)}%)`;
}

function AppInner(): JSX.Element {
  const TIMELINE_STORAGE_KEY = 'appweaver.timeline-id';

  const initialTimelineId = (() => {
    const existing = window.localStorage.getItem(TIMELINE_STORAGE_KEY);

    if (existing && existing.trim().length > 0) {
      return existing;
    }

    const created = createId();
    window.localStorage.setItem(TIMELINE_STORAGE_KEY, created);

    return created;
  })();

  const auth = useNostrAuth();

  const [composerAiState, setComposerAiState] =
    createSignal<ComposerAiState | null>(null);

  let timelineEl: HTMLDivElement | undefined;
  let composerInputEl: HTMLTextAreaElement | undefined;

  const [commands, setCommands] = createSignal<CommandDetail[]>([]);

  const [timeline, setTimeline] = createSignal<TimelineItem[]>([
    {
      id: createId(),
      type: 'system',
      text: 'Ready. Use the / button to browse commands or type a message below.',
    },
  ]);

  const [composerText, setComposerText] = createSignal('');
  const [loadingCommands, setLoadingCommands] = createSignal(true);
  const [agentWorking, setAgentWorking] = createSignal(false);

  const [timelineScrolledAwayFromBottom, setTimelineScrolledAwayFromBottom] =
    createSignal(false);

  let timelineBottomFadeFrame: number | null = null;
  let timelineBottomScrollFrame: number | null = null;

  const [activeFormId, setActiveFormId] = createSignal<string | null>(null);

  const [pendingPromptRequestId, setPendingPromptRequestId] = createSignal<
    string | null
  >(null);

  const [headerMenusOpen, setHeaderMenusOpen] = createSignal(false);
  const [pushBusy, setPushBusy] = createSignal(false);
  const [piperTtsBusy, setPiperTtsBusy] = createSignal(false);

  const [piperTtsEnabled, setPiperTtsEnabled] =
    createSignal(isPiperTtsEnabled());

  const [storyWalkthrough, setStoryWalkthrough] =
    createSignal<StoryWalkthroughState | null>(null);

  const headerWidgetTargets = new Map<string, HTMLElement>();

  const [taskbarSingletonByKey, setTaskbarSingletonByKey] = createSignal<
    Record<string, { itemId: string; visible: boolean }>
  >({});

  const [timelineId] = createSignal<string>(initialTimelineId);

  const appendSystemMessage = (text: string): void => {
    appendSystemMessageToTimeline(setTimeline, createId, text);
  };

  const chrome = useChrome();

  const connect = useConnect({
    auth,
  });

  const {
    connectLabel,
    handleConnectMenuClick,
    isConnected,
    isDisconnected,
    manageTitle,
  } = connect;

  const {
    beginWebUiBusy,
    endWebUiBusy,
    isWebUiBusyFor,
    pendingRequests,
    requestComposerAiState,
    sendSocketMessage,
    useSocketLifecycle,
    webUiBusyDigest,
    wsConnected,
  } = useSocket({
    auth,
    setTimeline,
    timelineId,
    setCommands,
    setComposerAiState,
    setLoadingCommands,
    setAgentWorking,
    appendSystemMessage,
    createId,
    chat: {
      clearRequest: (requestId) => chat.clearRequest(requestId),
      handleStreamDiff: (files) => chat.handleStreamDiff(files),
      handleStreamTool: (requestId, tool) =>
        chat.handleStreamTool(requestId, tool),
      handleStreamTextDelta: (requestId, deltaText) =>
        chat.handleStreamTextDelta(requestId, deltaText),
    },
  });

  const chat = useChat({
    timelineId,
    setTimeline,
    createId,
    pendingRequests,
    sendSocketMessage,
    appendSystemMessage,
    setAgentWorking,
    onChatResult: requestComposerAiState,
  });

  const headerChromeWidgets = createMemo(() => {
    const out: Array<{
      command: string;
      subcommand: string;
      source: 'builtin' | 'plugin';
      pluginAlias?: string;
      surface: 'modal' | 'timeline_singleton';
      label: string;
      modalTitle: string;
      icon?: string;
      order?: number;
    }> = [];

    for (const cmd of commands()) {
      for (const sub of cmd.subcommands) {
        const w = sub.webWidget;

        if (w?.placement === 'header' && w.label) {
          out.push({
            command: cmd.name,
            subcommand: sub.name,
            source: cmd.source ?? 'builtin',
            pluginAlias: cmd.pluginAlias,
            surface: w.surface,
            label: w.label,
            modalTitle: w.modalTitle,
            icon: w.icon,
            order: w.order,
          });
        }
      }
    }

    return out;
  });

  const taskbarWidgets = createMemo(() => {
    const out: Array<{
      command: string;
      subcommand: string;
      label: string;
      modalTitle: string;
      icon?: string;
      order?: number;
    }> = [];

    for (const cmd of commands()) {
      for (const sub of cmd.subcommands) {
        const w = sub.webWidget;

        if (
          w?.placement === 'header' &&
          w.surface === 'timeline_singleton' &&
          w.label
        ) {
          out.push({
            command: cmd.name,
            subcommand: sub.name,
            label: w.label,
            modalTitle: w.modalTitle,
            icon: w.icon,
            order: w.order,
          });
        }
      }
    }

    return out;
  });

  function taskbarDockKey(command: string, subcommand: string): string {
    return `${command}:${subcommand}`;
  }

  function storyTargetHeaderWidgetKey(
    command: string,
    subcommand: string,
  ): string {
    return `${command}:${subcommand}`;
  }

  function storyWalkthroughTargetElement(): HTMLElement | null {
    const walkthrough = storyWalkthrough();

    if (walkthrough?.target?.type === 'web_node') {
      return getStoryDomTarget(walkthrough.target.targetId);
    }

    if (walkthrough?.target?.type !== 'header_widget') {
      return null;
    }

    const key = storyTargetHeaderWidgetKey(
      walkthrough.target.command,
      walkthrough.target.subcommand,
    );

    const selector = `[data-story-target="header-widget:${CSS.escape(key)}"]`;

    const visibleTarget = [
      ...document.querySelectorAll<HTMLElement>(selector),
    ].find((el) => el.offsetParent !== null);

    return visibleTarget ?? headerWidgetTargets.get(key) ?? null;
  }

  function isTaskbarSubcommand(command: string, subcommand: string): boolean {
    return taskbarWidgets().some(
      (w) => w.command === command && w.subcommand === subcommand,
    );
  }

  function isHeaderWidgetActive(widget: {
    command: string;
    subcommand: string;
    surface: 'modal' | 'timeline_singleton';
  }): boolean {
    if (widget.surface !== 'timeline_singleton') {
      return false;
    }

    const key = taskbarDockKey(widget.command, widget.subcommand);

    return taskbarSingletonByKey()[key]?.visible === true;
  }

  function isTimelineCommandResultHidden(
    item: Extract<TimelineItem, { type: 'command_result' }>,
  ): boolean {
    const key = item.timelineSingletonKey;

    if (!key) {
      return false;
    }

    return taskbarSingletonByKey()[key]?.visible !== true;
  }

  function scheduleTimelineBottomFadeUpdate(): void {
    if (timelineBottomFadeFrame !== null) {
      return;
    }

    timelineBottomFadeFrame = requestAnimationFrame(() => {
      timelineBottomFadeFrame = null;
      updateTimelineBottomFade();
    });
  }

  function scrollTimelineToBottomSoon(): void {
    if (timelineBottomScrollFrame !== null) {
      return;
    }

    timelineBottomScrollFrame = requestAnimationFrame(() => {
      timelineBottomScrollFrame = null;

      if (timelineEl) {
        timelineEl.scrollTop = timelineEl.scrollHeight;
        scheduleTimelineBottomFadeUpdate();
      }
    });
  }

  function updateTimelineBottomFade(): void {
    if (!timelineEl) {
      if (timelineScrolledAwayFromBottom()) {
        setTimelineScrolledAwayFromBottom(false);
      }

      return;
    }

    const remaining =
      timelineEl.scrollHeight - timelineEl.scrollTop - timelineEl.clientHeight;

    const next = remaining > 2;

    if (timelineScrolledAwayFromBottom() !== next) {
      setTimelineScrolledAwayFromBottom(next);
    }
  }

  function hideAllTaskbarPanels(): void {
    const bottomTimelineItemId = timeline().at(-1)?.id;

    setTaskbarSingletonByKey((prev) => {
      const next: Record<string, { itemId: string; visible: boolean }> = {};
      let changed = false;
      for (const [key, entry] of Object.entries(prev)) {
        if (entry.itemId !== bottomTimelineItemId && entry.visible) {
          changed = true;
          next[key] = { ...entry, visible: false };
        } else {
          next[key] = entry;
        }
      }

      return changed ? next : prev;
    });
  }

  function activateSingleTaskbarKey(
    key: string,
    itemId: string,
    visible: boolean,
  ): void {
    setTaskbarSingletonByKey((prev) => {
      const next: Record<string, { itemId: string; visible: boolean }> = {};

      for (const [entryKey, entry] of Object.entries(prev)) {
        if (entryKey === key) {
          next[entryKey] = { itemId, visible };
          continue;
        }

        next[entryKey] = { ...entry, visible: false };
      }

      if (!(key in next)) {
        next[key] = { itemId, visible };
      }

      return next;
    });
  }

  function setTaskbarDockResult(params: {
    command: string;
    subcommand: string;
    values: CommandPayload;
    output: import('./commands/types').SplitCommandOutput;
    visible: boolean;
  }): void {
    const key = taskbarDockKey(params.command, params.subcommand);
    const existing = taskbarSingletonByKey()[key];

    if (existing) {
      setTimeline((prev) => {
        const rest: TimelineItem[] = [];
        let singleton: Extract<
          TimelineItem,
          { type: 'command_result' }
        > | null = null;
        for (const item of prev) {
          if (item.type === 'command_result' && item.id === existing.itemId) {
            singleton = {
              ...item,
              values: params.values,
              text: params.output.text,
              web: params.output.web,
              clientView: params.output.clientView,
              timelineSingletonKey: key,
            };

            continue;
          }

          rest.push(item);
        }

        return singleton ? [...rest, singleton] : prev;
      });

      activateSingleTaskbarKey(key, existing.itemId, params.visible);
      scrollTimelineToBottomSoon();

      return;
    }

    const itemId = createId();

    setTimeline((prev) => [
      ...prev,
      {
        id: itemId,
        type: 'command_result',
        command: params.command,
        subcommand: params.subcommand,
        subcommandTag: params.subcommand,
        values: params.values,
        text: params.output.text,
        web: params.output.web,
        clientView: params.output.clientView,
        timelineSingletonKey: key,
      },
    ]);

    activateSingleTaskbarKey(key, itemId, params.visible);
    scrollTimelineToBottomSoon();
  }

  function closeTaskbarWidget(command: string, subcommand: string): void {
    const key = taskbarDockKey(command, subcommand);
    const existing = taskbarSingletonByKey()[key];

    setTaskbarSingletonByKey((prev) => {
      const next = { ...prev };
      delete next[key];

      return next;
    });

    if (!existing) {
      return;
    }

    setTimeline((prev) => prev.filter((item) => item.id !== existing.itemId));
  }

  async function toggleTaskbarWidget(widget: {
    command: string;
    subcommand: string;
    label: string;
  }): Promise<void> {
    const key = taskbarDockKey(widget.command, widget.subcommand);

    if (canStorySandboxHandleCommand(widget.command, widget.subcommand)) {
      setTaskbarSingletonByKey((prev) => {
        const rest = { ...prev };
        delete rest[key];

        return rest;
      });

      setTimeline((prev) =>
        prev.filter(
          (item) =>
            item.type !== 'command_result' || item.timelineSingletonKey !== key,
        ),
      );

      const commandDetail = await ensureCommandDetail(widget.command);

      const subcommand = commandDetail?.subcommands.find(
        (entry) => entry.name === widget.subcommand,
      );

      if (!subcommand) {
        appendSystemMessage(
          `Unable to open /${widget.command} ${widget.subcommand} taskbar widget.`,
        );

        return;
      }

      await runCommand(widget.command, subcommand, defaultPayload(subcommand));

      emitStoryWidgetOpened({
        type: 'widget_opened',
        command: widget.command,
        subcommand: widget.subcommand,
      });

      return;
    }

    const existing = taskbarSingletonByKey()[key];

    const hasTimelineItem =
      existing !== undefined &&
      timeline().some(
        (item) => item.type === 'command_result' && item.id === existing.itemId,
      );

    if (existing && !hasTimelineItem) {
      setTaskbarSingletonByKey((prev) => {
        const rest = { ...prev };
        delete rest[key];

        return rest;
      });
    }

    if (existing && hasTimelineItem) {
      const nextVisible = !existing.visible;

      if (nextVisible) {
        setTimeline((prev) => {
          const rest: TimelineItem[] = [];
          let singleton: Extract<
            TimelineItem,
            { type: 'command_result' }
          > | null = null;
          for (const item of prev) {
            if (item.type === 'command_result' && item.id === existing.itemId) {
              singleton = item;
              continue;
            }

            rest.push(item);
          }

          return singleton ? [...rest, singleton] : prev;
        });

        scrollTimelineToBottomSoon();
      }

      activateSingleTaskbarKey(key, existing.itemId, nextVisible);

      if (nextVisible) {
        emitStoryWidgetOpened({
          type: 'widget_opened',
          command: widget.command,
          subcommand: widget.subcommand,
        });
      }

      return;
    }

    const commandDetail = await ensureCommandDetail(widget.command);

    const subcommand = commandDetail?.subcommands.find(
      (entry) => entry.name === widget.subcommand,
    );

    if (!subcommand) {
      appendSystemMessage(
        `Unable to open /${widget.command} ${widget.subcommand} taskbar widget.`,
      );

      return;
    }

    await runCommand(widget.command, subcommand, defaultPayload(subcommand));

    emitStoryWidgetOpened({
      type: 'widget_opened',
      command: widget.command,
      subcommand: widget.subcommand,
    });
  }

  async function refreshComposerAiState(): Promise<void> {
    if (auth.authState().status !== 'connected' || !wsConnected()) {
      setComposerAiState(null);

      return;
    }

    requestComposerAiState();
  }

  function saveTimelineFormBridge(
    item: Extract<TimelineItem, { type: 'command_form' }>,
  ): void {
    saveTimelineForm(item);
  }

  const {
    closeChromeModal,
    openChromeWidget,
    runCommand,
    runJsonCommand,
    runWebAction,
  } = useCommands({
    authStatus: () => auth.authState().status,
    wsConnected,
    timelineId,
    pendingPromptRequestId,
    setPendingPromptRequestId,
    setComposerText,
    chromePromptSession: chrome.chromePromptSession,
    setChromePromptSession: chrome.setChromePromptSession,
    setChromeModal: chrome.setChromeModal,
    setChromeLoading: chrome.setChromeLoading,
    setChromeError: chrome.setChromeError,
    setChromeText: chrome.setChromeText,
    setChromeWeb: chrome.setChromeWeb,
    setTimeline,
    setComposerAiState,
    appendSystemMessage,
    createId,
    requestComposerAiState,
    beginWebUiBusy,
    endWebUiBusy,
    pendingRequests,
    sendSocketMessage,
    runOpenCommandFormFromWebCommand: (action) =>
      openCommandFormFromWebCommand(action),
    isTaskbarSubcommand,
    setTaskbarDockResult,
  });

  const resolveCommandDetail = (name: string) =>
    resolveCommandDetailFromCatalog(commands, name);

  const ensureCommandDetail = (name: string) =>
    ensureCommandDetailFromCatalog(commands, name);

  const {
    deleteTimelineItem,
    repeatTimelineSubcommand,
    replaceCommandResultWeb,
    saveTimelineForm,
    submitForm,
    updateFormValue,
  } = useTimeline({
    timeline,
    timelineId,
    setTimeline,
    setActiveFormId,
    createId,
    pendingRequests,
    sendSocketMessage,
    runCommand,
    defaultPayload,
    resolveCommandDetail,
  });

  const palette = usePalette({
    commands,
    setComposerText,
    ensureCommandDetail,
    matchesCommandToken,
    scoreCommandMatch,
    getSubcommandQueryFromPalette,
    scoreSubcommandMatch,
    payloadFromPathTokens,
    openSubcommand: (...args) => openSubcommand(...args),
  });

  const {
    closePalette,
    openPalette,
    openPaletteForCommand,
    paletteOpen,
    selectedCommand,
  } = palette;

  const { chooseSubcommand, openCommandFormFromWebCommand, openSubcommand } =
    useCommandForms({
      selectedCommand,
      composerAiState,
      setTimeline,
      setComposerText,
      setActiveFormId,
      appendSystemMessage,
      createId,
      closePalette,
      runCommand,
      saveTimelineForm: saveTimelineFormBridge,
      defaultPayload,
      mergeCommandPayload,
      hasMissingRequiredInputs,
      ensureCommandDetail,
    });

  const { submitComposer, useComposerFocus } = useComposer({
    composerText,
    pendingPromptRequestId,
    setComposerText,
    setPendingPromptRequestId,
    appendSystemMessage,
    chat,
    chrome,
    palette,
    ensureCommandDetail,
    openSubcommand: (...args) => openSubcommand(...args),
    payloadFromPathTokens,
  });

  useComposerFocus({
    blocked: () =>
      paletteOpen() || activeFormId() !== null || headerMenusOpen(),
    focusInput: () => composerInputEl?.focus(),
  });

  useSocketLifecycle();

  let previousTimelineLength = 0;

  createEffect(
    on(timeline, (items) => {
      const length = items.length;
      const grew = length > previousTimelineLength;
      previousTimelineLength = length;

      if (!timelineScrolledAwayFromBottom()) {
        scrollTimelineToBottomSoon();
      }

      if (!grew) {
        return;
      }

      hideAllTaskbarPanels();
    }),
  );

  createEffect(
    on(timeline, () => {
      scheduleTimelineBottomFadeUpdate();
    }),
  );

  onMount(() => {
    timelineEl?.addEventListener('scroll', scheduleTimelineBottomFadeUpdate, {
      passive: true,
    });

    window.addEventListener('resize', scheduleTimelineBottomFadeUpdate);
    updateTimelineBottomFade();

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      openPalette();
    };

    const handleComposerAiStateRefreshRequest = () => {
      void refreshComposerAiState();
    };

    window.addEventListener('keydown', handleGlobalKeyDown);

    window.addEventListener(
      'composer-ai-state-refresh-requested',
      handleComposerAiStateRefreshRequest,
    );

    const stopStoryWalkthroughListener = onStoryWalkthroughChange((state) => {
      setStoryWalkthrough(state);
    });

    const stopStoryCloseWidgetListener = onStoryCloseWidgetRequested(
      (event) => {
        closeTaskbarWidget(event.command, event.subcommand);
      },
    );

    const stopStoryClearPromptsListener = onStoryClearPromptsRequested(() => {
      setTimeline((prev) => prev.filter((item) => item.type !== 'prompt'));
    });

    onCleanup(() => {
      if (timelineBottomFadeFrame !== null) {
        cancelAnimationFrame(timelineBottomFadeFrame);
        timelineBottomFadeFrame = null;
      }

      if (timelineBottomScrollFrame !== null) {
        cancelAnimationFrame(timelineBottomScrollFrame);
        timelineBottomScrollFrame = null;
      }

      timelineEl?.removeEventListener(
        'scroll',
        scheduleTimelineBottomFadeUpdate,
      );

      window.removeEventListener('resize', scheduleTimelineBottomFadeUpdate);

      window.removeEventListener('keydown', handleGlobalKeyDown);

      window.removeEventListener(
        'composer-ai-state-refresh-requested',
        handleComposerAiStateRefreshRequest,
      );

      stopStoryWalkthroughListener();
      stopStoryCloseWidgetListener();
      stopStoryClearPromptsListener();
    });
  });

  createEffect(() => {
    const status = auth.authState().status;

    if (status !== 'connected' || !wsConnected()) {
      return;
    }

    void refreshComposerAiState();
  });

  createEffect(() => {
    setTaskbarSingletonByKey((prev) => {
      const liveIds = new Set(
        timeline()
          .filter((item) => item.type === 'command_result')
          .map((item) => item.id),
      );

      let changed = false;
      const next: Record<string, { itemId: string; visible: boolean }> = {};
      for (const [key, entry] of Object.entries(prev)) {
        if (liveIds.has(entry.itemId)) {
          next[key] = entry;
        } else {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  });

  async function onEnablePush(): Promise<void> {
    setPushBusy(true);

    try {
      const result = await registerWebPushNotifications();

      if (result.status === 'ok') {
        appendSystemMessage(
          'Push: subscribed. Alerts use the browser push service (not the WebSocket). If nothing shows, run the bot with DEBUG=1 and send a test DM — check terminal for “Web push”.',
        );
      } else if (result.status === 'disabled') {
        appendSystemMessage(
          'Push: server VAPID not configured (set BOT_WEB_PUSH_PUBLIC_KEY, BOT_WEB_PUSH_PRIVATE_KEY, BOT_WEB_PUSH_SUBJECT on the bot).',
        );
      } else if (result.status === 'denied') {
        appendSystemMessage('Push: notification permission was denied.');
      } else if (result.status === 'unsupported') {
        appendSystemMessage('Push: not supported in this browser.');
      } else if (result.status === 'bad_payload') {
        appendSystemMessage(
          'Push: browser returned an invalid subscription object (missing endpoint or keys).',
        );
      } else {
        appendSystemMessage(
          `Push: failed — ${result.message}. Open DevTools → Network, find POST /api/push/subscribe (NIP-98 must be 200).`,
        );
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function onEnablePiperTts(): Promise<void> {
    if (piperTtsBusy()) {
      return;
    }

    setPiperTtsBusy(true);

    try {
      await preparePiperTts();
      setPiperTtsEnabled(true);
      appendSystemMessage('Piper TTS is ready. Speech buttons will use Piper.');
    } catch (err) {
      appendSystemMessage(
        `Piper TTS failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setPiperTtsBusy(false);
    }
  }

  return (
    <div class="app-shell" data-web-ui-busy-digest={webUiBusyDigest()}>
      <HeaderChrome
        widgets={headerChromeWidgets}
        isWidgetActive={isHeaderWidgetActive}
        wsConnected={wsConnected}
        isConnected={isConnected}
        isDisconnected={isDisconnected}
        connectLabel={connectLabel}
        manageTitle={manageTitle}
        pushBusy={pushBusy}
        piperTtsBusy={piperTtsBusy}
        piperTtsEnabled={piperTtsEnabled}
        onWidgetElement={(widget, el) => {
          const key = storyTargetHeaderWidgetKey(
            widget.command,
            widget.subcommand,
          );

          if (el) {
            headerWidgetTargets.set(key, el);
          } else {
            headerWidgetTargets.delete(key);
          }
        }}
        onOpenWidget={(w) => {
          if (w.surface === 'timeline_singleton') {
            void toggleTaskbarWidget(w);

            return;
          }

          openChromeWidget({
            command: w.command,
            subcommand: w.subcommand,
            title: w.modalTitle,
          });

          emitStoryWidgetOpened({
            type: 'widget_opened',
            command: w.command,
            subcommand: w.subcommand,
          });
        }}
        onConnect={handleConnectMenuClick}
        onLogout={() => auth.logout()}
        onEnablePush={() => {
          void onEnablePush();
        }}
        onEnablePiperTts={() => {
          void onEnablePiperTts();
        }}
        onAnyMenuOpenChange={setHeaderMenusOpen}
      />
      <main class="chat-shell">
        <TimelineView
          activeFormId={activeFormId()}
          timeline={timeline()}
          showBottomFade={timelineScrolledAwayFromBottom()}
          isTimelineItemHidden={isTimelineCommandResultHidden}
          setTimelineRef={(el) => {
            timelineEl = el;
          }}
          onOpenCommand={(command) => void openPaletteForCommand(command)}
          onRepeatSubcommand={(item) => void repeatTimelineSubcommand(item)}
          onDeleteTimelineItem={deleteTimelineItem}
          onReplaceCommandWeb={replaceCommandResultWeb}
          onAppendSystem={appendSystemMessage}
          isWebUiBusy={isWebUiBusyFor}
          onRunWebAction={runWebAction}
          onRunJsonCommand={runJsonCommand}
          onUpdateFormValue={updateFormValue}
          onSubmitForm={(itemId) => void submitForm(itemId)}
        />
        <Composer
          setInputRef={(el) => {
            composerInputEl = el;
          }}
          value={composerText()}
          footer={
            <div class="composer-meta">
              <button
                type="button"
                class="composer-chip"
                classList={{
                  'composer-chip--info':
                    composerAiState()?.executionProfileColor === 'info',
                  'composer-chip--warning':
                    composerAiState()?.executionProfileColor === 'warning',
                  'composer-chip--danger':
                    composerAiState()?.executionProfileColor === 'danger',
                  'composer-chip--success':
                    composerAiState()?.executionProfileColor === 'success',
                }}
                disabled={!wsConnected()}
                onClick={() => {
                  openChromeWidget({
                    command: 'ai',
                    subcommand: 'agents',
                    title: 'OpenCode Agents',
                  });
                }}
                title={
                  wsConnected()
                    ? 'Open OpenCode agent manager'
                    : 'Connect WebSocket first'
                }
              >
                {composerAiState()
                  ? composerAiState()!.executionProfileName
                  : 'Agent'}
              </button>
              <Show when={composerAiState() !== null}>
                <ComposerModelOverrideButton
                  state={composerAiState()!}
                  wsConnected={wsConnected()}
                  onRunWebAction={runWebAction}
                />
                <span class="composer-meta-text composer-meta-text--muted">
                  {composerAiState()!.provider}
                </span>
                <Show when={formatComposerContextStats(composerAiState())}>
                  {(contextLabel) => (
                    <span
                      class="composer-meta-text composer-meta-text--muted composer-meta-text--context"
                      title="Latest OpenCode SDK assistant-message token total and model context usage"
                    >
                      {contextLabel()}
                    </span>
                  )}
                </Show>
              </Show>
              <Show when={agentWorking()}>
                <span class="composer-working" aria-live="polite">
                  AI
                  <span class="composer-working-dots" aria-hidden="true" />
                  <button
                    class="composer-working-cancel"
                    type="button"
                    aria-label="Cancel"
                    onClick={() => chat.cancelChat()}
                  >
                    ×
                  </button>
                </span>
              </Show>
            </div>
          }
          onOpenPalette={openPalette}
          onInput={(event) => {
            const value = event.currentTarget.value;
            setComposerText(value);

            if (value.startsWith('/')) {
              openPalette();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submitComposer();
            }
          }}
        />
      </main>
      <PaletteView
        palette={palette}
        loadingCommands={loadingCommands()}
        notConnected={auth.authState().status !== 'connected'}
        onChooseSubcommand={(subcommand) => void chooseSubcommand(subcommand)}
      />
      <ConnectOverlays auth={auth} connect={connect} />
      <ChromeOverlay
        chrome={chrome}
        isWebUiBusy={isWebUiBusyFor}
        onClose={closeChromeModal}
        onRunWebAction={runWebAction}
      />
      <Show when={storyWalkthrough()}>
        {(walkthrough) => (
          <WalkthroughOverlay
            state={walkthrough()}
            targetEl={storyWalkthroughTargetElement()}
            onQuit={() => {
              emitStoryQuitRequested(walkthrough().storyId);
              emitStoryWalkthroughChange(null);
            }}
            onStartStory={(storyId) => {
              emitStoryWalkthroughChange(null);

              void (async () => {
                const command = await ensureCommandDetail('story');

                const subcommand = command?.subcommands.find(
                  (entry) => entry.name === 'start',
                );

                if (!subcommand) {
                  appendSystemMessage('Unable to start the next story.');

                  return;
                }

                await runCommand('story', subcommand, {
                  arguments: { id: storyId },
                  options: {},
                });
              })();
            }}
          />
        )}
      </Show>
    </div>
  );
}
