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
import { ComposerContextMenuButton } from './components/ComposerContextMenuButton';
import { ComposerModelOverrideButton } from './components/ComposerModelOverrideButton';
import { ComposerWorkingButton } from './components/ComposerWorkingButton';
import { NostrSearchRelaysModal } from './components/NostrSearchRelaysModal';
import { TimelineView } from './components/timeline/TimelineView';
import { useComposer } from './composer/useComposer';
import { ConnectOverlays } from './connect/ConnectOverlays';
import { useConnect } from './connect/useConnect';
import { NostrAuthProvider, useNostrAuth } from './contexts/NostrAuthContext';
import { isEmbeddedWebDemoMode, isWebDemoMode } from './demo/runtime';
import {
  clampDockWidth,
  DESKTOP_LAYOUT_STORAGE_KEY,
  type DockPosition,
  type LayoutPrefs,
  readLayoutPrefs,
} from './layout/desktopLayoutPrefs';
import {
  SingletonDock,
  type DockedWidgetCard,
  type SingletonWidgetEntry,
  type TaskbarWidget,
} from './layout/SingletonDock';
import { PaletteView } from './palette/PaletteView';
import { usePalette } from './palette/usePalette';
import { registerWebPushNotifications } from './register-web-push';
import { SetupView } from './setup/SetupView';
import { useSocket } from './socket/useSocket';
import { getStoryDomTarget } from './story/dom-targets';
import {
  emitStoryWalkthroughChange,
  emitStoryQuitRequested,
  emitStoryFillForm,
  emitStoryPassivePlaybackDiagnostic,
  emitStoryTargetHovered,
  emitStoryWidgetOpened,
  onStoryPassivePlaybackChange,
  onStoryCloseWidgetRequested,
  onStoryClearPromptsRequested,
  onStoryWalkthroughChange,
} from './story/events';
import { setStoryOpenWidgets } from './story/open-widgets';
import { canStorySandboxHandleCommand } from './story/sandbox';
import type {
  StoryPassivePlaybackState,
  StoryWalkthroughState,
} from './story/types';
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
  fetchJson,
  getSubcommandQueryFromPalette,
  hasMissingRequiredInputs,
  matchesCommandToken,
  mergeCommandPayload,
  payloadFromPathTokens,
  scoreCommandMatch,
  scoreSubcommandMatch,
} from './utils';

