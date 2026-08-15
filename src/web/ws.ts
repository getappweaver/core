import { readFileSync } from 'fs';
import { join } from 'path';

import {
  clearOpencodeInterventionsForBridge,
  registerOpencodeInterventionBridge,
  resolveOpencodeIntervention,
  unregisterOpencodeInterventionBridge,
  type InterventionBridge,
} from '@src/backends/opencode-intervention';
import { summarizeOpencodeSdkSession } from '@src/backends/opencode-sdk';
import {
  monitoring,
  recordMonitoringSpans,
  runWithMonitoringContext,
} from '@src/core/monitoring';
import {
  getAgentBackend,
  getState,
  getWorkspaceTarget,
  STATE_CURRENT_SESSION,
  setInterventionMode,
} from '@src/db';
import { isDemoMode } from '@src/demo-mode';
import { log } from '@src/logger';
import { getSubcommandDefinition } from '@src/system/command-definition';
import {
  deleteTimelineEvent,
  insertTimelineEvent,
  listTimelineHistoryBefore,
  listTimelineHistoryLatest,
  upsertTimelineCommandForm,
} from '@src/timeline/db';
import type { TimelinePayload } from '@src/timeline/types';
import { assertUnreachable } from '@src/utils';
import type {
  TimelineEventOutput,
  WebHandlerResult,
  WebNodeRoot,
} from '@src/web/ui-schema';

import { executeWebCapability } from './capability-actions';
import { runWebChat } from './chat';
import {
  getCommandDefinitionForWeb,
  listAllCommandsDetailForWeb,
} from './command-catalog';
import { getComposerAiState, type ComposerAiState } from './composer-ai-state';
import { executeBuiltinCommand, executeBuiltinJsonCommand } from './execute';
import { verifyNip98Authorization } from './nip98-verify';
import type { WebRouteContext } from './routes';
import type { WebSocketPromptSession } from './ws-prompt-session';
import {
  AuthenticateClientMessageSchema,
  type ChatClientMessage,
  createChatResultMessage,
  createChatStreamChunkMessage,
  createCommandResultMessage,
  createComposerAiStateResultMessage,
  createCommandsResultMessage,
  createDoneMessage,
  createErrorMessage,
  createInterventionRequestMessage,
  createTimelineEventsResultMessage,
  type DeleteTimelineEventClientMessage,
  formatWebSocketClientParseFailure,
  type JsonCommandClientMessage,
  type LoadTimelineBeforeClientMessage,
  type LoadTimelineClientMessage,
  type RunCapabilityClientMessage,
  type RunCommandClientMessage,
  type ResolveInterventionClientMessage,
  type SaveTimelineFormClientMessage,
  type WebSocketClientMessage,
  WebSocketClientMessageSchema,
  type WebSocketServerMessage,
} from './ws-schema';

export type WebSocketData = {
  promptSession: WebSocketPromptSession;
  currentChatAbort: AbortController | null;
  interventionEnabled: boolean;
  interventionBridge: InterventionBridge | null;
  /** Set from NIP-98 on HTTP upgrade and/or first `authenticate` message. */
  nip98Authenticated: boolean;
  /** Demo sessions are intentionally restricted; they are not full backend auth. */
  demoAuthenticated: boolean;
};

function isTimelineEventOutput(
  output: WebHandlerResult,
): output is TimelineEventOutput {
  return typeof output !== 'string' && output.kind === 'timeline_event';
}

function insertCommandOutputTimelineEvent(props: {
  ctx: WebRouteContext;
  timelineId: string;
  output: TimelineEventOutput;
}): void {
  const { ctx, timelineId, output } = props;

  switch (output.event.type) {
    case 'diff':
      insertTimelineEvent(ctx.seenDb, {
        timelineId,
        source: 'web',
        kind: 'diff',
        role: null,
        command: null,
        subcommand: null,
        subcommandTag: null,
        values: null,
        form: null,
        text: null,
        web: null,
        clientView: null,
        diff: output.event.files,
        meta: {
          title: output.event.title,
          subtitle: output.event.subtitle,
          origin: output.event.origin,
          scopePath: output.event.scopePath ?? null,
          repositoryPath: output.event.repositoryPath ?? null,
          stagedFiles: output.event.stagedFiles ?? [],
        },
        prompt: null,
        requestId: null,
      });

      return;
    default:
      return assertUnreachable(output.event.type);
  }
}

function sendMessage(
  ws: Bun.ServerWebSocket<WebSocketData>,
  message: WebSocketServerMessage,
): void {
  ws.send(JSON.stringify(message));
}

