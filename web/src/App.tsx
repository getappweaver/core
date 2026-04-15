import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import type { JSX } from 'solid-js';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import { WebCommandOutputModal } from './components/WebCommandOutputModal';
import { WebNodeShadowRoot } from './components/WebNodeShadowRoot';
import { CommandPalette } from './components/CommandPalette';
import { ConnectModal } from './components/ConnectModal';
import { Composer } from './components/Composer';
import { TimelineView } from './components/TimelineView';
import { NostrAuthProvider, useNostrAuth } from './contexts/NostrAuthContext';
import { registerWebPushNotifications } from './register-web-push';
import type {
  CommandDetail,
  CommandOutput,
  CommandPayload,
  CommandSubcommand,
  TimelineItem,
} from './types';
import type {
  ChatResultServerMessage,
  ChatStreamChunkServerMessage,
  CommandResultServerMessage,
  CommandsResultServerMessage,
  DoneServerMessage,
  ErrorServerMessage,
  PromptPayload,
  PromptServerMessage,
  TimelineEventsResultServerMessage,
} from './ws-types';
import {
  createId,
  defaultPayload,
  getResultSubcommandTag,
  getSubcommandQueryFromPalette,
  hasMissingRequiredInputs,
  matchesCommandToken,
  mergeCommandPayload,
  payloadFromPathTokens,
  scoreSubcommandMatch,
  summarizeInvocation,
} from './utils';

type PendingRequest = {
  /** When false, prompts and prompt answers must not touch the timeline. */
  recordInTimeline?: boolean;
  onCommandsResult?: (message: CommandsResultServerMessage) => void;
  onTimelineEventsResult?: (message: TimelineEventsResultServerMessage) => void;
  onCommandResult?: (message: CommandResultServerMessage) => void;
  onPrompt?: (message: PromptServerMessage) => void;
  onChatResult?: (message: ChatResultServerMessage) => void;
  onDone?: (message: DoneServerMessage) => void;
  onError?: (message: ErrorServerMessage) => void;
};

type ChromeModalState = {
  command: string;
  subcommand: string;
  title: string;
};

type ChromePromptSession = {
  requestId: string;
  prompt: PromptPayload;
};

type IncomingServerMessage =
  | CommandsResultServerMessage
  | TimelineEventsResultServerMessage
  | CommandResultServerMessage
  | PromptServerMessage
  | ChatStreamChunkServerMessage
  | ChatResultServerMessage
  | DoneServerMessage
  | ErrorServerMessage;

export function App(): JSX.Element {
  return (
    <NostrAuthProvider>
      <AppInner />
    </NostrAuthProvider>
  );
}

