import {
  renderStoryListWeb,
  renderStoryStartWeb,
} from '@src/commands/story/renderers/web';
import type { StoryCommandOutput } from '@src/system/story-definition';
import { createListRepresentation } from '@plugins/todo/commands/list/representation/builder';
import { renderListWeb } from '@plugins/todo/commands/list/renderers/web';
import type { CommandDetail, TimelineItem } from '@web/src/types';

type StubComposerAiState = {
  backend: string;
  executionProfileLabel: 'Agent' | 'Mode';
  executionProfileName: string;
  executionProfileColor: string | null;
  effectiveModel: string;
  provider: string;
  modelOverride: string | null;
  opencodeModelFormChoices: Array<{ value: string; label: string }>;
  contextStats: {
    tokensTotal: number;
    contextLimit: number | null;
    contextPercent: number | null;
  } | null;
};

type DemoTodoStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

type DemoStoryTodoItem = {
  id: number;
  parent_id: number | null;
  todo: string;
  status: DemoTodoStatus;
  sort_order?: number | null;
  description?: string | null;
  tags?: string[] | null;
  source?: string | null;
  created_at?: number;
  updated_at?: number | null;
  completed_at?: number | null;
};

type DemoStoryState = {
  chat?: {
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      text: string;
    }>;
  };
  items?: DemoStoryTodoItem[];
};

type DemoStoryStep =
  {
    showcase?: {
      title?: string;
      description?: string;
      delayMs?: number;
    };
  } & (
    | { type: 'instruction'; text: string }
    | { type: 'seed_sandbox'; state: Record<string, unknown> }
    | {
        type: 'focus_target';
        target:
          | { type: 'header_widget'; command: string; subcommand: string }
          | {
              type: 'web_node_action';
              command: string;
              subcommand: string;
              arguments?: Record<string, unknown>;
              options?: Record<string, unknown>;
            };
      }
    | {
        type: 'wait_for_action';
        match:
          | { type: 'widget_opened'; command: string; subcommand: string }
          | {
              type: 'web_action';
              command: string;
              subcommand: string;
              arguments?: Record<string, unknown>;
              options?: Record<string, unknown>;
            }
          | {
              type: 'command_completed';
              command: string;
              subcommand: string;
              arguments?: Record<string, unknown>;
              options?: Record<string, unknown>;
            };
      }
    | {
        type: 'fill_form';
        values: {
          arguments: Record<string, unknown>;
          options: Record<string, unknown>;
        };
      }
    | { type: 'complete' }
    | { type: 'user_message'; text: string }
    | {
        type: 'run_command';
        command: string;
        subcommand: string;
        payload: {
          arguments: Record<string, unknown>;
          options: Record<string, unknown>;
        };
      }
    | { type: 'assistant_message'; text: string }
    | { type: 'tool_activity'; label: string; detail?: string }
    | { type: 'set_state'; state: DemoStoryState }
    | {
        type: 'choice';
        prompt: string;
        choices: Array<{ id: string; label: string; steps: DemoStoryStep[] }>;
      }
  );

type DemoStoryEntry = {
  pluginAlias: string;
  pluginName: string;
  sourceType: 'command' | 'ai';
  sourceName: string;
  story: {
    id: string;
    title: string;
    description?: string;
    showcase?: {
      title: string;
      description: string;
      timing?: {
        initialDelayMs?: number;
        stepDelayMs?: number;
        storyDelayMs?: number;
      };
    };
    kind: 'command' | 'ai';
    initialState: DemoStoryState;
    steps: DemoStoryStep[];
    commandOutput?: StoryCommandOutput;
  };
};

type DemoAssets = {
  commands: CommandDetail[];
  stories: DemoStoryEntry[];
};

let selectedStoryId: string | null = null;
let selectedStoryInitialStepIndex = 0;
let demoStoryPlaybackMode: 'interactive' | 'passive' = 'interactive';