function ensureInterventionBridge(
  ws: Bun.ServerWebSocket<WebSocketData>,
  db: WebRouteContext['seenDb'],
): InterventionBridge {
  if (ws.data.interventionBridge) {
    return ws.data.interventionBridge;
  }

  const bridge: InterventionBridge = {
    db,
    enabled: () => ws.data.interventionEnabled,
    send: (intervention) => {
      sendMessage(
        ws,
        createInterventionRequestMessage({
          requestId: intervention.id,
          intervention,
        }),
      );
    },
    abort: () => ws.data.currentChatAbort?.abort(),
  };

  ws.data.interventionBridge = bridge;

  return bridge;
}

function handleResolveIntervention(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  message: ResolveInterventionClientMessage;
}): void {
  const resolved = resolveOpencodeIntervention(params.message.interventionId, {
    action: params.message.action,
    output: params.message.output,
    remember: params.message.remember,
    ruleArgumentKey: params.message.ruleArgumentKey,
    rulePattern: params.message.rulePattern,
  });

  if (!resolved) {
    sendMessage(
      params.ws,
      createErrorMessage({
        requestId: params.message.requestId,
        message: 'intervention_not_found',
      }),
    );

    return;
  }

  sendMessage(params.ws, createDoneMessage(params.message.requestId));
}

function normalizeIncomingMessage(
  message: string | Buffer | ArrayBuffer,
): string {
  if (typeof message === 'string') {
    return message;
  }

  if (message instanceof ArrayBuffer) {
    return Buffer.from(message).toString('utf8');
  }

  return message.toString('utf8');
}

function isDemoAuthorization(value: string): boolean {
  return isDemoMode() && value === 'Nostr demo-token';
}

function demoComposerAiState(): ComposerAiState {
  return {
    backend: 'demo',
    interventionAvailable: false,
    interventionEnabled: false,
    currentSessionId: null,
    executionProfileLabel: 'Agent',
    executionProfileName: 'Demo Agent',
    executionProfileColor: 'info',
    effectiveModel: 'demo/model',
    provider: 'demo',
    modelOverride: null,
    opencodeModelFormChoices: [],
    contextStats: null,
  };
}

type ComposerContextStats = NonNullable<ComposerAiState['contextStats']>;

type WaitForUpdatedComposerAiStateProps = {
  ctx: WebRouteContext;
  previous: ComposerContextStats | null;
  attempts: number;
  delayMs: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function formatContextStats(stats: ComposerContextStats | null): string {
  if (!stats) {
    return 'unknown';
  }

  if (stats.contextPercent === null) {
    return formatTokenCount(stats.tokensTotal);
  }

  return `${formatTokenCount(stats.tokensTotal)} (${Math.round(stats.contextPercent)}%)`;
}

function contextStatsChanged(
  previous: ComposerContextStats | null,
  next: ComposerContextStats | null,
): boolean {
  if (!previous || !next) {
    return previous !== next;
  }

  return (
    previous.tokensTotal !== next.tokensTotal ||
    previous.contextLimit !== next.contextLimit ||
    previous.contextPercent !== next.contextPercent
  );
}

async function waitForUpdatedComposerAiState({
  ctx,
  previous,
  attempts,
  delayMs,
}: WaitForUpdatedComposerAiStateProps): Promise<ComposerAiState> {
  let latest = await getComposerAiState(ctx);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (contextStatsChanged(previous, latest.contextStats)) {
      return latest;
    }

    await sleep(delayMs);
    latest = await getComposerAiState(ctx);
  }

  return latest;
}

type DemoStoryEntry = {
  pluginAlias: string;
  iconUrl?: string;
  story: {
    id: string;
    title: string;
    description?: string;
    sandbox?: {
      __outputs?: Record<string, unknown[]>;
    };
  };
};

function loadGeneratedDemoStories(dmBotRoot: string): DemoStoryEntry[] {
  const filePath = join(dmBotRoot, 'web', 'public', 'demo', 'stories.json');

  return JSON.parse(readFileSync(filePath, 'utf8')) as DemoStoryEntry[];
}

function isWebNodeRoot(value: unknown): value is WebNodeRoot {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'ui' &&
    (value as { version?: unknown }).version === 1
  );
}

function demoWidgetOutput(params: {
  dmBotRoot: string;
  command: string;
  subcommand: string;
}): WebNodeRoot | null {
  const stories = loadGeneratedDemoStories(params.dmBotRoot);
  const outputKey = `${params.command}:${params.subcommand}`;

  const relatedStories = stories
    .filter((entry) => entry.pluginAlias === params.command)
    .map((entry) => ({
      id: entry.story.id,
      title: entry.story.title,
      description: entry.story.description,
      pluginAlias: entry.pluginAlias,
      iconUrl: entry.iconUrl,
    }));

  const outputs = stories.flatMap(
    (entry) => entry.story.sandbox?.__outputs?.[outputKey] ?? [],
  );

  const output = [...outputs].reverse().find(isWebNodeRoot);

  if (!output) {
    return null;
  }

  return {
    ...output,
    widgetHelp: output.widgetHelp
      ? {
          ...output.widgetHelp,
          stories:
            relatedStories.length > 0
              ? relatedStories
              : output.widgetHelp.stories,
          defaultOpen: true,
        }
      : undefined,
  };
}

