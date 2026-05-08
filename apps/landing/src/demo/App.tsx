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

import { useChat } from '@web/src/chat/useChat';
import { ChromeOverlay } from '@web/src/chrome/ChromeOverlay';
import { HeaderChrome } from '@web/src/chrome/HeaderChrome';
import { useChrome } from '@web/src/chrome/useChrome';
import {
  ensureCommandDetail as ensureCommandDetailFromCatalog,
  resolveCommandDetail as resolveCommandDetailFromCatalog,
} from '@web/src/commands/catalog';
import { useCommandForms } from '@web/src/commands/useCommandForms';
import { useCommands } from '@web/src/commands/useCommands';
import { Composer } from '@web/src/components/Composer';
import { ComposerModelOverrideButton } from '@web/src/components/ComposerModelOverrideButton';
import { TimelineView } from '@web/src/components/timeline/TimelineView';
import { useComposer } from '@web/src/composer/useComposer';
import { ConnectOverlays } from '@web/src/connect/ConnectOverlays';
import { useConnect } from '@web/src/connect/useConnect';
import { NostrAuthProvider, useNostrAuth } from './NostrAuthContext';
import { PaletteView } from '@web/src/palette/PaletteView';
import { usePalette } from '@web/src/palette/usePalette';
import { registerWebPushNotifications } from '@web/src/register-web-push';
import { useSocket } from '@web/src/socket/useSocket';
import { getStoryDomTarget } from '@web/src/story/dom-targets';
import {
  emitStoryQuitRequested,
  emitStoryFillForm,
  emitStoryTargetHovered,
  emitStoryWalkthroughChange,
  emitStoryWidgetOpened,
  onStoryPassivePlaybackChange,
  onStoryCloseWidgetRequested,
  onStoryClearPromptsRequested,
  onStoryWalkthroughChange,
} from '@web/src/story/events';
import { canStorySandboxHandleCommand } from '@web/src/story/sandbox';
import type {
  StoryPassivePlaybackState,
  StoryWalkthroughState,
} from '@web/src/story/types';
import { WalkthroughOverlay } from '@web/src/story/WalkthroughOverlay';
import {
  appendSystemMessageToTimeline,
  useTimeline,
} from '@web/src/timeline/useTimeline';
import { disablePiperTts } from '@web/src/tts/piper';
import type {
  CommandPayload,
  CommandDetail,
  TimelineItem,
} from '@web/src/types';
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
} from '@web/src/utils';
import type { ComposerAiState } from '@web/src/commands/types';

/** Matches `apps/landing/src/main.tsx` `DEMO_IFRAME_LANDING_CHROME_WIDE_MESSAGE`. */
const DEMO_LANDING_CHROME_WIDE_MESSAGE = 'demo.landing_chrome_wide';