const composerAiState: StubComposerAiState = {
  backend: 'opencode',
  executionProfileLabel: 'Agent',
  executionProfileName: 'Demo Agent',
  executionProfileColor: 'info',
  effectiveModel: 'gpt-5.4',
  provider: 'demo',
  modelOverride: null,
  contextStats: null,
  opencodeModelFormChoices: [
    { value: 'reset', label: 'Clear / reset' },
    { value: 'demo/model-a', label: 'Demo model A' },
    { value: 'demo/model-b', label: 'Demo model B' },
  ],
};

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

async function loadDemoAssets(): Promise<DemoAssets> {
  const [commands, stories] = await Promise.all([
    fetch('/demo/commands.json').then(
      (response) => response.json() as Promise<CommandDetail[]>,
    ),
    fetch('/demo/stories.json').then(
      (response) => response.json() as Promise<DemoStoryEntry[]>,
    ),
  ]);

  return { commands, stories };
}

const demoAssetsPromise = loadDemoAssets();

export function setDemoSelectedStoryId(
  storyId: string | null,
  initialStepIndex = 0,
): void {
  selectedStoryId = storyId;
  selectedStoryInitialStepIndex = initialStepIndex;
}

export function setDemoStoryPlaybackMode(
  mode: 'interactive' | 'passive',
): void {
  demoStoryPlaybackMode = mode;
}

function getSelectedStory(stories: DemoStoryEntry[]): DemoStoryEntry | null {
  if (!selectedStoryId) {
    return stories[0] ?? null;
  }

  return (
    stories.find((story) => story.story.id === selectedStoryId) ??
    stories[0] ??
    null
  );
}

function getStoryCurrentState(
  storyEntry: DemoStoryEntry | null,
): DemoStoryState | null {
  if (!storyEntry) {
    return null;
  }

  const latestState = [...storyEntry.story.steps]
    .reverse()
    .find(
      (step): step is Extract<DemoStoryStep, { type: 'set_state' }> =>
        step.type === 'set_state',
    )?.state;

  return latestState ?? storyEntry.story.initialState;
}