function sendDemoWidgetOutput(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: RunCommandClientMessage;
  output: WebNodeRoot;
}): void {
  const { ws, ctx, message, output } = params;

  if (message.recordInTimeline !== false) {
    insertTimelineEvent(ctx.seenDb, {
      timelineId: message.timelineId,
      source: 'web',
      kind: 'command_result',
      role: null,
      command: message.command,
      subcommand: message.subcommand,
      subcommandTag: getResultSubcommandTag(
        message.command,
        message.subcommand,
        message.payload,
      ),
      values: message.payload,
      form: null,
      text: null,
      web: output,
      clientView: null,
      prompt: null,
      requestId: null,
    });
  }

  sendMessage(
    ws,
    createCommandResultMessage({
      requestId: message.requestId,
      output,
    }),
  );

  sendMessage(ws, createDoneMessage(message.requestId));
}

async function handleDemoWebSocketMessage(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: WebSocketClientMessage;
}): Promise<void> {
  const { ws, ctx, message } = params;

  switch (message.type) {
    case 'authenticate':
      sendMessage(ws, createDoneMessage(message.requestId));

      return;

    case 'request_commands':
      sendMessage(
        ws,
        createCommandsResultMessage({
          requestId: message.requestId,
          commands: listAllCommandsDetailForWeb(ctx.prefix),
        }),
      );

      sendMessage(ws, createDoneMessage(message.requestId));

      return;

    case 'request_composer_ai_state':
      sendMessage(
        ws,
        createComposerAiStateResultMessage({
          requestId: message.requestId,
          state: demoComposerAiState(),
        }),
      );

      sendMessage(ws, createDoneMessage(message.requestId));

      return;

    case 'compact_session':
      sendMessage(
        ws,
        createErrorMessage({
          requestId: message.requestId,
          message: 'Compaction is not available in demo mode.',
        }),
      );

      return;

    case 'load_timeline':
    case 'load_timeline_before':
      sendMessage(
        ws,
        createTimelineEventsResultMessage({
          requestId: message.requestId,
          timelineId: message.timelineId,
          items: [],
          hasMore: false,
        }),
      );

      sendMessage(ws, createDoneMessage(message.requestId));

      return;

    case 'run_command':
      if (
        message.command !== 'story' ||
        (message.subcommand !== 'list' && message.subcommand !== 'start')
      ) {
        const output = demoWidgetOutput({
          dmBotRoot: ctx.dmBotRoot,
          command: message.command,
          subcommand: message.subcommand,
        });

        if (output) {
          sendDemoWidgetOutput({ ws, ctx, message, output });

          return;
        }

        sendMessage(
          ws,
          createErrorMessage({
            requestId: message.requestId,
            message: 'demo_mode_only_allows_story_commands',
          }),
        );

        return;
      }

      await handleRunCommand({
        ws,
        ctx,
        message: { ...message, recordInTimeline: false },
      });

      return;

    case 'chat':
      sendMessage(
        ws,
        createChatResultMessage({
          requestId: message.requestId,
          output:
            'Demo mode only runs generated stories. Open /story list to start.',
        }),
      );

      sendMessage(ws, createDoneMessage(message.requestId));

      return;

    case 'prompt_answer':
    case 'cancel_chat':
    case 'set_intervention_mode':
    case 'resolve_intervention':
    case 'delete_timeline_event':
    case 'save_timeline_form':
    case 'record_monitoring_spans':
      sendMessage(ws, createDoneMessage(message.requestId));

      return;

    case 'json_command':
      sendMessage(
        ws,
        createErrorMessage({
          requestId: message.requestId,
          message: 'demo_mode_json_command_not_allowed',
        }),
      );

      return;

    case 'run_capability':
      sendMessage(
        ws,
        createErrorMessage({
          requestId: message.requestId,
          message: 'demo_mode_capability_not_allowed',
        }),
      );
  }
}