export function DemoApp(): JSX.Element {
  return (
    <NostrAuthProvider>
      <AppInner />
    </NostrAuthProvider>
  );
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
  const [activeFormId, setActiveFormId] = createSignal<string | null>(null);

  const [pendingPromptRequestId, setPendingPromptRequestId] = createSignal<
    string | null
  >(null);

  const [headerMenusOpen, setHeaderMenusOpen] = createSignal(false);
  const [pushBusy, setPushBusy] = createSignal(false);

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
  let passiveActionQueue = Promise.resolve();
  let passiveHoveredElement: HTMLElement | null = null;

  const headerWidgetTargets = new Map<string, HTMLElement>();

  const [taskbarSingletonByKey, setTaskbarSingletonByKey] = createSignal<
    Record<string, { itemId: string; visible: boolean }>
  >({});

  const [timelineId] = createSignal<string>(initialTimelineId);
  const isPassiveDemoPlayback =
    new URL(window.location.href).searchParams.get('playback') === 'passive';

  const [landingShowsWideDemoChrome, setLandingShowsWideDemoChrome] =
    createSignal<boolean | null>(null);

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
    setAgentWorking: () => {},
  });

  const chat = useChat({
    timelineId,
    setTimeline,
    createId,
    pendingRequests,
    sendSocketMessage,
    appendSystemMessage,
    setAgentWorking: () => {},
    onChatResult: () => {},
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

    if (!playback || playback.complete) {
      setPassiveCursor((prev) => ({ ...prev, visible: false }));

      return;
    }

    if (!playback.target) {
      return;
    }

    const target = storyPassivePlaybackTargetElement();

    if (!target) {
      setPassiveCursor((prev) => ({ ...prev, visible: prev.visible }));

      return;
    }

    const rect = target.getBoundingClientRect();

    setPassiveCursor((prev) => ({
      ...prev,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      visible: true,
    }));
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

  function findHeaderWidget(command: string, subcommand: string) {
    return headerChromeWidgets().find(
      (widget) =>
        widget.command === command && widget.subcommand === subcommand,
    );
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

    // Passive autoplay should not move real browser focus; focusing iframe fields
    // can make the host page scroll even with preventScroll in some browsers.
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

  function preserveParentScroll(
    scroll: { x: number; y: number },
    durationMs: number,
  ): () => void {
    if (isPassiveDemoPlayback) {
      // Temporarily disabled while isolating host-page scroll jumps in autoplay.
      return () => {};
    }

    const start = performance.now();
    let frameId: number | null = null;
    let stopped = false;

    const stop = () => {
      stopped = true;

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      window.parent.removeEventListener('wheel', stop);
      window.parent.removeEventListener('touchstart', stop);
      window.parent.removeEventListener('pointerdown', stop);
      window.parent.removeEventListener('keydown', stop);
    };

    const restore = () => {
      if (stopped) {
        return;
      }

      window.parent.scrollTo(scroll.x, scroll.y);

      if (performance.now() - start < durationMs) {
        frameId = window.requestAnimationFrame(restore);
      }
    };

    window.parent.addEventListener('wheel', stop, { passive: true });
    window.parent.addEventListener('touchstart', stop, { passive: true });
    window.parent.addEventListener('pointerdown', stop, { passive: true });
    window.parent.addEventListener('keydown', stop);

    frameId = window.requestAnimationFrame(restore);

    return stop;
  }

  async function executePassivePlaybackAction(
    playback: StoryPassivePlaybackState,
  ): Promise<void> {
    const parentScrollX = window.parent.scrollX;
    const parentScrollY = window.parent.scrollY;
    const stopPreservingParentScroll = preserveParentScroll(
      { x: parentScrollX, y: parentScrollY },
      520,
    );
    const action = playback.action;

    try {
      if (action.type === 'none') {
        return;
      }

      if (playback.catchingUp !== true) {
        await new Promise((resolve) => window.setTimeout(resolve, 420));
      }

      if (action.type === 'open_widget') {
        setPassiveHoveredElement(null);
        const widget = findHeaderWidget(action.command, action.subcommand);

        if (!widget) {
          return;
        }

        if (playback.catchingUp !== true) {
          await pressPassiveCursor();
        }

        if (widget.surface === 'timeline_singleton') {
          await toggleTaskbarWidget(widget);

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
        let field: HTMLElement | null = null;

        if (playback.target?.type === 'web_node') {
          field = await waitForStoryTarget({
            targetId: playback.target.targetId,
            timeoutMs: 1600,
            intervalMs: 80,
          });
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
    } finally {
      window.setTimeout(stopPreservingParentScroll, 520);
    }
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
    if (
      item.timelineSingletonKey === 'demo-story-runtime' &&
      item.timelineSingletonHidden === true &&
      isPassiveDemoPlayback &&
      landingShowsWideDemoChrome() === true
    ) {
      return true;
    }

    if (item.timelineSingletonKey === 'demo-story-runtime') {
      return false;
    }

    const key = item.timelineSingletonKey;

    if (!key) {
      return false;
    }

    return taskbarSingletonByKey()[key]?.visible !== true;
  }

  function scrollTimelineToBottomSoon(): void {
    queueMicrotask(() => {
      if (timelineEl) {
        timelineEl.scrollTop = timelineEl.scrollHeight;
      }
    });
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
    output: import('@web/src/commands/types').SplitCommandOutput;
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
      isPassiveDemoPlayback ||
      passivePlayback() !== null ||
      paletteOpen() ||
      activeFormId() !== null ||
      headerMenusOpen(),
    focusInput: () => composerInputEl?.focus({ preventScroll: true }),
  });

  useSocketLifecycle();

  let previousTimelineLength = 0;

  createEffect(
    on(timeline, (items) => {
      const length = items.length;
      const grew = length > previousTimelineLength;
      previousTimelineLength = length;

      if (!grew) {
        return;
      }

      hideAllTaskbarPanels();
      scrollTimelineToBottomSoon();
    }),
  );

  onMount(() => {
    disablePiperTts();

    function handleLandingChromeWideMessage(ev: MessageEvent): void {
      if (ev.origin !== window.location.origin) {
        return;
      }

      const payload = ev.data as
        | { type?: string; wideLandingChrome?: unknown }
        | null;

      if (
        !payload ||
        payload.type !== DEMO_LANDING_CHROME_WIDE_MESSAGE ||
        typeof payload.wideLandingChrome !== 'boolean'
      ) {
        return;
      }

      setLandingShowsWideDemoChrome(payload.wideLandingChrome);
    }

    window.addEventListener('message', handleLandingChromeWideMessage);

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

    const stopStoryPassivePlaybackListener = onStoryPassivePlaybackChange(
      (state) => {
        setPassivePlayback(state);
        window.parent.postMessage(
          {
            type: 'demo.showcase_step',
            state,
          },
          window.location.origin,
        );
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
      window.removeEventListener('message', handleLandingChromeWideMessage);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener(
        'composer-ai-state-refresh-requested',
        handleComposerAiStateRefreshRequest,
      );

      stopStoryWalkthroughListener();
      stopStoryPassivePlaybackListener();
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

  createEffect(() => {
    const playback = passivePlayback();
    queueMicrotask(movePassiveCursorToTarget);

    if (!playback || playback.complete) {
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
        onAnyMenuOpenChange={setHeaderMenusOpen}
      />
      <main class="chat-shell">
        <TimelineView
          showBottomFade={true}
          activeFormId={activeFormId()}
          timeline={timeline()}
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
      <Show when={passiveCursor().visible}>
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
                border: '1px solid rgba(165, 243, 252, 0.75)',
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
              background: 'white',
              border: '1px solid rgba(0,0,0,0.35)',
              filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.5))',
              transition: 'transform 100ms ease-out',
              transform: passiveCursor().pressed
                ? 'rotate(-18deg) scale(0.86)'
                : 'rotate(-18deg) scale(1)',
            }}
          />
        </div>
      </Show>
    </div>
  );
}