function buildTodoListWebOutputFromItems(items: DemoStoryTodoItem[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const representation = createListRepresentation({
    command: 'todo',
    subcommand: 'list',
    scope: null,
    view: 'tree',
    showDescriptions: false,
    listInvocation: {
      arguments: {},
      options: {},
    },
    items: items.map((item) => {
      let depth = 0;
      let parentId = item.parent_id;

      while (parentId !== null) {
        depth += 1;
        parentId = itemsById.get(parentId)?.parent_id ?? null;
      }

      return {
        id: item.id,
        parentId: item.parent_id,
        text: item.todo,
        status: item.status,
        description: item.description ?? null,
        depth,
        wins: 0,
        losses: 0,
        winRate: null,
      };
    }),
  });

  return renderListWeb(representation, { prefix: '/' });
}

function buildTimelineCommandResultItem(params: {
  storyEntry: DemoStoryEntry;
  command: string;
  subcommand: string;
  payload: {
    arguments: Record<string, unknown>;
    options: Record<string, unknown>;
  };
  index: number;
}): TimelineItem {
  const selectedState = getStoryCurrentState(params.storyEntry);

  let output: unknown = params.storyEntry.story.commandOutput?.web ?? null;

  if (
    output === null &&
    params.command === 'todo' &&
    params.subcommand === 'list' &&
    selectedState?.items &&
    selectedState.items.length > 0
  ) {
    output = buildTodoListWebOutputFromItems(selectedState.items);
  }

  return {
    id: `demo-command-${params.index + 1}`,
    type: 'command_result',
    command: params.command,
    subcommand: params.subcommand,
    subcommandTag: `${params.command}:${params.subcommand}`,
    values: params.payload,
    text: typeof output === 'string' ? output : null,
    web:
      typeof output === 'object' && output !== null ? (output as never) : null,
    clientView: null,
  } satisfies TimelineItem;
}

function buildTimelineFromStories(stories: DemoStoryEntry[]): TimelineItem[] {
  const selected = getSelectedStory(stories);

  if (!selected) {
    return [];
  }

  const items: TimelineItem[] = [];

  items.push({
    id: 'demo-selected-story-runtime',
    type: 'command_result',
    command: 'story',
    subcommand: 'start',
    subcommandTag: 'story:start',
    values: {
      arguments: { id: selected.story.id },
      options: {},
    },
    text: null,
    web: null,
    clientView: renderStoryStartWeb(buildRegisteredStories([selected])[0]!, {
      walkthrough: demoStoryPlaybackMode === 'interactive',
      initialStepIndex: selectedStoryInitialStepIndex,
    }),
    timelineSingletonKey: 'demo-story-runtime',
    /* Passive: hidden in iframe timeline only when landing parent reports wide chrome (rail). See demo App.tsx + main.tsx postMessage. */
    timelineSingletonHidden: demoStoryPlaybackMode === 'passive',
  } satisfies TimelineItem);

  for (const [index, step] of selected.story.steps.entries()) {
    if (step.type === 'user_message') {
      items.push({
        id: `demo-chat-${index + 1}`,
        type: 'chat',
        role: 'user',
        text: step.text,
      });
      continue;
    }

    if (step.type === 'assistant_message') {
      items.push({
        id: `demo-chat-${index + 1}`,
        type: 'chat',
        role: 'assistant',
        text: step.text,
      });
      continue;
    }

    if (step.type === 'run_command') {
      items.push(
        buildTimelineCommandResultItem({
          storyEntry: selected,
          command: step.command,
          subcommand: step.subcommand,
          payload: step.payload,
          index,
        }),
      );
    }
  }

  return items;
}

function buildStoryCommandOutput(storyEntry: DemoStoryEntry) {
  if (storyEntry.story.commandOutput?.web) {
    return storyEntry.story.commandOutput.web;
  }

  const assistantText =
    storyEntry.story.steps.find(
      (step): step is Extract<DemoStoryStep, { type: 'assistant_message' }> =>
        step.type === 'assistant_message' && typeof step.text === 'string',
    )?.text ??
    storyEntry.story.description ??
    storyEntry.story.title;

  const finalState = [...storyEntry.story.steps]
    .reverse()
    .find(
      (step): step is Extract<DemoStoryStep, { type: 'set_state' }> =>
        step.type === 'set_state',
    )?.state;

  const items = finalState?.items;

  if (!items || items.length === 0) {
    return assistantText;
  }

  return assistantText;
}

function buildRegisteredStories(stories: DemoStoryEntry[]) {
  return stories.map((entry) => ({
    id: entry.story.id,
    pluginAlias: entry.pluginAlias,
    pluginName: entry.pluginName,
    story: entry.story,
  }));
}

class DemoWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = DemoWebSocket.CONNECTING;

  constructor(url: string | URL) {
    super();
    this.url = String(url);

    window.setTimeout(() => {
      this.readyState = DemoWebSocket.OPEN;
      this.dispatchEvent(new Event('open'));
    }, 0);
  }

  send(data: string): void {
    const message = JSON.parse(data) as Record<string, unknown>;
    const requestId =
      typeof message.requestId === 'string' ? message.requestId : 'unknown';
    const type = message.type;

    if (type === 'authenticate') {
      this.emit({ type: 'done', requestId });
      return;
    }

    if (type === 'request_commands') {
      void demoAssetsPromise.then(({ commands }) => {
        this.emit({ type: 'commands_result', requestId, commands });
        this.emit({ type: 'done', requestId });
      });
      return;
    }

    if (type === 'request_composer_ai_state') {
      this.emit({
        type: 'composer_ai_state_result',
        requestId,
        state: composerAiState,
      });
      this.emit({ type: 'done', requestId });
      return;
    }

    if (type === 'load_timeline') {
      void demoAssetsPromise.then(({ stories }) => {
        this.emit({
          type: 'timeline_events_result',
          requestId,
          timelineId: message.timelineId,
          items: buildTimelineFromStories(stories),
          hasMore: false,
        });
        this.emit({ type: 'done', requestId });
      });
      return;
    }

    if (type === 'chat') {
      const content =
        typeof message.content === 'string' ? message.content : 'Demo message';
      this.emit({
        type: 'chat_stream_chunk',
        requestId,
        chunk: { kind: 'text_delta', text: 'Demo mode: ' },
      });
      this.emit({
        type: 'chat_stream_chunk',
        requestId,
        chunk: {
          kind: 'text_delta',
          text: `the copied web UI is running without the live backend. You sent: ${content}`,
        },
      });
      this.emit({
        type: 'chat_result',
        requestId,
        output: `Demo mode: the copied web UI is running without the live backend. You sent: ${content}`,
      });
      this.emit({ type: 'done', requestId });
      return;
    }

    if (type === 'run_command') {
      void demoAssetsPromise.then(({ stories }) => {
        const commandName =
          typeof message.command === 'string' ? message.command : null;
        const subcommandName =
          typeof message.subcommand === 'string' ? message.subcommand : null;

        const matchingStory =
          commandName && subcommandName
            ? (() => {
                if (commandName === 'story' && subcommandName === 'list') {
                  return null;
                }

                if (commandName === 'story' && subcommandName === 'start') {
                  return null;
                }

                const selected = getSelectedStory(stories);
                const selectedState = getStoryCurrentState(selected);

                if (
                  selected &&
                  selected.sourceType === 'command' &&
                  selected.pluginAlias === commandName &&
                  selected.sourceName === subcommandName
                ) {
                  return selected;
                }

                if (
                  commandName === 'todo' &&
                  subcommandName === 'list' &&
                  selectedState?.items &&
                  selectedState.items.length > 0
                ) {
                  return {
                    pluginAlias: 'todo',
                    pluginName: selected?.pluginName ?? 'todo',
                    sourceType: 'command' as const,
                    sourceName: 'list',
                    story: {
                      id: `${selected?.story.id ?? 'selected'}:todo-list-derived`,
                      title: 'Derived todo list',
                      kind: 'command' as const,
                      initialState: selectedState,
                      steps: [],
                      commandOutput: {
                        text: null,
                        web: buildTodoListWebOutputFromItems(
                          selectedState.items,
                        ),
                        clientView: null,
                      },
                    },
                  } satisfies DemoStoryEntry;
                }

                return stories.find(
                  (entry) =>
                    entry.sourceType === 'command' &&
                    entry.pluginAlias === commandName &&
                    entry.sourceName === subcommandName,
                );
              })()
            : null;

        const output = (() => {
          if (commandName === 'story' && subcommandName === 'list') {
            return renderStoryListWeb(buildRegisteredStories(stories));
          }

          if (commandName === 'story' && subcommandName === 'start') {
            const payload = message.payload as
              | { arguments?: Record<string, unknown> }
              | undefined;
            const storyId = payload?.arguments?.id;
            const story = buildRegisteredStories(stories).find(
              (entry) => entry.id === storyId,
            );

            return story
              ? renderStoryStartWeb(story, {
                  walkthrough: demoStoryPlaybackMode === 'interactive',
                  initialStepIndex: selectedStoryInitialStepIndex,
                })
              : `Unknown story: ${String(storyId)}`;
          }

          return matchingStory
            ? buildStoryCommandOutput(matchingStory)
            : 'Demo mode: command execution is not wired yet.';
        })();

        this.emit({
          type: 'command_result',
          requestId,
          output,
        });
        this.emit({ type: 'done', requestId });
      });
      return;
    }

    if (type === 'prompt_answer') {
      this.emit({ type: 'done', requestId });
      return;
    }

    this.emit({
      type: 'error',
      requestId,
      message: `Demo mode does not handle socket message type: ${String(type)}`,
    });
  }

  close(): void {
    this.readyState = DemoWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent('close'));
  }

  private emit(payload: unknown): void {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify(payload),
      }),
    );
  }
}

export function installDemoStubs(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method =
      init?.method ??
      (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    const pathname = new URL(url, window.location.origin).pathname;

    if (pathname === '/api/push/vapid-key' && method === 'GET') {
      return jsonResponse({ enabled: false, publicKey: null });
    }

    return originalFetch(input, init);
  };

  window.WebSocket = DemoWebSocket as unknown as typeof WebSocket;
}