async function handleCompactSession(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  requestId: string;
}): Promise<void> {
  const { ws, ctx, requestId } = params;
  ws.data.currentChatAbort?.abort();
  const compactAbort = new AbortController();
  ws.data.currentChatAbort = compactAbort;
  let shouldSendDone = true;
  const backendName = getAgentBackend(ctx.seenDb);

  try {
    if (backendName !== 'opencode') {
      sendMessage(
        ws,
        createErrorMessage({
          requestId,
          message: 'Compaction is available only for the OpenCode backend.',
        }),
      );

      return;
    }

    const sessionId = getState(ctx.seenDb, STATE_CURRENT_SESSION);

    if (!sessionId) {
      sendMessage(
        ws,
        createErrorMessage({
          requestId,
          message: 'No active session to compact.',
        }),
      );

      return;
    }

    const state = await getComposerAiState(ctx);
    const beforeStats = state.contextStats;

    const cwd =
      getWorkspaceTarget(ctx.seenDb) === 'appweaver'
        ? ctx.dmBotRoot
        : ctx.parentOfBotRoot;

    sendMessage(
      ws,
      createCommandResultMessage({
        requestId,
        output: `Compacting current OpenCode session… Previous context: ${formatContextStats(beforeStats)}.`,
      }),
    );

    await summarizeOpencodeSdkSession({
      sessionId,
      cwd,
      effectiveModel: state.effectiveModel,
      auto: false,
      onAgentStreamChunk: (chunk) => {
        sendMessage(
          ws,
          createChatStreamChunkMessage({
            requestId,
            chunk,
          }),
        );
      },
      streamAbortSignal: compactAbort.signal,
    });

    const afterState = await waitForUpdatedComposerAiState({
      ctx,
      previous: beforeStats,
      attempts: 6,
      delayMs: 500,
    });

    const afterStats = afterState.contextStats;
    const statsChanged = contextStatsChanged(beforeStats, afterStats);

    const output = statsChanged
      ? `Compacted context: ${formatContextStats(beforeStats)} → ${formatContextStats(afterStats)}.`
      : `Compaction completed, but OpenCode has not reported updated context stats yet. Current context: ${formatContextStats(afterStats)}.`;

    sendMessage(
      ws,
      createCommandResultMessage({
        requestId,
        output,
      }),
    );
  } catch (err) {
    if (compactAbort.signal.aborted) {
      sendMessage(
        ws,
        createCommandResultMessage({
          requestId,
          output: 'Compaction interrupted.',
        }),
      );

      return;
    }

    shouldSendDone = false;
    throw err;
  } finally {
    if (ws.data.currentChatAbort === compactAbort) {
      ws.data.currentChatAbort = null;
    }

    if (shouldSendDone) {
      sendMessage(ws, createDoneMessage(requestId));
    }
  }
}

function summarizeInvocation(
  command: string,
  subcommand: string,
  values: TimelinePayload,
): string {
  const parts = [`/${command}`];

  if (!(command === 'help' && subcommand === 'topic')) {
    parts.push(subcommand);
  }

  for (const value of Object.values(values.arguments)) {
    if (value !== '' && value != null) {
      parts.push(String(value));
    }
  }

  for (const [key, value] of Object.entries(values.options)) {
    if (value === true) {
      parts.push(`--${key}`);
    } else if (value !== false && value !== '' && value != null) {
      parts.push(`--${key}`, String(value));
    }
  }

  return parts.join(' ');
}

function getResultSubcommandTag(
  command: string,
  subcommand: string,
  values: TimelinePayload,
): string {
  if (command === 'help' && subcommand === 'topic') {
    const path = values.arguments.path;

    if (Array.isArray(path)) {
      return path.join(' ');
    }

    if (typeof path === 'string' && path.trim().length > 0) {
      return path.trim();
    }
  }

  return subcommand;
}

async function handleLoadTimeline(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: LoadTimelineClientMessage;
}): Promise<void> {
  const result = listTimelineHistoryLatest(
    params.ctx.seenDb,
    params.message.timelineId,
    params.message.limit,
  );

  sendMessage(
    params.ws,
    createTimelineEventsResultMessage({
      requestId: params.message.requestId,
      timelineId: params.message.timelineId,
      items: result.items,
      hasMore: result.hasMore,
    }),
  );

  sendMessage(params.ws, createDoneMessage(params.message.requestId));
}

async function handleLoadTimelineBefore(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: LoadTimelineBeforeClientMessage;
}): Promise<void> {
  const result = listTimelineHistoryBefore(
    params.ctx.seenDb,
    params.message.timelineId,
    params.message.beforeCreatedAt,
    params.message.limit,
  );

  sendMessage(
    params.ws,
    createTimelineEventsResultMessage({
      requestId: params.message.requestId,
      timelineId: params.message.timelineId,
      items: result.items,
      hasMore: result.hasMore,
    }),
  );

  sendMessage(params.ws, createDoneMessage(params.message.requestId));
}