export function App(): JSX.Element {
  if (window.location.pathname === '/setup') {
    return (
      <NostrAuthProvider>
        <SetupView />
      </NostrAuthProvider>
    );
  }

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

type DockResizeState = {
  startClientX: number;
  startWidthPx: number;
  position: Exclude<DockPosition, 'hidden'>;
};

type HeaderWidget = {
  command: string;
  subcommand: string;
  source: 'builtin' | 'plugin';
  pluginAlias?: string;
  surface: 'modal' | 'timeline_singleton';
  label: string;
  modalTitle: string;
  icon?: string;
  order?: number;
};

type CoreUpdateResponse = {
  ok: boolean;
  update: {
    state: 'checking' | 'available' | 'up_to_date' | 'unavailable';
  } | null;
};

type DemoWidgetQuery = {
  commandToken: string;
  subcommandToken: string | null;
};

type CommandResultTimelineItem = Extract<
  TimelineItem,
  { type: 'command_result' }
>;

const LAYOUT_SETTINGS_TIMELINE_ID = 'layout-settings';

function cleanQueryToken(value: string | null): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function parseDemoWidgetQuery(search: string): DemoWidgetQuery | null {
  const params = new URLSearchParams(search);

  const commandToken = cleanQueryToken(
    params.get('command') ?? params.get('cmd') ?? params.get('plugin'),
  );

  const subcommandToken = cleanQueryToken(
    params.get('subcommand') ??
      params.get('sub') ??
      (commandToken ? params.get('widget') : null),
  );

  if (commandToken) {
    return { commandToken, subcommandToken };
  }

  const widgetToken = cleanQueryToken(
    params.get('widget') ?? params.get('openWidget'),
  );

  if (!widgetToken) {
    return null;
  }

  const [widgetCommand, ...widgetRest] = widgetToken.split(/[/:\s]+/);
  const widgetSubcommand = widgetRest.join(' ');

  return {
    commandToken: widgetCommand!,
    subcommandToken: cleanQueryToken(widgetSubcommand),
  };
}

function AppInner(): JSX.Element {
  const TIMELINE_STORAGE_KEY = 'appweaver.timeline-id';
  const PIPER_TTS_AUTO_ATTEMPTED_KEY = 'appweaver.tts.piper-auto-attempted';

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

  const demoWidgetQuery = isWebDemoMode()
    ? parseDemoWidgetQuery(window.location.search)
    : null;

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

  const [nostrSearchRelaysOpen, setNostrSearchRelaysOpen] = createSignal(false);

  const [pushBusy, setPushBusy] = createSignal(false);
  const [piperTtsBusy, setPiperTtsBusy] = createSignal(false);
  const [coreUpdateAvailable, setCoreUpdateAvailable] = createSignal(false);

  const [piperTtsEnabled, setPiperTtsEnabled] =
    createSignal(isPiperTtsEnabled());

  const [storyWalkthrough, setStoryWalkthrough] =
    createSignal<StoryWalkthroughState | null>(null);

  const [passivePlayback, setPassivePlayback] =
    createSignal<StoryPassivePlaybackState | null>(null);

  const [passiveCursor, setPassiveCursor] = createSignal<{
    x: number;
    y: number;
    visible: boolean;
    pressed: boolean;
    rippleKey: number;
  }>({ x: 36, y: 92, visible: false, pressed: false, rippleKey: 0 });

  const [lastPassiveActionKey, setLastPassiveActionKey] = createSignal<
    string | null
  >(null);

  const PASSIVE_CURSOR_ACTION_DELAY_MS = 620;
  const PASSIVE_TARGET_SCROLL_WAIT_MS = 2000;

  const [compactSessionRequestId, setCompactSessionRequestId] = createSignal<
    string | null
  >(null);

  let passiveActionQueue = Promise.resolve();
  let passiveHoveredElement: HTMLElement | null = null;

  const headerWidgetTargets = new Map<string, HTMLElement>();

  const [taskbarSingletonByKey, setTaskbarSingletonByKey] = createSignal<
    Record<string, SingletonWidgetEntry>
  >({});

  const [dockWidgetItemsByKey, setDockWidgetItemsByKey] = createSignal<
    Record<string, CommandResultTimelineItem>
  >({});

  const [layoutPrefs, setLayoutPrefs] =
    createSignal<LayoutPrefs>(readLayoutPrefs());

  const [desktopLayoutEnabled, setDesktopLayoutEnabled] = createSignal(false);
  const [desktopLayoutReady, setDesktopLayoutReady] = createSignal(false);

  const [demoQueryWidgetOpenedKey, setDemoQueryWidgetOpenedKey] = createSignal<
    string | null
  >(null);

  const [expandedDockWidgetKeys, setExpandedDockWidgetKeys] = createSignal<
    string[]
  >([]);

  const [timelineId] = createSignal<string>(initialTimelineId);

  let dockResizeState: DockResizeState | null = null;
  const dockCardElements = new Map<string, HTMLElement>();

  const dockVisible = createMemo(
    () => desktopLayoutEnabled() && layoutPrefs().dockPosition !== 'hidden',
  );

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
      handleStreamDiff: (requestId, files) =>
        chat.handleStreamDiff(requestId, files),
      handleStreamTool: (requestId, tool) =>
        chat.handleStreamTool(requestId, tool),
      handleStreamReasoningDelta: (requestId, deltaText) =>
        chat.handleStreamReasoningDelta(requestId, deltaText),
      handleStreamSummary: (requestId, id, text) =>
        chat.handleStreamSummary(requestId, id, text),
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

  const demoHiddenHeaderWidgets = new Set([
    'bot:status',
    'plugins:install',
    'roadmap:list',
  ]);

  const headerChromeWidgets = createMemo<HeaderWidget[]>(() => {
    const out: HeaderWidget[] = [];

    for (const cmd of commands()) {
      for (const sub of cmd.subcommands) {
        const w = sub.webWidget;

        if (
          w?.placement === 'header' &&
          w.label &&
          (!isWebDemoMode() ||
            !demoHiddenHeaderWidgets.has(`${cmd.name}:${sub.name}`))
        ) {
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

    return out.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  });

  const visibleHeaderChromeWidgets = createMemo(() =>
    dockVisible()
      ? headerChromeWidgets().filter((w) => !isDockRoutedWidget(w))
      : headerChromeWidgets(),
  );

  function isDockRoutedWidget(widget: {
    command: string;
    subcommand: string;
    surface: 'modal' | 'timeline_singleton';
  }): boolean {
    return (
      widget.surface === 'timeline_singleton' ||
      (widget.command === 'file' && widget.subcommand === 'tree')
    );
  }

  const taskbarWidgets = createMemo<TaskbarWidget[]>(() => {
    const out: TaskbarWidget[] = [];

    for (const cmd of commands()) {
      for (const sub of cmd.subcommands) {
        const w = sub.webWidget;

        if (
          w?.placement === 'header' &&
          isDockRoutedWidget({
            command: cmd.name,
            subcommand: sub.name,
            surface: w.surface,
          }) &&
          (!isWebDemoMode() ||
            !demoHiddenHeaderWidgets.has(`${cmd.name}:${sub.name}`)) &&
          w.label
        ) {
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

    return out.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  });

  function tokenMatches(value: string | undefined, token: string): boolean {
    return value?.toLowerCase() === token.toLowerCase();
  }

  function resolveDemoQueryWidget(query: DemoWidgetQuery): HeaderWidget | null {
    const command = commands().find(
      (entry) =>
        tokenMatches(entry.name, query.commandToken) ||
        tokenMatches(entry.pluginAlias, query.commandToken) ||
        entry.aliases.some((alias) => tokenMatches(alias, query.commandToken)),
    );

    if (!command) {
      return null;
    }

    const subcommand = command.subcommands.find((entry) => {
      if (!entry.webWidget || entry.webWidget.placement !== 'header') {
        return false;
      }

      if (!query.subcommandToken) {
        return true;
      }

      return (
        tokenMatches(entry.name, query.subcommandToken) ||
        entry.aliases.some((alias) =>
          tokenMatches(alias, query.subcommandToken ?? ''),
        )
      );
    });

    const widget = subcommand?.webWidget;

    if (
      !subcommand ||
      !widget ||
      widget.placement !== 'header' ||
      !widget.label
    ) {
      return null;
    }

    return {
      command: command.name,
      subcommand: subcommand.name,
      source: command.source ?? 'builtin',
      pluginAlias: command.pluginAlias,
      surface: widget.surface,
      label: widget.label,
      modalTitle: widget.modalTitle,
      icon: widget.icon,
      order: widget.order,
    };
  }

  const dockedWidgetCards = createMemo<DockedWidgetCard[]>(() => {
    const dockItems = dockWidgetItemsByKey();

    return taskbarWidgets().reduce<DockedWidgetCard[]>((out, widget) => {
      const key = taskbarDockKey(widget.command, widget.subcommand);
      const entry = taskbarSingletonByKey()[key];
      const item = dockItems[key];

      if (entry && item && item.id === entry.itemId) {
        out.push({ key, widget, entry, item });
      }

      return out;
    }, []);
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

  function storyPassivePlaybackTargetElement(): HTMLElement | null {
    const playback = passivePlayback();

    if (playback?.target?.type === 'web_node') {
      return getStoryDomTarget(playback.target.targetId);
    }

    if (playback?.target?.type !== 'header_widget') {
      return null;
    }

    const key = storyTargetHeaderWidgetKey(
      playback.target.command,
      playback.target.subcommand,
    );

    const selector = `[data-story-target="header-widget:${CSS.escape(key)}"]`;

    const visibleTarget = [
      ...document.querySelectorAll<HTMLElement>(selector),
    ].find((el) => el.offsetParent !== null);

    return visibleTarget ?? headerWidgetTargets.get(key) ?? null;
  }

  function movePassiveCursorToTarget(): void {
    const playback = passivePlayback();

    if (!isWebDemoMode() || !playback || playback.complete) {
      setPassiveCursor((prev) => ({ ...prev, visible: false }));

      return;
    }

    if (!playback.target) {
      return;
    }

    const target = storyPassivePlaybackTargetElement();

    if (!target) {
      emitStoryPassivePlaybackDiagnostic({
        storyId: playback.storyId,
        stepIndex: playback.stepIndex,
        message: `Missing passive story target for ${storyTargetDebugLabel(playback.target)}.`,
      });

      return;
    }

    const rect = target.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      emitStoryPassivePlaybackDiagnostic({
        storyId: playback.storyId,
        stepIndex: playback.stepIndex,
        message: `Passive story target has an empty rectangle: ${storyTargetDebugLabel(playback.target)}.`,
      });

      return;
    }

    const nextX = rect.left + rect.width / 2;
    const nextY = rect.top + rect.height / 2;

    setPassiveCursor((prev) => {
      if (prev.visible) {
        return { ...prev, x: nextX, y: nextY, visible: true };
      }

      return {
        ...prev,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        visible: true,
      };
    });

    requestAnimationFrame(() => {
      setPassiveCursor((prev) => ({
        ...prev,
        x: nextX,
        y: nextY,
        visible: true,
      }));
    });
  }

  function storyTargetDebugLabel(
    target: StoryPassivePlaybackState['target'],
  ): string {
    if (!target) {
      return 'no target';
    }

    if (target.type === 'header_widget') {
      return `header_widget:${target.command}:${target.subcommand}`;
    }

    if (target.type === 'web_node') {
      return `web_node:${target.targetId}`;
    }

    return `${target.command}:${target.subcommand}`;
  }

  async function pressPassiveCursor(): Promise<void> {
    setPassiveCursor((prev) => ({
      ...prev,
      pressed: true,
      rippleKey: prev.rippleKey + 1,
    }));

    await new Promise((resolve) => window.setTimeout(resolve, 140));
    setPassiveCursor((prev) => ({ ...prev, pressed: false }));
  }

  function setPassiveHoveredElement(element: HTMLElement | null): void {
    if (passiveHoveredElement === element) {
      return;
    }

    passiveHoveredElement?.classList.remove('is-story-passive-hover');
    passiveHoveredElement = element;
    passiveHoveredElement?.classList.add('is-story-passive-hover');
  }

  type WaitForStoryTargetProps = {
    targetId: string;
    timeoutMs: number;
    intervalMs: number;
  };

  async function waitForStoryTarget({
    targetId,
    timeoutMs,
    intervalMs,
  }: WaitForStoryTargetProps): Promise<HTMLElement | null> {
    const start = performance.now();

    while (performance.now() - start < timeoutMs) {
      const target = getStoryDomTarget(targetId);

      if (target) {
        return target;
      }

      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }

    return getStoryDomTarget(targetId);
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function overflowClips(style: CSSStyleDeclaration): boolean {
    return [style.overflow, style.overflowX, style.overflowY].some(
      (value) => value !== 'visible',
    );
  }

  function firstClippingAncestor(target: HTMLElement): HTMLElement | null {
    for (let el = target.parentElement; el; el = el.parentElement) {
      if (overflowClips(getComputedStyle(el))) {
        return el;
      }
    }

    return null;
  }

  function storyTargetIsFullyInView(target: HTMLElement): boolean {
    const rect = target.getBoundingClientRect();
    const tolerance = 1;

    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    if (
      rect.left < -tolerance ||
      rect.top < -tolerance ||
      rect.right > window.innerWidth + tolerance ||
      rect.bottom > window.innerHeight + tolerance
    ) {
      return false;
    }

    for (let el = target.parentElement; el; el = el.parentElement) {
      if (!overflowClips(getComputedStyle(el))) {
        continue;
      }

      const ancestorRect = el.getBoundingClientRect();

      if (
        rect.left < ancestorRect.left - tolerance ||
        rect.top < ancestorRect.top - tolerance ||
        rect.right > ancestorRect.right + tolerance ||
        rect.bottom > ancestorRect.bottom + tolerance
      ) {
        return false;
      }
    }

    return true;
  }

  async function ensurePassiveTargetVisible(
    target: HTMLElement,
    playback: StoryPassivePlaybackState,
  ): Promise<void> {
    if (storyTargetIsFullyInView(target)) {
      return;
    }

    const scrollContext = firstClippingAncestor(target);
    const contextRect = scrollContext?.getBoundingClientRect();

    if (contextRect && playback.catchingUp !== true) {
      setPassiveCursor((prev) => ({
        ...prev,
        x: contextRect.left + contextRect.width / 2,
        y: contextRect.top + contextRect.height / 2,
        visible: true,
      }));
    }

    target.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: playback.catchingUp === true ? 'auto' : 'smooth',
    });

    if (playback.catchingUp !== true) {
      await sleep(PASSIVE_TARGET_SCROLL_WAIT_MS);
    }

    movePassiveCursorToTarget();
  }

  async function typeIntoField(
    field: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<void> {
    const resizeTextArea = () => {
      if (!(field instanceof HTMLTextAreaElement)) {
        return;
      }

      field.style.height = 'auto';
      field.style.height = `${field.scrollHeight}px`;
      field.style.overflowY = 'hidden';
    };

    field.value = '';
    field.dispatchEvent(new InputEvent('input', { bubbles: true }));
    resizeTextArea();

    for (const char of value) {
      field.value += char;

      field.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: char,
          inputType: 'insertText',
        }),
      );

      resizeTextArea();
      await new Promise((resolve) => window.setTimeout(resolve, 22));
    }
  }

  async function typePassiveFormValues(
    values: {
      arguments: Record<string, unknown>;
      options: Record<string, unknown>;
    },
    preferredField: HTMLElement | null,
  ): Promise<boolean> {
    const preferredFields =
      preferredField instanceof HTMLInputElement ||
      preferredField instanceof HTMLTextAreaElement
        ? [preferredField]
        : [];

    const documentFields = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input[name], textarea[name]',
      ),
    ).filter((field) => field.offsetParent !== null && !field.disabled);

    const fields = [...preferredFields, ...documentFields].filter(
      (field, index, list) => list.indexOf(field) === index,
    );

    let typed = false;

    for (const field of fields) {
      const name = field.name;
      const value = values.arguments[name] ?? values.options[name];

      if (typeof value !== 'string' && typeof value !== 'number') {
        continue;
      }

      await typeIntoField(field, String(value));
      typed = true;
    }

    return typed;
  }

  async function executePassivePlaybackAction(
    playback: StoryPassivePlaybackState,
  ): Promise<void> {
    const action = playback.action;

    if (!isWebDemoMode() || action.type === 'none') {
      return;
    }

    if (playback.catchingUp !== true) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, PASSIVE_CURSOR_ACTION_DELAY_MS),
      );
    }

    if (action.type === 'open_widget') {
      setPassiveHoveredElement(null);

      const widget = headerChromeWidgets().find(
        (entry) =>
          entry.command === action.command &&
          entry.subcommand === action.subcommand,
      );

      if (!widget) {
        return;
      }

      const target = storyPassivePlaybackTargetElement();

      if (target) {
        await ensurePassiveTargetVisible(target, playback);
      }

      if (playback.catchingUp !== true) {
        await pressPassiveCursor();
      }

      if (
        widget.surface === 'timeline_singleton' ||
        (dockVisible() && isDockRoutedWidget(widget))
      ) {
        await openTaskbarWidgetForStory(widget);

        return;
      }

      openChromeWidget({
        command: widget.command,
        subcommand: widget.subcommand,
        title: widget.modalTitle,
      });

      emitStoryWidgetOpened({
        type: 'widget_opened',
        command: widget.command,
        subcommand: widget.subcommand,
      });

      return;
    }

    if (action.type === 'fill_form') {
      setPassiveHoveredElement(null);

      const field =
        playback.target?.type === 'web_node'
          ? await waitForStoryTarget({
              targetId: playback.target.targetId,
              timeoutMs: 1600,
              intervalMs: 80,
            })
          : null;

      if (field) {
        await ensurePassiveTargetVisible(field, playback);
      }

      const didType = await typePassiveFormValues(action.values, field);

      if (!didType) {
        emitStoryFillForm(action.values);
      }

      return;
    }

    const target = await waitForStoryTarget({
      targetId: action.targetId,
      timeoutMs: 1600,
      intervalMs: 80,
    });

    if (!target) {
      emitStoryPassivePlaybackDiagnostic({
        storyId: playback.storyId,
        stepIndex: playback.stepIndex,
        message: `Could not execute passive story action; target not found: web_node:${action.targetId}.`,
      });

      return;
    }

    await ensurePassiveTargetVisible(target, playback);

    const rect = target.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      emitStoryPassivePlaybackDiagnostic({
        storyId: playback.storyId,
        stepIndex: playback.stepIndex,
        message: `Could not execute passive story action; target is not visible: web_node:${action.targetId}.`,
      });

      return;
    }

    if (action.type === 'hover_target') {
      setPassiveHoveredElement(target);
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      emitStoryTargetHovered(action.targetId);

      return;
    }

    if (playback.catchingUp !== true) {
      await pressPassiveCursor();
    }

    target.click();
    window.setTimeout(() => setPassiveHoveredElement(null), 400);
  }

  async function openTaskbarWidgetForStory(widget: {
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

      removeDockWidgetItem(key);

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
      existing !== undefined && hasTaskbarItem(key, existing);

    if (existing && hasTimelineItem) {
      if (dockVisible()) {
        setTaskbarSingletonByKey((prev) => ({
          ...prev,
          [key]: { ...existing, visible: true },
        }));

        expandDockWidget(key);
      } else if (existing.visible) {
        activateSingleTaskbarKey(key, existing.itemId, true);
      } else {
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

        activateSingleTaskbarKey(key, existing.itemId, true);
        scrollTimelineToBottomSoon();
      }

      emitStoryWidgetOpened({
        type: 'widget_opened',
        command: widget.command,
        subcommand: widget.subcommand,
      });

      return;
    }

    await toggleTaskbarWidget(widget);
  }

  function isTaskbarSubcommand(command: string, subcommand: string): boolean {
    const widget = taskbarWidgets().find(
      (w) => w.command === command && w.subcommand === subcommand,
    );

    return (
      widget !== undefined &&
      (widget.surface === 'timeline_singleton' || dockVisible())
    );
  }

  function hasTaskbarItem(key: string, entry: SingletonWidgetEntry): boolean {
    if (dockVisible()) {
      return dockWidgetItemsByKey()[key]?.id === entry.itemId;
    }

    return timeline().some(
      (item) => item.type === 'command_result' && item.id === entry.itemId,
    );
  }

  function removeDockWidgetItem(key: string): void {
    setDockWidgetItemsByKey((prev) => {
      if (!(key in prev)) {
        return prev;
      }

      const next = { ...prev };
      delete next[key];

      return next;
    });
  }

  createEffect(
    on(dockVisible, (visible, previousVisible) => {
      if (previousVisible === undefined || visible === previousVisible) {
        return;
      }

      if (visible) {
        const entries = taskbarSingletonByKey();

        const dockItems = timeline().filter(
          (item): item is CommandResultTimelineItem =>
            item.type === 'command_result' &&
            item.timelineSingletonKey !== undefined &&
            entries[item.timelineSingletonKey]?.itemId === item.id,
        );

        if (dockItems.length === 0) {
          return;
        }

        setDockWidgetItemsByKey((prev) => {
          const next = { ...prev };

          for (const item of dockItems) {
            const key = item.timelineSingletonKey;

            if (key !== undefined) {
              next[key] = item;
            }
          }

          return next;
        });

        const dockItemIds = new Set(dockItems.map((item) => item.id));

        setTimeline((prev) => prev.filter((item) => !dockItemIds.has(item.id)));

        return;
      }

      const entries = taskbarSingletonByKey();

      const dockItems = Object.entries(dockWidgetItemsByKey())
        .filter(([key, item]) => entries[key]?.itemId === item.id)
        .map(([, item]) => item);

      if (dockItems.length === 0) {
        return;
      }

      setTimeline((prev) => [...prev, ...dockItems]);
      setDockWidgetItemsByKey({});
      scrollTimelineToBottomSoon();
    }),
  );

  function isHeaderWidgetActive(widget: {
    command: string;
    subcommand: string;
    surface: 'modal' | 'timeline_singleton';
  }): boolean {
    if (widget.surface !== 'timeline_singleton') {
      return false;
    }

    const key = taskbarDockKey(widget.command, widget.subcommand);

    const entry = taskbarSingletonByKey()[key];

    return dockVisible() ? entry !== undefined : entry?.visible === true;
  }

  function isStoryWidgetCurrentlyOpen(widget: {
    command: string;
    subcommand: string;
  }): boolean {
    const key = taskbarDockKey(widget.command, widget.subcommand);
    const entry = taskbarSingletonByKey()[key];

    return dockVisible()
      ? entry !== undefined && expandedDockWidgetKeys().includes(key)
      : entry?.visible === true;
  }

  function isTimelineCommandResultHidden(
    item: Extract<TimelineItem, { type: 'command_result' }>,
  ): boolean {
    const key = item.timelineSingletonKey;

    if (!key) {
      return false;
    }

    const entry = taskbarSingletonByKey()[key];

    if (dockVisible()) {
      return entry !== undefined;
    }

    return entry?.visible !== true;
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

  function updateDockResize(event: PointerEvent): void {
    if (!dockResizeState) {
      return;
    }

    event.preventDefault();

    const delta =
      dockResizeState.position === 'left'
        ? event.clientX - dockResizeState.startClientX
        : dockResizeState.startClientX - event.clientX;

    setLayoutPrefs((prev) => ({
      ...prev,
      dockWidthPx: clampDockWidth(dockResizeState!.startWidthPx + delta),
    }));
  }

  function finishDockResize(): void {
    dockResizeState = null;
    document.body.classList.remove('workspace-resizing');
    window.removeEventListener('pointermove', updateDockResize);
    window.removeEventListener('pointerup', finishDockResize);
    window.removeEventListener('pointercancel', finishDockResize);
  }

  function startDockResize(event: PointerEvent): void {
    const position = layoutPrefs().dockPosition;

    if (!layoutPrefs().dockResizable || position === 'hidden') {
      return;
    }

    event.preventDefault();

    dockResizeState = {
      startClientX: event.clientX,
      startWidthPx: layoutPrefs().dockWidthPx,
      position,
    };

    document.body.classList.add('workspace-resizing');
    window.addEventListener('pointermove', updateDockResize);
    window.addEventListener('pointerup', finishDockResize);
    window.addEventListener('pointercancel', finishDockResize);
  }

  function hideAllTaskbarPanels(): void {
    if (dockVisible()) {
      return;
    }

    const bottomTimelineItemId = timeline().at(-1)?.id;

    setTaskbarSingletonByKey((prev) => {
      const next: Record<string, SingletonWidgetEntry> = {};
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
      const next: Record<string, SingletonWidgetEntry> = {};

      for (const [entryKey, entry] of Object.entries(prev)) {
        if (entryKey === key) {
          next[entryKey] = { itemId, visible };
          continue;
        }

        next[entryKey] = dockVisible() ? entry : { ...entry, visible: false };
      }

      if (!(key in next)) {
        next[key] = { itemId, visible };
      }

      return next;
    });

    if (dockVisible()) {
      expandDockWidget(key);
    }
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

    if (dockVisible()) {
      const itemId = existing?.itemId ?? createId();

      setDockWidgetItemsByKey((prev) => ({
        ...prev,
        [key]: {
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
      }));

      if (
        timeline().some(
          (item) =>
            item.type === 'command_result' && item.timelineSingletonKey === key,
        )
      ) {
        setTimeline((prev) =>
          prev.filter(
            (item) =>
              item.type !== 'command_result' ||
              item.timelineSingletonKey !== key,
          ),
        );
      }

      activateSingleTaskbarKey(key, itemId, params.visible);

      return;
    }

    removeDockWidgetItem(key);

    if (existing) {
      setTimeline((prev) => {
        const rest: TimelineItem[] = [];
        let singleton: CommandResultTimelineItem | null = null;
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

      if (!dockVisible()) {
        scrollTimelineToBottomSoon();
      }

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

    if (!dockVisible()) {
      scrollTimelineToBottomSoon();
    }
  }

  function closeTaskbarWidget(command: string, subcommand: string): void {
    const key = taskbarDockKey(command, subcommand);
    const existing = taskbarSingletonByKey()[key];

    setTaskbarSingletonByKey((prev) => {
      const next = { ...prev };
      delete next[key];

      return next;
    });

    collapseDockWidget(key);

    removeDockWidgetItem(key);

    if (!existing) {
      return;
    }

    setTimeline((prev) => prev.filter((item) => item.id !== existing.itemId));
  }

  function openLayoutSettings(): void {
    setTimeline((prev) => {
      const existing = prev.find(
        (item) =>
          item.type === 'layout_settings' &&
          item.id === LAYOUT_SETTINGS_TIMELINE_ID,
      );

      if (existing) {
        return [
          ...prev.filter((item) => item.id !== LAYOUT_SETTINGS_TIMELINE_ID),
          existing,
        ];
      }

      return [
        ...prev,
        {
          id: LAYOUT_SETTINGS_TIMELINE_ID,
          type: 'layout_settings',
        },
      ];
    });

    scrollTimelineToBottomSoon();
  }

  function updateLayoutPrefs(
    updater: (prefs: LayoutPrefs) => LayoutPrefs,
  ): void {
    setLayoutPrefs((prev) => {
      const next = updater(prev);

      return {
        dockPosition: next.dockPosition,
        dockResizable: next.dockResizable,
        dockWidthPx: clampDockWidth(next.dockWidthPx),
        dockExpandedLimit: Math.max(0, Math.floor(next.dockExpandedLimit)),
      };
    });
  }

  function limitExpandedDockWidgetKeys(keys: string[]): string[] {
    const limit = layoutPrefs().dockExpandedLimit;

    return limit === 0 ? keys : keys.slice(-limit);
  }

  function expandDockWidget(key: string): void {
    setExpandedDockWidgetKeys((keys) =>
      limitExpandedDockWidgetKeys([
        ...keys.filter((entry) => entry !== key),
        key,
      ]),
    );
  }

  function collapseDockWidget(key: string): void {
    setExpandedDockWidgetKeys((keys) => keys.filter((entry) => entry !== key));
  }

  function toggleExpandedDockWidget(key: string): void {
    if (expandedDockWidgetKeys().includes(key)) {
      collapseDockWidget(key);

      return;
    }

    expandDockWidget(key);
  }

  async function toggleTaskbarWidget(widget: {
    command: string;
    subcommand: string;
    label: string;
  }): Promise<void> {
    const key = taskbarDockKey(widget.command, widget.subcommand);

    if (canStorySandboxHandleCommand(widget.command, widget.subcommand)) {
      if (dockVisible()) {
        const existing = taskbarSingletonByKey()[key];

        if (existing) {
          setTaskbarSingletonByKey((prev) => ({
            ...prev,
            [key]: { ...existing, visible: true },
          }));

          toggleExpandedDockWidget(key);

          emitStoryWidgetOpened({
            type: 'widget_opened',
            command: widget.command,
            subcommand: widget.subcommand,
          });

          return;
        }
      }

      setTaskbarSingletonByKey((prev) => {
        const rest = { ...prev };
        delete rest[key];

        return rest;
      });

      removeDockWidgetItem(key);

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
      existing !== undefined && hasTaskbarItem(key, existing);

    if (existing && !hasTimelineItem) {
      setTaskbarSingletonByKey((prev) => {
        const rest = { ...prev };
        delete rest[key];

        return rest;
      });

      removeDockWidgetItem(key);
    }

    if (existing && hasTimelineItem) {
      if (dockVisible()) {
        setTaskbarSingletonByKey((prev) => ({
          ...prev,
          [key]: { ...existing, visible: true },
        }));

        toggleExpandedDockWidget(key);

        emitStoryWidgetOpened({
          type: 'widget_opened',
          command: widget.command,
          subcommand: widget.subcommand,
        });

        return;
      }

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

  async function openHeaderWidget(widget: HeaderWidget): Promise<void> {
    if (
      widget.surface === 'timeline_singleton' ||
      (dockVisible() && isDockRoutedWidget(widget))
    ) {
      await openTaskbarWidgetForStory(widget);

      return;
    }

    openChromeWidget({
      command: widget.command,
      subcommand: widget.subcommand,
      title: widget.modalTitle,
    });

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

  async function refreshCoreUpdateState(): Promise<void> {
    if (auth.authState().status !== 'connected') {
      setCoreUpdateAvailable(false);

      return;
    }

    try {
      const result = await fetchJson<CoreUpdateResponse>('/api/core-update');
      setCoreUpdateAvailable(result.update?.state === 'available');
    } catch {
      setCoreUpdateAvailable(false);
    }
  }

  function compactCurrentSession(): void {
    if (!wsConnected()) {
      appendSystemMessage('Connect WebSocket first.');

      return;
    }

    if (compactSessionRequestId() !== null) {
      appendSystemMessage('Session compaction is already running.');

      return;
    }

    const requestId = createId();

    setCompactSessionRequestId(requestId);
    appendSystemMessage('------ Compacting -------');

    pendingRequests.set(requestId, {
      onCommandResult: (message) => {
        if (typeof message.output === 'string') {
          appendSystemMessage(message.output);
        }
      },
      onDone: () => {
        setCompactSessionRequestId(null);
        requestComposerAiState();
      },
      onError: (message) => {
        setCompactSessionRequestId(null);
        appendSystemMessage(`Compaction failed: ${message.message}`);
      },
    });

    sendSocketMessage({
      type: 'compact_session',
      requestId,
    });
  }

  async function createNewSessionFromComposerMenu(): Promise<void> {
    const commandDetail = await ensureCommandDetail('session');

    const subcommand = commandDetail?.subcommands.find(
      (entry) => entry.name === 'new',
    );

    if (!subcommand) {
      appendSystemMessage('Unable to create a new session.');

      return;
    }

    await runCommand('session', subcommand, defaultPayload(subcommand));
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
    runJsonCommandOutput,
    runWebAction,
  } = useCommands({
    authStatus: () => auth.authState().status,
    currentUserPubkey: () => {
      const state = auth.authState();

      return state.status === 'connected' ? state.pubkey : null;
    },
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
    signEvent: auth.signEvent,
    nip44DecryptSelf: auth.nip44DecryptSelf,
    createId,
    requestComposerAiState,
    refreshCoreUpdateState,
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
    replaceCommandResultWeb: replaceTimelineCommandResultWeb,
    saveTimelineForm,
    submitForm,
    updateFormValue,
  } = useTimeline({
    timeline,
    timelineId,
    setTimeline,
    pendingPromptRequestId,
    setPendingPromptRequestId,
    setActiveFormId,
    createId,
    pendingRequests,
    sendSocketMessage,
    runCommand,
    defaultPayload,
    resolveCommandDetail,
  });

  function replaceCommandResultWeb(
    itemId: string,
    web: import('@src/web/ui-schema').WebNodeRoot,
  ): void {
    let replacedDockItem = false;

    setDockWidgetItemsByKey((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const [key, item] of Object.entries(next)) {
        if (item.id !== itemId) {
          continue;
        }

        next[key] = { ...item, web, text: null };
        changed = true;
        replacedDockItem = true;
      }

      return changed ? next : prev;
    });

    if (!replacedDockItem) {
      replaceTimelineCommandResultWeb(itemId, web);
    }
  }

  function replaceTimelineItem(item: TimelineItem): void {
    setTimeline((prev) =>
      prev.map((entry) => (entry.id === item.id ? item : entry)),
    );
  }

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

  async function restartBotFromAccountMenu(): Promise<void> {
    try {
      const detail = await ensureCommandDetail('bot');

      const subcommand = detail.subcommands.find(
        (entry) =>
          entry.name === 'restart' || entry.aliases.includes('restart'),
      );

      if (!subcommand) {
        throw new Error('Unknown subcommand: restart');
      }

      await runCommand('bot', subcommand, defaultPayload(subcommand));
    } catch (err) {
      appendSystemMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const { submitComposer, useComposerFocus } = useComposer({
    composerText,
    pendingPromptRequestId,
    hasPendingRequest: (requestId) => pendingRequests.has(requestId),
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
      isWebDemoMode() ||
      paletteOpen() ||
      activeFormId() !== null ||
      headerMenusOpen(),
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

  createEffect(() => {
    window.localStorage.setItem(
      DESKTOP_LAYOUT_STORAGE_KEY,
      JSON.stringify(layoutPrefs()),
    );
  });

  createEffect(() => {
    const key = expandedDockWidgetKeys().at(-1) ?? null;

    if (!key || !dockVisible() || isEmbeddedWebDemoMode()) {
      return;
    }

    requestAnimationFrame(() => {
      const el = dockCardElements.get(key);

      if (!el) {
        return;
      }

      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    });
  });

  createEffect(() => {
    const limitedKeys = limitExpandedDockWidgetKeys(expandedDockWidgetKeys());

    if (limitedKeys.length !== expandedDockWidgetKeys().length) {
      setExpandedDockWidgetKeys(limitedKeys);
    }
  });

  createEffect(() => {
    if (
      !demoWidgetQuery ||
      !wsConnected() ||
      loadingCommands() ||
      !desktopLayoutReady()
    ) {
      return;
    }

    const widget = resolveDemoQueryWidget(demoWidgetQuery);

    if (!widget) {
      return;
    }

    const key = taskbarDockKey(widget.command, widget.subcommand);

    if (demoQueryWidgetOpenedKey() === key) {
      return;
    }

    setDemoQueryWidgetOpenedKey(key);
    void openHeaderWidget(widget);
  });

  onMount(() => {
    const desktopLayoutQuery = window.matchMedia('(min-width: 900px)');

    const updateDesktopLayoutEnabled = () => {
      setDesktopLayoutEnabled(desktopLayoutQuery.matches);
    };

    updateDesktopLayoutEnabled();
    setDesktopLayoutReady(true);
    desktopLayoutQuery.addEventListener('change', updateDesktopLayoutEnabled);

    timelineEl?.addEventListener('scroll', updateTimelineBottomFade, {
      passive: true,
    });

    window.addEventListener('resize', scheduleTimelineBottomFadeUpdate);
    updateTimelineBottomFade();

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const targetPath = event.composedPath();

      const targetIsEditable = targetPath.some(
        (target) =>
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable),
      );

      if (targetIsEditable) {
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

    const stopStoryPassivePlaybackListener = onStoryPassivePlaybackChange(
      (state) => {
        setPassivePlayback(state);
      },
    );

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

      timelineEl?.removeEventListener('scroll', updateTimelineBottomFade);

      desktopLayoutQuery.removeEventListener(
        'change',
        updateDesktopLayoutEnabled,
      );

      window.removeEventListener('resize', scheduleTimelineBottomFadeUpdate);

      window.removeEventListener('keydown', handleGlobalKeyDown);

      window.removeEventListener(
        'composer-ai-state-refresh-requested',
        handleComposerAiStateRefreshRequest,
      );

      stopStoryWalkthroughListener();
      stopStoryPassivePlaybackListener();
      stopStoryCloseWidgetListener();
      stopStoryClearPromptsListener();
      setPassiveHoveredElement(null);
      finishDockResize();
    });
  });

  createEffect(() => {
    const playback = passivePlayback();
    queueMicrotask(movePassiveCursorToTarget);

    if (!isWebDemoMode() || !playback || playback.complete) {
      setLastPassiveActionKey(null);

      return;
    }

    const actionKey = `${playback.storyId}:${playback.stepIndex}:${JSON.stringify(playback.action)}`;

    if (lastPassiveActionKey() === actionKey) {
      return;
    }

    setLastPassiveActionKey(actionKey);

    passiveActionQueue = passiveActionQueue
      .then(() => executePassivePlaybackAction(playback))
      .catch(() => undefined);

    void passiveActionQueue;
  });

  createEffect(() => {
    const status = auth.authState().status;

    if (status !== 'connected' || !wsConnected()) {
      setCoreUpdateAvailable(false);

      return;
    }

    void refreshComposerAiState();
    void refreshCoreUpdateState();
  });

  createEffect(() => {
    setTaskbarSingletonByKey((prev) => {
      const liveIds = new Set(
        [
          ...timeline().filter((item) => item.type === 'command_result'),
          ...Object.values(dockWidgetItemsByKey()),
        ].map((item) => item.id),
      );

      let changed = false;
      const next: Record<string, SingletonWidgetEntry> = {};
      for (const [key, entry] of Object.entries(prev)) {
        if (liveIds.has(entry.itemId)) {
          next[key] = entry;
        } else {
          changed = true;

          collapseDockWidget(key);
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

  async function onEnablePiperTts(auto: boolean = false): Promise<void> {
    if (piperTtsBusy()) {
      return;
    }

    setPiperTtsBusy(true);

    try {
      if (auto) {
        appendSystemMessage(
          'Piper TTS is booting. Speech buttons will switch to Piper when ready.',
        );
      }

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

  onMount(() => {
    if (isWebDemoMode()) {
      return;
    }

    if (isPiperTtsEnabled()) {
      setPiperTtsEnabled(true);

      return;
    }

    if (window.sessionStorage.getItem(PIPER_TTS_AUTO_ATTEMPTED_KEY) === '1') {
      return;
    }

    window.sessionStorage.setItem(PIPER_TTS_AUTO_ATTEMPTED_KEY, '1');
    void onEnablePiperTts(true);
  });

  createEffect(() => {
    const widgets: Array<{ command: string; subcommand: string }> = [];
    const modal = chrome.chromeModal();

    if (modal) {
      widgets.push({ command: modal.command, subcommand: modal.subcommand });
    }

    for (const widget of taskbarWidgets()) {
      if (isStoryWidgetCurrentlyOpen(widget)) {
        widgets.push({
          command: widget.command,
          subcommand: widget.subcommand,
        });
      }
    }

    setStoryOpenWidgets(widgets);
  });

  return (
    <div
      class="app-shell"
      data-demo-mode={isWebDemoMode() ? 'true' : undefined}
      data-web-ui-busy-digest={webUiBusyDigest()}
      style={`--desktop-dock-width:${layoutPrefs().dockWidthPx}px`}
    >
      <div
        class="workspace-shell"
        classList={{
          'workspace-shell--dock-left': layoutPrefs().dockPosition === 'left',
          'workspace-shell--dock-right': layoutPrefs().dockPosition === 'right',
          'workspace-shell--dock-hidden':
            layoutPrefs().dockPosition === 'hidden',
        }}
      >
        <Show when={dockVisible()}>
          <SingletonDock
            taskbarWidgets={taskbarWidgets}
            dockedWidgetCards={dockedWidgetCards}
            taskbarSingletonByKey={taskbarSingletonByKey}
            expandedDockWidgetKeys={expandedDockWidgetKeys}
            wsConnected={wsConnected}
            currentUserPubkey={() => {
              const state = auth.authState();

              return state.status === 'connected' ? state.pubkey : null;
            }}
            dockResizable={() => layoutPrefs().dockResizable}
            taskbarDockKey={taskbarDockKey}
            onToggleTaskbarWidget={(widget) => void toggleTaskbarWidget(widget)}
            onDockCardElement={(key, el) => {
              dockCardElements.set(key, el);
            }}
            onOpenCommand={(command) => void openPaletteForCommand(command)}
            onRepeatSubcommand={(item) => void repeatTimelineSubcommand(item)}
            onCloseTaskbarWidget={closeTaskbarWidget}
            onReplaceCommandWeb={replaceCommandResultWeb}
            isWebUiBusy={isWebUiBusyFor}
            onRunWebAction={runWebAction}
            onRunJsonCommand={runJsonCommand}
            onAppendSystem={appendSystemMessage}
            onToggleExpandedDockWidget={toggleExpandedDockWidget}
            onExpandDockWidget={expandDockWidget}
            onCollapseDockWidget={collapseDockWidget}
            onStartDockResize={startDockResize}
          />
        </Show>
        <div class="workspace-main">
          <HeaderChrome
            widgets={visibleHeaderChromeWidgets}
            isWidgetActive={isHeaderWidgetActive}
            wsConnected={wsConnected}
            isConnected={isConnected}
            isDisconnected={isDisconnected}
            connectLabel={connectLabel}
            manageTitle={manageTitle}
            pushBusy={pushBusy}
            piperTtsBusy={piperTtsBusy}
            piperTtsEnabled={piperTtsEnabled}
            hasCoreUpdate={coreUpdateAvailable}
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

              void openHeaderWidget(w);
            }}
            onConnect={handleConnectMenuClick}
            onLogout={() => auth.logout()}
            onEnablePush={() => {
              void onEnablePush();
            }}
            onEnablePiperTts={() => {
              void onEnablePiperTts();
            }}
            onOpenNostrSearchRelays={() => setNostrSearchRelaysOpen(true)}
            onOpenLayoutSettings={
              desktopLayoutEnabled() ? openLayoutSettings : undefined
            }
            onRestartBot={() => {
              void restartBotFromAccountMenu();
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
              currentUserPubkey={(() => {
                const state = auth.authState();

                return state.status === 'connected' ? state.pubkey : null;
              })()}
              isWebUiBusy={isWebUiBusyFor}
              onRunWebAction={runWebAction}
              onRunJsonCommand={runJsonCommand}
              onRunJsonCommandOutput={runJsonCommandOutput}
              onReplaceTimelineItem={replaceTimelineItem}
              onUpdateFormValue={updateFormValue}
              onSubmitForm={(itemId) => void submitForm(itemId)}
              layoutPrefs={layoutPrefs()}
              onUpdateLayoutPrefs={updateLayoutPrefs}
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
                    <ComposerWorkingButton
                      working={agentWorking()}
                      onStop={() => chat.cancelChat()}
                    />
                    <ComposerContextMenuButton
                      backend={composerAiState()!.backend}
                      label={
                        formatComposerContextStats(composerAiState()) ??
                        'session'
                      }
                      wsConnected={wsConnected()}
                      compacting={compactSessionRequestId() !== null}
                      onCompact={compactCurrentSession}
                      onCreateNewSession={() => {
                        void createNewSessionFromComposerMenu();
                      }}
                    />
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
        </div>
      </div>
      <PaletteView
        palette={palette}
        loadingCommands={loadingCommands()}
        notConnected={auth.authState().status !== 'connected'}
        onChooseSubcommand={(subcommand) => void chooseSubcommand(subcommand)}
      />
      <ConnectOverlays auth={auth} connect={connect} />
      <ChromeOverlay
        chrome={chrome}
        currentUserPubkey={(() => {
          const state = auth.authState();

          return state.status === 'connected' ? state.pubkey : null;
        })()}
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
      <style>{`
        @keyframes demo-cursor-ripple {
          0% { opacity: 0.85; transform: translate(-34%, -30%) scale(0.45); }
          100% { opacity: 0; transform: translate(-34%, -30%) scale(1.6); }
        }
      `}</style>
      <Show when={isWebDemoMode() && passiveCursor().visible}>
        <div
          style={{
            position: 'fixed',
            left: `${passiveCursor().x}px`,
            top: `${passiveCursor().y}px`,
            opacity: passiveCursor().visible ? 1 : 0,
            transform: 'translate(-20%, -12%)',
            width: '20px',
            height: '20px',
            'pointer-events': 'none',
            'z-index': 80,
            transition:
              'left 500ms ease-out, top 500ms ease-out, opacity 180ms ease-out',
          }}
          aria-hidden="true"
        >
          <Show when={passiveCursor().pressed}>
            <div
              style={{
                position: 'absolute',
                left: '0',
                top: '0',
                width: '28px',
                height: '28px',
                'border-radius': '999px',
                border: '2px solid rgba(239, 68, 68, 0.85)',
                transform: 'translate(-34%, -30%)',
                animation: 'demo-cursor-ripple 420ms ease-out 1',
              }}
            />
          </Show>
          <div
            style={{
              width: '20px',
              height: '20px',
              'clip-path':
                'polygon(0 0, 0 100%, 32% 72%, 52% 100%, 70% 90%, 50% 62%, 88% 62%)',
              background: '#ef4444',
              border: '1px solid rgba(127, 29, 29, 0.85)',
              filter:
                'drop-shadow(0 0 8px rgba(248, 113, 113, 0.85)) drop-shadow(0 8px 18px rgba(0,0,0,0.5))',
              transition: 'transform 100ms ease-out',
              transform: passiveCursor().pressed
                ? 'rotate(-18deg) scale(0.86)'
                : 'rotate(-18deg) scale(1)',
            }}
          />
        </div>
      </Show>
      <Show when={nostrSearchRelaysOpen()}>
        <NostrSearchRelaysModal
          onClose={() => setNostrSearchRelaysOpen(false)}
          onStatus={appendSystemMessage}
        />
      </Show>
    </div>
  );
}