function AppInner(): JSX.Element {
  const WS_RECONNECT_DELAY_MS = 1500;
  const TIMELINE_STORAGE_KEY = 'dm-bot.timeline-id';
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
  const [modalOpen, setModalOpen] = createSignal(false);
  const [chromeModal, setChromeModal] = createSignal<ChromeModalState | null>(
    null,
  );
  const [wsConnected, setWsConnected] = createSignal(false);
  const [chromeLoading, setChromeLoading] = createSignal(false);
  const [chromeError, setChromeError] = createSignal<string | null>(null);
  const [chromeText, setChromeText] = createSignal<string | null>(null);
  const [chromeWeb, setChromeWeb] = createSignal<WebNodeRoot | null>(null);
  const [chromePromptSession, setChromePromptSession] =
    createSignal<ChromePromptSession | null>(null);

  // Close the connect dialog when login succeeds (covers async / ordering edge cases).
  createEffect(
    on(
      () => auth.authState().status,
      (status, prevStatus) => {
        if (prevStatus !== 'disconnected' || status !== 'connected') {
          return;
        }

        if (!modalOpen()) {
          return;
        }

        setModalOpen(false);
      },
    ),
  );

  let timelineEl: HTMLDivElement | undefined;
  let paletteInputEl: HTMLInputElement | undefined;
  let paletteContainerEl: HTMLDivElement | undefined;
  let composerInputEl: HTMLTextAreaElement | undefined;
  let socket: WebSocket | null = null;
  let wsReconnectTimer: number | null = null;
  const pendingRequests = new Map<string, PendingRequest>();
  const chatStreamAssistantByRequestId = new Map<string, string>();

  const [commands, setCommands] = createSignal<CommandDetail[]>([]);
  const [timeline, setTimeline] = createSignal<TimelineItem[]>([
    {
      id: createId(),
      type: 'system',
      text: 'Ready. Use the / button to browse commands or type a message below.',
    },
  ]);
  const [composerText, setComposerText] = createSignal('');
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [paletteStep, setPaletteStep] = createSignal<
    'commands' | 'subcommands'
  >('commands');
  const [paletteQuery, setPaletteQuery] = createSignal('');
  const [paletteSelectedIndex, setPaletteSelectedIndex] = createSignal(0);
  const [selectedCommand, setSelectedCommand] =
    createSignal<CommandDetail | null>(null);
  const [paletteError, setPaletteError] = createSignal<string | null>(null);
  const [loadingCommands, setLoadingCommands] = createSignal(true);
  const [activeFormId, setActiveFormId] = createSignal<string | null>(null);
  const [pendingPromptRequestId, setPendingPromptRequestId] = createSignal<
    string | null
  >(null);
  const [pushBusy, setPushBusy] = createSignal(false);
  const [timelineId] = createSignal<string>(initialTimelineId);
  const [wsReconnectNonce, setWsReconnectNonce] = createSignal(0);

  const headerChromeWidgets = createMemo(() => {
    const out: Array<{
      command: string;
      subcommand: string;
      label: string;
      modalTitle: string;
    }> = [];

    for (const cmd of commands()) {
      for (const sub of cmd.subcommands) {
        const w = sub.webHeaderWidget;

        if (w) {
          out.push({
            command: cmd.name,
            subcommand: sub.name,
            label: w.label,
            modalTitle: w.modalTitle,
          });
        }
      }
    }

    return out;
  });

  function getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    return `${protocol}//${window.location.host}/ws`;
  }

  function splitPromptPayload(prompt: PromptPayload): {
    text: string | null;
    web: WebNodeRoot | null;
  } {
    if (prompt.type === 'text-prompt') {
      return {
        text: prompt.value,
        web: null,
      };
    }

    return {
      text: null,
      web: prompt.value,
    };
  }

  function sendSocketMessage(message: unknown): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    socket.send(JSON.stringify(message));
  }

  function clearSocketReconnectTimer(): void {
    if (wsReconnectTimer === null) {
      return;
    }

    window.clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }

  function scheduleSocketReconnect(): void {
    if (auth.authState().status !== 'connected' || wsReconnectTimer !== null) {
      return;
    }

    wsReconnectTimer = window.setTimeout(() => {
      wsReconnectTimer = null;
      setWsReconnectNonce((value) => value + 1);
    }, WS_RECONNECT_DELAY_MS);
  }

  function handleServerMessage(message: IncomingServerMessage): void {
    const pending = pendingRequests.get(message.requestId);

    switch (message.type) {
      case 'commands_result':
        pending?.onCommandsResult?.(message);
        return;
      case 'timeline_events_result':
        pending?.onTimelineEventsResult?.(message);
        return;
      case 'command_result':
        pending?.onCommandResult?.(message);
        return;
      case 'prompt':
        pending?.onPrompt?.(message);
        return;
      case 'chat_stream_chunk': {
        const chunk = message.chunk;

        if (chunk.kind !== 'text_delta') {
          return;
        }

        const rid = message.requestId;
        const deltaText = chunk.text;

        setTimeline((prev) => {
          let assistantId = chatStreamAssistantByRequestId.get(rid);

          if (!assistantId) {
            assistantId = createId();
            chatStreamAssistantByRequestId.set(rid, assistantId);

            return [
              ...prev,
              {
                id: assistantId,
                type: 'chat',
                role: 'assistant',
                text: deltaText,
              },
            ];
          }

          return prev.map((item) =>
            item.id === assistantId &&
            item.type === 'chat' &&
            item.role === 'assistant'
              ? { ...item, text: item.text + deltaText }
              : item,
          );
        });

        return;
      }
      case 'chat_result':
        pending?.onChatResult?.(message);
        return;
      case 'done':
        pending?.onDone?.(message);
        pendingRequests.delete(message.requestId);
        chatStreamAssistantByRequestId.delete(message.requestId);
        return;
      case 'error':
        pending?.onError?.(message);
        pendingRequests.delete(message.requestId);
        chatStreamAssistantByRequestId.delete(message.requestId);
        appendSystemMessage(message.message);
        return;
    }
  }

  function saveTimelineForm(
    item: Extract<TimelineItem, { type: 'command_form' }>,
  ): void {
    const requestId = createId();

    pendingRequests.set(requestId, {});

    try {
      sendSocketMessage({
        type: 'save_timeline_form',
        requestId,
        timelineId: timelineId(),
        eventId: item.id,
        command: item.command,
        form: {
          subcommand: item.subcommand,
          values: item.values,
          autoRun: item.autoRun,
          ...(item.optionHints ? { optionHints: item.optionHints } : {}),
        },
      });
    } catch (err) {
      pendingRequests.delete(requestId);
      appendSystemMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function deleteTimelineItem(itemId: string): void {
    setTimeline((prev) => prev.filter((item) => item.id !== itemId));

    const requestId = createId();
    pendingRequests.set(requestId, {});

    try {
      sendSocketMessage({
        type: 'delete_timeline_event',
        requestId,
        timelineId: timelineId(),
        eventId: itemId,
      });
    } catch (err) {
      pendingRequests.delete(requestId);
      appendSystemMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function connectSocket(): void {
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      if (socket.readyState === WebSocket.OPEN) {
        setWsConnected(true);
      }

      return;
    }

    socket = new WebSocket(getWebSocketUrl());

    socket.addEventListener('open', () => {
      void (async () => {
        const sock = socket;
        const wsSignUrl = new URL('/ws', window.location.origin).href;
        const rawToken = await auth.getNip98Token(wsSignUrl, 'GET');

        if (!rawToken) {
          appendSystemMessage(
            'WebSocket: could not get NIP-98 token (connect Nostr first).',
          );
          sock?.close();
          setWsConnected(false);

          return;
        }

        const authRequestId = createId();

        pendingRequests.set(authRequestId, {
          onDone: () => {
            if (
              sock !== socket ||
              !socket ||
              socket.readyState !== WebSocket.OPEN
            ) {
              return;
            }

            clearSocketReconnectTimer();
            setWsConnected(true);

            const commandsRequestId = createId();
            const timelineRequestId = createId();

            pendingRequests.set(commandsRequestId, {
              onCommandsResult: (message) => {
                setCommands(message.commands);
              },
              onDone: () => {
                setLoadingCommands(false);
              },
              onError: (message) => {
                setPaletteError(message.message);
                setLoadingCommands(false);
              },
            });

            pendingRequests.set(timelineRequestId, {
              onTimelineEventsResult: (message) => {
                if (message.timelineId !== timelineId()) {
                  return;
                }

                if (message.items.length > 0) {
                  setTimeline(message.items as TimelineItem[]);
                }
              },
            });

            try {
              sendSocketMessage({
                type: 'request_commands',
                requestId: commandsRequestId,
              });

              sendSocketMessage({
                type: 'load_timeline',
                requestId: timelineRequestId,
                timelineId: timelineId(),
                limit: 100,
              });
            } catch (err) {
              setLoadingCommands(false);
              appendSystemMessage(
                err instanceof Error ? err.message : String(err),
              );
            }
          },
        });

        try {
          sendSocketMessage({
            type: 'authenticate',
            requestId: authRequestId,
            authorization: `Nostr ${rawToken}`,
          });
        } catch (err) {
          pendingRequests.delete(authRequestId);
          appendSystemMessage(err instanceof Error ? err.message : String(err));
          sock?.close();
          setWsConnected(false);
        }
      })();
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as IncomingServerMessage;
        handleServerMessage(message);
      } catch (err) {
        appendSystemMessage(err instanceof Error ? err.message : String(err));
      }
    });

    socket.addEventListener('close', () => {
      socket = null;
      setWsConnected(false);
      pendingRequests.clear();

      if (auth.authState().status === 'connected') {
        scheduleSocketReconnect();
      }
    });

    socket.addEventListener('error', () => {
      setWsConnected(false);
      appendSystemMessage('WebSocket connection failed.');
    });
  }

  function runWebAction(
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
      recordInTimeline?: boolean;
    },
  ): void {
    if (action.type === 'prompt_answer') {
      const promptRequestId =
        params?.promptRequestId ?? pendingPromptRequestId();

      if (!promptRequestId) {
        appendSystemMessage('No pending prompt to answer.');
        return;
      }

      setPendingPromptRequestId((current) =>
        current === promptRequestId ? null : current,
      );

      try {
        sendSocketMessage({
          type: 'prompt_answer',
          requestId: promptRequestId,
          answer: action.value,
        });
      } catch (err) {
        appendSystemMessage(err instanceof Error ? err.message : String(err));
      }

      return;
    }

    if (action.type !== 'command') {
      return;
    }

    if (action.presentation === 'form') {
      void openCommandFormFromWebCommand(action).catch((err) => {
        appendSystemMessage(err instanceof Error ? err.message : String(err));
      });

      return;
    }

    const requestId = createId();
    const recordTl = params?.recordInTimeline ?? true;

    pendingRequests.set(requestId, {
      recordInTimeline: recordTl,
      onCommandResult: (message) => {
        const output = splitCommandOutput(message.output);

        if (params?.onReplaceRoot && output.web && !action.refresh) {
          params.onReplaceRoot(output.web);
        }

        const refresh = action.refresh;

        if (!refresh || !params?.onReplaceRoot) {
          return;
        }

        const refreshRequestId = createId();

        pendingRequests.set(refreshRequestId, {
          recordInTimeline: recordTl,
          onCommandResult: (refreshMessage) => {
            const refreshOutput = splitCommandOutput(refreshMessage.output);

            if (refreshOutput.web) {
              params?.onReplaceRoot?.(refreshOutput.web);
            }
          },
        });

        try {
          sendSocketMessage({
            type: 'run_command',
            requestId: refreshRequestId,
            timelineId: timelineId(),
            command: refresh.command,
            subcommand: refresh.subcommand,
            payload: {
              arguments: refresh.arguments ?? {},
              options: refresh.options ?? {},
            },
            recordInTimeline: recordTl,
          });
        } catch (err) {
          pendingRequests.delete(refreshRequestId);
          appendSystemMessage(err instanceof Error ? err.message : String(err));
        }
      },
      onPrompt: (message) => {
        const prompt = splitPromptPayload(message.prompt);

        setPendingPromptRequestId(message.requestId);

        if (!recordTl) {
          setChromePromptSession({
            requestId: message.requestId,
            prompt: message.prompt,
          });

          return;
        }

        setTimeline((prev) => [
          ...prev,
          {
            id: createId(),
            type: 'prompt',
            requestId: message.requestId,
            text: prompt.text,
            web: prompt.web,
          },
        ]);
      },
      onDone: () => {
        if (pendingPromptRequestId() === requestId) {
          setPendingPromptRequestId(null);
        }

        if (!recordTl) {
          setChromePromptSession(null);
        }
      },
      onError: () => {
        if (pendingPromptRequestId() === requestId) {
          setPendingPromptRequestId(null);
        }

        if (!recordTl) {
          setChromePromptSession(null);
        }
      },
    });

    try {
      sendSocketMessage({
        type: 'run_command',
        requestId,
        timelineId: timelineId(),
        command: action.command,
        subcommand: action.subcommand,
        payload: {
          arguments: action.arguments ?? {},
          options: action.options ?? {},
        },
        recordInTimeline: recordTl,
      });
    } catch (err) {
      pendingRequests.delete(requestId);
      appendSystemMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function replaceCommandResultWeb(itemId: string, web: WebNodeRoot): void {
    setTimeline((prev) =>
      prev.map((entry) =>
        entry.id === itemId && entry.type === 'command_result'
          ? { ...entry, web, text: null }
          : entry,
      ),
    );
  }

  function appendSystemMessage(text: string): void {
    setTimeline((prev) => [...prev, { id: createId(), type: 'system', text }]);
  }

  function splitCommandOutput(output: CommandOutput | undefined): {
    text: string | null;
    web: Extract<CommandOutput, { kind: 'ui' }> | null;
  } {
    if (typeof output === 'string') {
      return {
        text: output,
        web: null,
      };
    }

    if (output?.kind === 'ui') {
      return {
        text: null,
        web: output,
      };
    }

    return {
      text: '(no output)',
      web: null,
    };
  }

  type RequestChromeCommandProps = {
    command: string;
    subcommand: string;
    title: string;
    payload: CommandPayload;
  };

  function requestChromeCommand(props: RequestChromeCommandProps): void {
    setChromeLoading(true);
    setChromeWeb(null);
    setChromeText(null);
    setChromeError(null);
    setChromePromptSession(null);

    if (!wsConnected()) {
      setChromeLoading(false);
      setChromeError('WebSocket is not connected.');

      return;
    }

    const requestId = createId();

    pendingRequests.set(requestId, {
      recordInTimeline: false,
      onCommandResult: (message) => {
        const output = splitCommandOutput(message.output);

        setChromeLoading(false);
        setChromeWeb(output.web);
        setChromeText(output.text);
      },
      onPrompt: (message) => {
        setPendingPromptRequestId(message.requestId);
        setChromePromptSession({
          requestId: message.requestId,
          prompt: message.prompt,
        });
      },
      onError: (message) => {
        setChromeLoading(false);
        setChromeError(message.message);
        setChromePromptSession(null);
      },
      onDone: () => {
        if (pendingPromptRequestId() === requestId) {
          setPendingPromptRequestId(null);
        }

        setChromePromptSession(null);
      },
    });

    try {
      sendSocketMessage({
        type: 'run_command',
        requestId,
        timelineId: timelineId(),
        command: props.command,
        subcommand: props.subcommand,
        payload: props.payload,
        recordInTimeline: false,
      });
    } catch (err) {
      pendingRequests.delete(requestId);
      setChromeLoading(false);
      setChromeError(err instanceof Error ? err.message : String(err));
    }
  }

  function openChromeWidget(props: {
    command: string;
    subcommand: string;
    title: string;
  }): void {
    setChromeModal({
      command: props.command,
      subcommand: props.subcommand,
      title: props.title,
    });
    requestChromeCommand({
      command: props.command,
      subcommand: props.subcommand,
      title: props.title,
      payload: { arguments: {}, options: {} },
    });
  }

  function closeChromeModal(): void {
    setChromeModal(null);
    setChromeLoading(false);
    setChromeError(null);
    setChromeText(null);
    setChromeWeb(null);
    setChromePromptSession(null);
  }

  const filteredCommands = createMemo(() => {
    const query = paletteQuery().trim().toLowerCase();
    if (!query) return commands();
    return commands().filter((command) =>
      [command.name, command.summary, ...command.aliases].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  });

  const filteredSubcommands = createMemo(() => {
    const command = selectedCommand();
    if (!command) return [] as CommandSubcommand[];

    if (command.name === 'help') {
      const query = getSubcommandQueryFromPalette(command, paletteQuery())
        .trim()
        .toLowerCase();

      return commands()
        .filter((entry) => entry.name !== 'help')
        .filter((entry) => {
          if (!query) return true;

          return [entry.name, entry.summary, ...entry.aliases].some((value) =>
            value.toLowerCase().includes(query),
          );
        })
        .map((entry) => ({
          name: 'topic',
          summary: entry.summary,
          usage: `topic ${entry.name}`,
          aliases: entry.aliases,
          arguments: command.subcommands[0]?.arguments ?? [],
          options: [],
          examples: [`/help ${entry.name}`],
          inferredWeb: { executionMode: 'requires_input' as const },
        }));
    }

    const query = getSubcommandQueryFromPalette(command, paletteQuery());
    if (!query) return command.subcommands;
    return command.subcommands
      .map((subcommand) => ({
        subcommand,
        score: scoreSubcommandMatch(subcommand, query),
      }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.subcommand);
  });

  createEffect(() => {
    wsReconnectNonce();

    if (auth.authState().status !== 'connected') {
      clearSocketReconnectTimer();

      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
        socket = null;
      }

      setWsConnected(false);

      return;
    }

    connectSocket();
  });

  createEffect(
    on([paletteOpen, paletteStep, paletteSelectedIndex], ([open]) => {
      if (!open) {
        return;
      }

      queueMicrotask(() => {
        paletteContainerEl
          ?.querySelector<HTMLButtonElement>('.palette-item.selected')
          ?.scrollIntoView({ block: 'nearest' });
      });
    }),
  );

  let previousTimelineLength = 0;

  createEffect(
    on(timeline, (items) => {
      const length = items.length;
      const grew = length > previousTimelineLength;
      previousTimelineLength = length;

      if (!grew) {
        return;
      }

      queueMicrotask(() => {
        if (timelineEl) timelineEl.scrollTop = timelineEl.scrollHeight;
      });
    }),
  );

  createEffect(
    on([paletteOpen, paletteStep], ([open]) => {
      if (!open) return;
      queueMicrotask(() => paletteInputEl?.focus());
    }),
  );

  createEffect(
    on(activeFormId, (formId) => {
      if (!formId) return;
      queueMicrotask(() => {
        const formEl = document.querySelector(
          `[data-form-id="${CSS.escape(formId)}"]`,
        );
        if (!(formEl instanceof HTMLElement)) return;
        /** Skip `.card-head` controls — focus the first real form field (e.g. todo `text`). */
        const firstInput = formEl.querySelector(
          '.field-list input:not([type="checkbox"]):not([type="hidden"]), .field-list textarea, .field-list select',
        );
        if (firstInput instanceof HTMLElement) firstInput.focus();
      });
    }),
  );

  createEffect(() => {
    if (paletteOpen() || activeFormId() !== null) return;
    queueMicrotask(() => composerInputEl?.focus());
  });

  onMount(() => {
    queueMicrotask(() => composerInputEl?.focus());

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
      queueMicrotask(() => paletteInputEl?.focus());
    };

    window.addEventListener('keydown', handleGlobalKeyDown);

    onCleanup(() => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    });
  });

  onCleanup(() => {
    clearSocketReconnectTimer();
    socket?.close();
  });

  function resolveCommandDetail(name: string): CommandDetail | null {
    const normalized = name.trim().toLowerCase();

    for (const c of commands()) {
      if (c.name.toLowerCase() === normalized) {
        return c;
      }

      if (c.aliases.some((a) => a.toLowerCase() === normalized)) {
        return c;
      }
    }

    return null;
  }

  async function ensureCommandDetail(name: string): Promise<CommandDetail> {
    const fromList = resolveCommandDetail(name);

    if (fromList) {
      return fromList;
    }

    throw new Error(`Command not found: ${name}`);
  }

  function openPalette(): void {
    setPaletteError(null);
    setPaletteStep('commands');
    setSelectedCommand(null);
    setPaletteQuery('');
    setPaletteSelectedIndex(0);
    setPaletteOpen(true);
  }

  function closePalette(): void {
    setPaletteOpen(false);
    setPaletteError(null);
  }

  function goPaletteRoot(): void {
    setPaletteError(null);
    setPaletteStep('commands');
    setSelectedCommand(null);
    setPaletteQuery('');
    setPaletteSelectedIndex(0);
    queueMicrotask(() => paletteInputEl?.focus());
  }

  function goPaletteCommandLevel(): void {
    const command = selectedCommand();

    if (!command) {
      goPaletteRoot();
      return;
    }

    setPaletteStep('commands');
    setPaletteQuery(command.name);
    setPaletteSelectedIndex(
      Math.max(
        0,
        commands().findIndex((item) => item.name === command.name),
      ),
    );
    queueMicrotask(() => paletteInputEl?.focus());
  }

  async function chooseCommand(name: string): Promise<void> {
    await chooseCommandInternal(name, false);
  }

  async function openPaletteForCommand(name: string): Promise<void> {
    openPalette();
    await chooseCommandInternal(name, true);
    queueMicrotask(() => paletteInputEl?.focus());
  }

  async function chooseCommandInternal(
    name: string,
    preserveQuery: boolean,
  ): Promise<void> {
    setPaletteError(null);
    try {
      const detail = await ensureCommandDetail(name);
      setSelectedCommand(detail);
      setPaletteStep('subcommands');
      setPaletteSelectedIndex(0);
      if (!preserveQuery) {
        setPaletteQuery('');
        setComposerText('');
      }
    } catch (err) {
      setPaletteError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePaletteFilterInput(value: string): Promise<void> {
    setPaletteQuery(value);
    setPaletteSelectedIndex(0);
    if (paletteStep() === 'commands') {
      const trimmedStart = value.trimStart();
      const firstSpace = trimmedStart.indexOf(' ');
      if (firstSpace > 0) {
        const commandToken = trimmedStart.slice(0, firstSpace);
        const remainder = trimmedStart.slice(firstSpace + 1).trimStart();
        const command = commands().find((item) =>
          matchesCommandToken(item, commandToken),
        );
        if (command) {
          await chooseCommandInternal(command.name, true);
          if (remainder.length === 0) setPaletteQuery(`${commandToken} `);
          return;
        }
      }
    }
    if (paletteStep() === 'subcommands' && value.endsWith(' ')) {
      const command = selectedCommand();
      const first = filteredSubcommands()[0];
      if (!command || !first) return;
      const current = getSubcommandQueryFromPalette(command, value);
      if (!current) return;
      const tokens = value.trim().split(/\s+/).filter(Boolean);
      const commandTokens = [command.name, ...command.aliases];
      if (tokens.length > 0 && commandTokens.includes(tokens[0]!))
        tokens.shift();
      if (tokens.length <= 1) setPaletteQuery(`${command.name} ${first.name} `);
    }
  }

  async function submitPalette(): Promise<void> {
    if (paletteStep() === 'commands') {
      const commandsList = filteredCommands();
      const first = commandsList[paletteSelectedIndex()] ?? commandsList[0];
      if (first) await chooseCommand(first.name);
      return;
    }

    const command = selectedCommand();
    if (!command) return;

    const trimmed = paletteQuery().trim();
    const tokens =
      trimmed.length > 0 ? trimmed.split(/\s+/).filter(Boolean) : [];
    const commandTokens = [command.name, ...command.aliases];
    if (tokens.length > 0 && commandTokens.includes(tokens[0]!)) tokens.shift();

    const subcommandToken = tokens[0] ?? '';
    const argTokens = tokens.slice(1);
    const subcommand =
      (subcommandToken
        ? command.subcommands.find(
            (item) =>
              item.name === subcommandToken ||
              item.aliases.includes(subcommandToken),
          )
        : null) ??
      filteredSubcommands()[paletteSelectedIndex()] ??
      filteredSubcommands()[0];
    if (!subcommand) return;

    if (command.name === 'help' && subcommand.name === 'topic') {
      const explicitTopic =
        argTokens.length > 0
          ? argTokens.join(' ')
          : subcommand.usage.replace(/^topic\s+/, '');

      await chooseSubcommand(subcommand, {
        arguments: { path: explicitTopic },
        options: {},
      });
      return;
    }

    await openSubcommand(
      command,
      subcommand,
      payloadFromPathTokens(subcommand, argTokens),
      {
        preferRun: true,
      },
    );
  }

  async function runCommand(
    command: string,
    subcommand: CommandSubcommand,
    values: CommandPayload,
  ): Promise<void> {
    const requestId = createId();

    setTimeline((prev) => [
      ...prev,
      {
        id: createId(),
        type: 'chat',
        role: 'user',
        text: summarizeInvocation(command, subcommand.name, values),
      },
    ]);

    pendingRequests.set(requestId, {
      recordInTimeline: true,
      onCommandResult: (message) => {
        const output = splitCommandOutput(message.output);

        setTimeline((prev) => [
          ...prev,
          {
            id: createId(),
            type: 'command_result',
            command,
            subcommand: subcommand.name,
            subcommandTag: getResultSubcommandTag(
              command,
              subcommand.name,
              values,
            ),
            values,
            text: output.text,
            web: output.web,
          },
        ]);
      },
      onPrompt: (message) => {
        const prompt = splitPromptPayload(message.prompt);

        setPendingPromptRequestId(message.requestId);
        setTimeline((prev) => [
          ...prev,
          {
            id: createId(),
            type: 'prompt',
            requestId: message.requestId,
            text: prompt.text,
            web: prompt.web,
          },
        ]);
      },
      onDone: () => {
        if (pendingPromptRequestId() === requestId) {
          setPendingPromptRequestId(null);
        }
      },
      onError: () => {
        if (pendingPromptRequestId() === requestId) {
          setPendingPromptRequestId(null);
        }
      },
    });

    try {
      sendSocketMessage({
        type: 'run_command',
        requestId,
        timelineId: timelineId(),
        command,
        subcommand: subcommand.name,
        payload: values,
      });
    } catch (err) {
      pendingRequests.delete(requestId);
      appendSystemMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function openSubcommand(
    command: CommandDetail,
    subcommand: CommandSubcommand,
    initialValues?: CommandPayload,
    opts?: { preferRun?: boolean },
  ): Promise<void> {
    const preferRun = opts?.preferRun === true;

    if (
      command.name === 'help' &&
      subcommand.name === 'topic' &&
      initialValues == null
    ) {
      await chooseSubcommand(subcommand, {
        arguments: {
          path: subcommand.usage.replace(/^topic\s+/, ''),
        },
        options: {},
      });
      return;
    }

    if (command.name === 'help' && subcommand.name === 'topic') {
      closePalette();
      setComposerText('');
      await runCommand(
        command.name,
        subcommand,
        initialValues ?? defaultPayload(subcommand),
      );
      return;
    }

    closePalette();
    setComposerText('');

    if (subcommand.name === 'help') {
      setTimeline((prev) => [
        ...prev,
        {
          id: createId(),
          type: 'command_result',
          command: command.name,
          subcommand: subcommand.name,
          subcommandTag: 'help',
          values: null,
          text: command.subcommands
            .map((item) => `/${command.name} ${item.usage} - ${item.summary}`)
            .join('\n'),
          web: null,
        },
      ]);
      return;
    }

    const mode = subcommand.inferredWeb?.executionMode ?? 'requires_input';

    if (
      preferRun &&
      !hasMissingRequiredInputs(
        subcommand,
        initialValues ?? defaultPayload(subcommand),
      )
    ) {
      await runCommand(
        command.name,
        subcommand,
        initialValues ?? defaultPayload(subcommand),
      );
      return;
    }

    if (mode === 'runnable_default') {
      await runCommand(
        command.name,
        subcommand,
        initialValues ?? defaultPayload(subcommand),
      );
      return;
    }

    const formId = createId();
    const formItem: Extract<TimelineItem, { type: 'command_form' }> = {
      id: formId,
      type: 'command_form',
      command: command.name,
      subcommand,
      values: mergeCommandPayload(subcommand, initialValues),
      autoRun: mode === 'runnable_customizable',
    };
    setTimeline((prev) => [...prev, formItem]);
    saveTimelineForm(formItem);
    setActiveFormId(formId);
  }

  async function chooseSubcommand(
    subcommand: CommandSubcommand,
    initialValues?: CommandPayload,
  ): Promise<void> {
    const command = selectedCommand();
    if (!command) return;

    await openSubcommand(command, subcommand, initialValues);
  }

  async function openCommandFormFromWebCommand(
    action: Extract<WebAction, { type: 'command' }>,
  ): Promise<void> {
    let command: CommandDetail;

    try {
      command = await ensureCommandDetail(action.command);
    } catch (err) {
      appendSystemMessage(err instanceof Error ? err.message : String(err));

      return;
    }

    const subcommand = command.subcommands.find(
      (entry) =>
        entry.name === action.subcommand ||
        entry.aliases.includes(action.subcommand),
    );

    if (!subcommand) {
      appendSystemMessage(
        `Unknown subcommand: ${action.subcommand} for /${command.name}`,
      );

      return;
    }

    const values = mergeCommandPayload(subcommand, {
      arguments: { ...(action.arguments ?? {}) },
      options: { ...(action.options ?? {}) },
    });

    const mode = subcommand.inferredWeb?.executionMode ?? 'requires_input';

    if (mode === 'runnable_default') {
      await runCommand(command.name, subcommand, values);

      return;
    }

    closePalette();
    setComposerText('');

    const formId = createId();
    const formItem: Extract<TimelineItem, { type: 'command_form' }> = {
      id: formId,
      type: 'command_form',
      command: command.name,
      subcommand,
      values,
      autoRun: mode === 'runnable_customizable',
      ...(action.optionHints ? { optionHints: action.optionHints } : {}),
    };
    setTimeline((prev) => [...prev, formItem]);
    saveTimelineForm(formItem);
    setActiveFormId(formId);
  }

  function updateFormValue(
    itemId: string,
    source: 'arguments' | 'options',
    name: string,
    value: unknown,
  ): void {
    setTimeline((prev) => {
      const form = prev.find(
        (entry): entry is Extract<TimelineItem, { type: 'command_form' }> =>
          entry.type === 'command_form' && entry.id === itemId,
      );

      if (!form) {
        return prev;
      }

      // Mutate in place so timeline row object identity stays stable. `<For>` in
      // TimelineView reconciles by reference; replacing the form object each
      // keystroke remounted inputs and dropped focus.
      form.values[source][name] = value;
      saveTimelineForm(form);

      return [...prev];
    });
  }

  async function submitForm(itemId: string): Promise<void> {
    const item = timeline().find((entry) => entry.id === itemId);
    if (!item || item.type !== 'command_form') return;
    setActiveFormId(null);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    await runCommand(item.command, item.subcommand, item.values);
  }

  async function repeatTimelineSubcommand(
    item: Extract<TimelineItem, { type: 'command_result' | 'command_form' }>,
  ): Promise<void> {
    if (item.type === 'command_form') {
      await runCommand(item.command, item.subcommand, item.values);
      return;
    }

    const command = resolveCommandDetail(item.command);
    const subcommand = command?.subcommands.find(
      (entry) => entry.name === item.subcommand,
    );

    if (!command || !subcommand) {
      appendSystemMessage(
        `Unable to rerun /${item.command} ${item.subcommand}`,
      );
      return;
    }

    await runCommand(
      item.command,
      subcommand,
      item.values ?? defaultPayload(subcommand),
    );
  }

  async function submitComposer(): Promise<void> {
    const text = composerText().trim();
    if (!text) return;

    const promptRequestId = pendingPromptRequestId();

    if (promptRequestId) {
      const chrome = chromePromptSession();

      if (!chrome) {
        setTimeline((prev) => [
          ...prev,
          { id: createId(), type: 'chat', role: 'user', text },
        ]);
      }

      setComposerText('');
      setPendingPromptRequestId(null);

      if (chrome !== null && chrome.requestId === promptRequestId) {
        setChromePromptSession(null);
      }

      try {
        sendSocketMessage({
          type: 'prompt_answer',
          requestId: promptRequestId,
          answer: text,
        });
      } catch (err) {
        appendSystemMessage(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (text === '/') {
      openPalette();
      setComposerText('');
      return;
    }
    if (text.startsWith('/')) {
      try {
        const [commandToken, ...rest] = text.slice(1).trim().split(/\s+/);
        if (!commandToken) {
          openPalette();
          setComposerText('');
          return;
        }
        const subcommandToken = rest[0];
        const detail = await ensureCommandDetail(commandToken);
        if (!subcommandToken) {
          setSelectedCommand(detail);
          setPaletteStep('subcommands');
          setPaletteQuery('');
          setPaletteOpen(true);
          return;
        }
        const subcommand = detail.subcommands.find(
          (item) =>
            item.name === subcommandToken ||
            item.aliases.includes(subcommandToken),
        );
        if (!subcommand)
          throw new Error(`Unknown subcommand: ${subcommandToken}`);
        await openSubcommand(
          detail,
          subcommand,
          payloadFromPathTokens(subcommand, rest.slice(1)),
          {
            preferRun: true,
          },
        );
        setComposerText('');
        return;
      } catch (err) {
        setTimeline((prev) => [
          ...prev,
          {
            id: createId(),
            type: 'system',
            text: err instanceof Error ? err.message : String(err),
          },
        ]);
        return;
      }
    }

    setTimeline((prev) => [
      ...prev,
      { id: createId(), type: 'chat', role: 'user', text },
    ]);
    setComposerText('');
    const requestId = createId();

    pendingRequests.set(requestId, {
      onChatResult: (message) => {
        const assistantId = chatStreamAssistantByRequestId.get(requestId);
        chatStreamAssistantByRequestId.delete(requestId);
        setTimeline((prev) => {
          if (assistantId) {
            return prev.map((item) =>
              item.id === assistantId &&
              item.type === 'chat' &&
              item.role === 'assistant'
                ? {
                    ...item,
                    text: message.output || '(no output)',
                  }
                : item,
            );
          }

          return [
            ...prev,
            {
              id: createId(),
              type: 'chat',
              role: 'assistant',
              text: message.output || '(no output)',
            },
          ];
        });
      },
    });

    try {
      sendSocketMessage({
        type: 'chat',
        requestId,
        timelineId: timelineId(),
        content: text,
      });
    } catch (err) {
      pendingRequests.delete(requestId);
      chatStreamAssistantByRequestId.delete(requestId);
      appendSystemMessage(err instanceof Error ? err.message : String(err));
    }
  }

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

  function connectLabel(): string {
    const state = auth.authState();
    if (state.status === 'disconnected') return 'Connect';
    return `${state.pubkey.slice(0, 8)}…`;
  }

  return (
    <div class="app-shell">
      <header class="topbar compact">
        <h1>dm-bot</h1>
        <div class="topbar-actions">
          <For each={headerChromeWidgets()}>
            {(w) => (
              <button
                type="button"
                class="connect-btn"
                disabled={!wsConnected()}
                onClick={() => {
                  openChromeWidget({
                    command: w.command,
                    subcommand: w.subcommand,
                    title: w.modalTitle,
                  });
                }}
                title={
                  wsConnected()
                    ? `${w.label} (/${w.command} ${w.subcommand})`
                    : 'Connect Nostr first — waiting for WebSocket'
                }
              >
                {w.label}
              </button>
            )}
          </For>
          <button
            type="button"
            class="connect-btn"
            onClick={() => setModalOpen(true)}
            title={
              auth.authState().status === 'connected'
                ? 'Connected — click to manage'
                : 'Connect Nostr signer'
            }
          >
            {connectLabel()}
          </button>
          <button
            type="button"
            class="connect-btn"
            disabled={
              auth.authState().status === 'disconnected' ||
              !wsConnected() ||
              pushBusy()
            }
            onClick={() => void onEnablePush()}
            title="Enable browser notifications when the bot receives a DM (tap after connecting Nostr and WebSocket)"
          >
            {pushBusy() ? '…' : 'Push'}
          </button>
        </div>
      </header>
      <main class="chat-shell">
        <TimelineView
          timeline={timeline()}
          setTimelineRef={(el) => {
            timelineEl = el;
          }}
          onOpenCommand={(command) => void openPaletteForCommand(command)}
          onRepeatSubcommand={(item) => void repeatTimelineSubcommand(item)}
          onDeleteTimelineItem={deleteTimelineItem}
          onReplaceCommandWeb={replaceCommandResultWeb}
          onAppendSystem={appendSystemMessage}
          onRunWebAction={runWebAction}
          onUpdateFormValue={updateFormValue}
          onSubmitForm={(itemId) => void submitForm(itemId)}
        />
        <Composer
          setInputRef={(el) => {
            composerInputEl = el;
          }}
          value={composerText()}
          onOpenPalette={openPalette}
          onInput={(event) => {
            const value = event.currentTarget.value;
            setComposerText(value);
            if (value.startsWith('/')) openPalette();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submitComposer();
            }
          }}
        />
      </main>
      <CommandPalette
        open={paletteOpen()}
        step={paletteStep()}
        query={paletteQuery()}
        error={paletteError()}
        loadingCommands={loadingCommands()}
        notConnected={auth.authState().status === 'disconnected'}
        selectedCommand={selectedCommand()}
        filteredCommands={filteredCommands()}
        filteredSubcommands={filteredSubcommands()}
        setInputRef={(el) => {
          paletteInputEl = el;
        }}
        setContainerRef={(el) => {
          paletteContainerEl = el;
        }}
        onClose={closePalette}
        onGoRoot={goPaletteRoot}
        onGoCommandLevel={goPaletteCommandLevel}
        onInput={(value) => void handlePaletteFilterInput(value)}
        selectedIndex={paletteSelectedIndex()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (paletteQuery().length > 0) setPaletteQuery('');
            else closePalette();
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const count =
              paletteStep() === 'commands'
                ? filteredCommands().length
                : filteredSubcommands().length;
            if (count === 0) return;
            setPaletteSelectedIndex((current) => {
              if (event.key === 'ArrowDown') {
                return (current + 1) % count;
              }
              return (current - 1 + count) % count;
            });
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            void submitPalette();
          }
        }}
        onChooseCommand={(name) => void chooseCommand(name)}
        onChooseSubcommand={(subcommand) => void chooseSubcommand(subcommand)}
      />
      {modalOpen() && (
        <ConnectModal auth={auth} onClose={() => setModalOpen(false)} />
      )}
      {chromeModal() !== null && (
        <WebCommandOutputModal
          title={chromeModal()!.title}
          ariaLabel={chromeModal()!.title}
          onClose={closeChromeModal}
          loading={chromeLoading()}
          error={chromeError()}
          text={chromeText()}
          web={chromeWeb()}
          onReplaceWeb={(root) => setChromeWeb(root)}
          onRunWebAction={(action, params) =>
            runWebAction(action, {
              ...params,
              recordInTimeline: false,
            })
          }
          chromePromptOverlay={() => {
            const session = chromePromptSession();

            if (session === null) {
              return null;
            }

            const payload = splitPromptPayload(session.prompt);

            return (
              <div class="chrome-prompt-panel">
                <Show when={payload.text !== null && payload.text !== ''}>
                  <pre class="status-modal-text">{payload.text}</pre>
                </Show>
                <Show when={payload.web !== null}>
                  <div class="status-modal-web">
                    <WebNodeShadowRoot
                      root={payload.web!}
                      promptRequestId={session.requestId}
                      onRunAction={(action, params) =>
                        runWebAction(action, {
                          ...params,
                          recordInTimeline: false,
                        })
                      }
                    />
                  </div>
                </Show>
                <p class="chrome-prompt-hint muted">
                  Reply in the composer and press Enter.
                </p>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