async function handleDeleteTimelineEvent(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: DeleteTimelineEventClientMessage;
}): Promise<void> {
  deleteTimelineEvent(
    params.ctx.seenDb,
    params.message.timelineId,
    params.message.eventId,
  );

  sendMessage(params.ws, createDoneMessage(params.message.requestId));
}

async function handleSaveTimelineForm(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: SaveTimelineFormClientMessage;
}): Promise<void> {
  upsertTimelineCommandForm(params.ctx.seenDb, {
    eventId: params.message.eventId,
    timelineId: params.message.timelineId,
    source: 'web',
    command: params.message.command,
    form: params.message.form,
  });

  sendMessage(params.ws, createDoneMessage(params.message.requestId));
}

async function handleRunCommand(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: RunCommandClientMessage;
}): Promise<void> {
  const { ws, ctx, message } = params;
  const command = getCommandDefinitionForWeb(ctx.prefix, message.command);

  if (!command) {
    sendMessage(
      ws,
      createErrorMessage({
        requestId: message.requestId,
        message: 'command_not_found',
      }),
    );

    return;
  }

  const subcommand = getSubcommandDefinition(command, message.subcommand);

  if (!subcommand) {
    sendMessage(
      ws,
      createErrorMessage({
        requestId: message.requestId,
        message: 'subcommand_not_found',
      }),
    );

    return;
  }

  const recordTl = message.recordInTimeline !== false;

  const promptFn = ws.data.promptSession.createPromptFn({
    requestId: message.requestId,
    timelineId: message.timelineId,
    recordInTimeline: recordTl,
    send: (serverMessage) => {
      if (serverMessage.type === 'prompt' && recordTl) {
        insertTimelineEvent(ctx.seenDb, {
          timelineId: message.timelineId,
          source: 'web',
          kind: 'prompt',
          role: null,
          command: null,
          subcommand: null,
          subcommandTag: null,
          values: null,
          form: null,
          text: null,
          web: null,
          clientView: null,
          prompt: serverMessage.prompt,
          requestId: serverMessage.requestId,
        });
      }

      sendMessage(ws, serverMessage);
    },
  });

  if (recordTl) {
    insertTimelineEvent(ctx.seenDb, {
      timelineId: message.timelineId,
      source: 'web',
      kind: 'chat',
      role: 'user',
      command: null,
      subcommand: null,
      subcommandTag: null,
      values: null,
      form: null,
      text: summarizeInvocation(
        message.command,
        message.subcommand,
        message.payload,
      ),
      web: null,
      clientView: null,
      prompt: null,
      requestId: null,
    });
  }

  const result = await executeBuiltinCommand({
    ctx,
    command,
    subcommand,
    payload: message.payload,
    sendReply: async (reply) => {
      if (recordTl) {
        insertTimelineEvent(ctx.seenDb, {
          timelineId: message.timelineId,
          source: 'web',
          kind: 'command_result',
          role: null,
          command: message.command,
          subcommand: message.subcommand,
          subcommandTag: getResultSubcommandTag(
            message.command,
            message.subcommand,
            message.payload,
          ),
          values: message.payload,
          form: null,
          text: reply,
          web: null,
          clientView: null,
          prompt: null,
          requestId: null,
        });
      }

      sendMessage(
        ws,
        createCommandResultMessage({
          requestId: message.requestId,
          output: reply,
        }),
      );
    },
    promptFn,
  });

  if (recordTl && isTimelineEventOutput(result.output)) {
    insertCommandOutputTimelineEvent({
      ctx,
      timelineId: message.timelineId,
      output: result.output,
    });
  } else if (recordTl) {
    insertTimelineEvent(ctx.seenDb, {
      timelineId: message.timelineId,
      source: 'web',
      kind: 'command_result',
      role: null,
      command: message.command,
      subcommand: message.subcommand,
      subcommandTag: getResultSubcommandTag(
        message.command,
        message.subcommand,
        message.payload,
      ),
      values: message.payload,
      form: null,
      text: typeof result.output === 'string' ? result.output : null,
      web:
        typeof result.output === 'string' ||
        result.output.kind === 'client_view' ||
        result.output.kind === 'timeline_event'
          ? null
          : result.output,
      clientView:
        typeof result.output === 'string' ||
        result.output.kind === 'ui' ||
        result.output.kind === 'timeline_event'
          ? null
          : result.output,
      prompt: null,
      requestId: null,
    });
  }

  sendMessage(
    ws,
    createCommandResultMessage({
      requestId: message.requestId,
      output: result.output,
    }),
  );

  sendMessage(ws, createDoneMessage(message.requestId));
}

async function handleJsonCommand(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: JsonCommandClientMessage;
}): Promise<void> {
  const { ws, ctx, message } = params;
  const command = getCommandDefinitionForWeb(ctx.prefix, message.command);

  if (!command) {
    sendMessage(
      ws,
      createErrorMessage({
        requestId: message.requestId,
        message: 'command_not_found',
      }),
    );

    return;
  }

  const subcommand = getSubcommandDefinition(command, message.subcommand);

  if (!subcommand) {
    sendMessage(
      ws,
      createErrorMessage({
        requestId: message.requestId,
        message: 'subcommand_not_found',
      }),
    );

    return;
  }

  const output = await executeBuiltinJsonCommand({
    ctx,
    command,
    subcommand,
    payload: message.payload,
  });

  sendMessage(
    ws,
    createCommandResultMessage({
      requestId: message.requestId,
      output,
    }),
  );

  sendMessage(ws, createDoneMessage(message.requestId));
}

async function handleRunCapability(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: RunCapabilityClientMessage;
}): Promise<void> {
  const { ws, ctx, message } = params;

  const output = await executeWebCapability({
    operation: message.operation,
    input: message.input,
    consumerAlias: message.consumerAlias,
    providerId: message.providerId ?? null,
    selection: message.selection,
    surface: message.surface ?? null,
    modalTitle: message.modalTitle ?? null,
  });

  if (output) {
    if (message.surface === 'timeline') {
      insertTimelineEvent(ctx.seenDb, {
        timelineId: message.timelineId,
        source: 'web',
        kind: 'command_result',
        role: null,
        command: message.consumerAlias,
        subcommand: message.operation,
        subcommandTag: message.operation,
        values: null,
        form: null,
        text: null,
        web: output,
        clientView: null,
        prompt: null,
        requestId: null,
      });
    }

    sendMessage(
      ws,
      createCommandResultMessage({
        requestId: message.requestId,
        output,
      }),
    );
  }

  sendMessage(ws, createDoneMessage(message.requestId));
}

async function handleChat(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: ChatClientMessage;
}): Promise<void> {
  const { ws, ctx, message } = params;
  const backendName = getAgentBackend(ctx.seenDb);

  const useStream = backendName === 'opencode' || backendName === 'cursor';

  ws.data.currentChatAbort?.abort();
  const chatAbort = new AbortController();
  ws.data.currentChatAbort = chatAbort;

  insertTimelineEvent(ctx.seenDb, {
    timelineId: message.timelineId,
    source: 'web',
    kind: 'chat',
    role: 'user',
    command: null,
    subcommand: null,
    subcommandTag: null,
    values: null,
    form: null,
    text: message.content,
    web: null,
    clientView: null,
    prompt: null,
    requestId: null,
  });

  let result: { output: string; sessionId: string };
  let streamedReasoning = '';
  let reasoningSegmentIndex = 0;
  let currentReasoningSegmentId: string | null = null;
  let registeredSessionId: string | null = null;
  const sessionBridge = ensureInterventionBridge(ws, ctx.seenDb);

  function closeCurrentReasoningSegment(): void {
    currentReasoningSegmentId = null;
    streamedReasoning = '';
  }

  try {
    log.info(`[websocket] chat run start ${message.requestId}`);

    result = await runWebChat({
      ctx,
      content: message.content,
      onSessionReady: (sessionId) => {
        registeredSessionId = sessionId;

        registerOpencodeInterventionBridge({
          sessionId,
          bridge: sessionBridge,
        });
      },
      onStreamChunk: useStream
        ? (chunk) => {
            sendMessage(
              ws,
              createChatStreamChunkMessage({
                requestId: message.requestId,
                chunk,
              }),
            );

            if (chunk.kind === 'text_delta') {
              closeCurrentReasoningSegment();
            }

            if (chunk.kind === 'diff') {
              closeCurrentReasoningSegment();
            }

            if (chunk.kind === 'tool') {
              closeCurrentReasoningSegment();

              insertTimelineEvent(ctx.seenDb, {
                id: `${message.requestId}-tool-${chunk.tool.callId}`,
                timelineId: message.timelineId,
                source: 'web',
                kind: 'tool',
                role: null,
                command: null,
                subcommand: null,
                subcommandTag: null,
                values: null,
                form: null,
                text: null,
                web: null,
                clientView: null,
                tool: chunk.tool,
                prompt: null,
                requestId: null,
              });
            }

            if (chunk.kind === 'reasoning_delta') {
              if (!currentReasoningSegmentId) {
                reasoningSegmentIndex += 1;
                currentReasoningSegmentId = `${message.requestId}-reasoning-${reasoningSegmentIndex}`;
              }

              streamedReasoning += chunk.text;

              insertTimelineEvent(ctx.seenDb, {
                id: currentReasoningSegmentId,
                timelineId: message.timelineId,
                source: 'web',
                kind: 'reasoning',
                role: null,
                command: null,
                subcommand: null,
                subcommandTag: null,
                values: null,
                form: null,
                text: streamedReasoning,
                web: null,
                clientView: null,
                prompt: null,
                requestId: null,
              });
            }

            if (chunk.kind === 'summary') {
              closeCurrentReasoningSegment();

              insertTimelineEvent(ctx.seenDb, {
                id: `${message.requestId}-summary-${chunk.id}`,
                timelineId: message.timelineId,
                source: 'web',
                kind: 'agent_summary',
                role: null,
                command: null,
                subcommand: null,
                subcommandTag: null,
                values: null,
                form: null,
                text: chunk.text,
                web: null,
                clientView: null,
                prompt: null,
                requestId: null,
              });
            }
          }
        : null,
      streamAbortSignal: useStream ? chatAbort.signal : null,
    });

    log.info(`[websocket] chat run complete ${message.requestId}`);
  } catch (err) {
    log.warn(
      `[websocket] chat run failed ${message.requestId}: ${err instanceof Error ? err.message : String(err)}`,
    );

    ws.data.currentChatAbort = null;
    throw err;
  } finally {
    if (registeredSessionId) {
      unregisterOpencodeInterventionBridge({
        sessionId: registeredSessionId,
        bridge: sessionBridge,
      });
    }

    if (ws.data.currentChatAbort === chatAbort) {
      ws.data.currentChatAbort = null;
    }
  }

  const output = result.output;

  log.info(
    `[websocket] inserting assistant chat ${message.requestId} (${output.length} chars)`,
  );

  insertTimelineEvent(ctx.seenDb, {
    timelineId: message.timelineId,
    source: 'web',
    kind: 'chat',
    role: 'assistant',
    command: null,
    subcommand: null,
    subcommandTag: null,
    values: null,
    form: null,
    text: output,
    web: null,
    clientView: null,
    prompt: null,
    requestId: null,
  });

  sendMessage(
    ws,
    createChatResultMessage({
      requestId: message.requestId,
      output,
    }),
  );

  log.info(`[websocket] sent chat_result ${message.requestId}`);

  sendMessage(ws, createDoneMessage(message.requestId));
  log.info(`[websocket] sent done ${message.requestId}`);
}

export function createWebSocketHandler(ctx: WebRouteContext) {
  return {
    open(ws: Bun.ServerWebSocket<WebSocketData>): void {
      ensureInterventionBridge(ws, ctx.seenDb);
    },
    close(ws: Bun.ServerWebSocket<WebSocketData>): void {
      ws.data.currentChatAbort?.abort();
      ws.data.currentChatAbort = null;
      ws.data.promptSession.clearAll();
      ws.data.interventionEnabled = false;

      if (ws.data.interventionBridge) {
        clearOpencodeInterventionsForBridge(ws.data.interventionBridge);
      }
    },
    message(
      ws: Bun.ServerWebSocket<WebSocketData>,
      raw: string | Buffer | ArrayBuffer,
    ): void {
      void (async () => {
        let payload: unknown;

        try {
          payload = JSON.parse(normalizeIncomingMessage(raw));
        } catch {
          sendMessage(
            ws,
            createErrorMessage({
              requestId: 'unknown',
              message: 'invalid_json',
            }),
          );

          return;
        }

        if (!ws.data.nip98Authenticated) {
          const authTry = AuthenticateClientMessageSchema.safeParse(payload);

          if (!authTry.success) {
            sendMessage(
              ws,
              createErrorMessage({
                requestId:
                  payload &&
                  typeof payload === 'object' &&
                  'requestId' in payload
                    ? String(
                        (payload as { requestId?: unknown }).requestId ??
                          'unknown',
                      )
                    : 'unknown',
                message: 'websocket_nip98_required',
              }),
            );

            ws.close();

            return;
          }

          const demoAuth = isDemoAuthorization(authTry.data.authorization);

          const nip = demoAuth
            ? ({ ok: true } as const)
            : verifyNip98Authorization({
                authorizationHeader: authTry.data.authorization,
                pathname: '/ws',
                requestMethod: 'GET',
                masterPubkey: ctx.config.masterPubkey,
              });

          if (!nip.ok) {
            sendMessage(
              ws,
              createErrorMessage({
                requestId: authTry.data.requestId,
                message: `unauthorized:${nip.reason}`,
              }),
            );

            ws.close();

            return;
          }

          ws.data.nip98Authenticated = true;
          ws.data.demoAuthenticated = demoAuth;
          sendMessage(ws, createDoneMessage(authTry.data.requestId));

          return;
        }

        const clientParsed = WebSocketClientMessageSchema.safeParse(payload);

        if (!clientParsed.success) {
          sendMessage(
            ws,
            createErrorMessage({
              requestId:
                payload && typeof payload === 'object' && 'requestId' in payload
                  ? String(
                      (payload as { requestId?: unknown }).requestId ??
                        'unknown',
                    )
                  : 'unknown',
              message: formatWebSocketClientParseFailure({
                payload,
                error: clientParsed.error,
              }),
            }),
          );

          return;
        }

        const message = clientParsed.data;

        try {
          if (ws.data.demoAuthenticated) {
            await handleDemoWebSocketMessage({ ws, ctx, message });

            return;
          }

          switch (message.type) {
            case 'authenticate': {
              sendMessage(ws, createDoneMessage(message.requestId));

              return;
            }

            case 'request_commands': {
              sendMessage(
                ws,
                createCommandsResultMessage({
                  requestId: message.requestId,
                  commands: listAllCommandsDetailForWeb(ctx.prefix),
                }),
              );

              sendMessage(ws, createDoneMessage(message.requestId));

              return;
            }

            case 'request_composer_ai_state': {
              sendMessage(
                ws,
                createComposerAiStateResultMessage({
                  requestId: message.requestId,
                  state: await getComposerAiState(ctx),
                }),
              );

              sendMessage(ws, createDoneMessage(message.requestId));

              return;
            }

            case 'compact_session': {
              await handleCompactSession({
                ws,
                ctx,
                requestId: message.requestId,
              });

              return;
            }

            case 'load_timeline': {
              await handleLoadTimeline({ ws, ctx, message });

              return;
            }

            case 'load_timeline_before': {
              await handleLoadTimelineBefore({ ws, ctx, message });

              return;
            }

            case 'run_command': {
              if (message.traceContext) {
                await runWithMonitoringContext(message.traceContext, () =>
                  monitoring.withSpan({
                    name: 'appweaver.command',
                    attributes: {
                      command: message.command,
                      subcommand: message.subcommand,
                    },
                    parent: null,
                    run: () => handleRunCommand({ ws, ctx, message }),
                  }),
                );
              } else {
                await handleRunCommand({ ws, ctx, message });
              }

              return;
            }

            case 'record_monitoring_spans': {
              recordMonitoringSpans(message.spans);
              sendMessage(ws, createDoneMessage(message.requestId));

              return;
            }

            case 'json_command': {
              await handleJsonCommand({
                ws,
                ctx,
                message,
              });

              return;
            }

            case 'run_capability': {
              await handleRunCapability({ ws, ctx, message });

              return;
            }

            case 'prompt_answer': {
              const resolved =
                ws.data.promptSession.resolvePromptAnswer(message);

              if (!resolved.resolved) {
                sendMessage(
                  ws,
                  createErrorMessage({
                    requestId: message.requestId,
                    message: 'prompt_not_found',
                  }),
                );
              } else if (
                resolved.timelineId &&
                resolved.recordInTimeline !== false
              ) {
                insertTimelineEvent(ctx.seenDb, {
                  timelineId: resolved.timelineId,
                  source: 'web',
                  kind: 'chat',
                  role: 'user',
                  command: null,
                  subcommand: null,
                  subcommandTag: null,
                  values: null,
                  form: null,
                  text: message.answer,
                  web: null,
                  clientView: null,
                  prompt: null,
                  requestId: null,
                });
              }

              return;
            }

            case 'chat': {
              await handleChat({
                ws,
                ctx,
                message,
              });

              return;
            }

            case 'cancel_chat': {
              ws.data.currentChatAbort?.abort();

              if (ws.data.interventionBridge) {
                clearOpencodeInterventionsForBridge(ws.data.interventionBridge);
              }

              sendMessage(ws, createDoneMessage(message.requestId));

              return;
            }

            case 'set_intervention_mode': {
              ws.data.interventionEnabled = message.enabled;
              setInterventionMode(ctx.seenDb, message.enabled);

              log.info(
                `[intervention] mode ${message.enabled ? 'enabled' : 'disabled'}`,
              );

              sendMessage(ws, createDoneMessage(message.requestId));

              return;
            }

            case 'resolve_intervention': {
              handleResolveIntervention({ ws, message });

              return;
            }

            case 'delete_timeline_event': {
              await handleDeleteTimelineEvent({ ws, ctx, message });

              return;
            }

            case 'save_timeline_form': {
              await handleSaveTimelineForm({ ws, ctx, message });

              return;
            }
          }
        } catch (err) {
          sendMessage(
            ws,
            createErrorMessage({
              requestId: message.requestId,
              message: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      })();
    },
  };
}
