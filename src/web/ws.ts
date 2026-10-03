import { readFileSync } from 'fs';
import { join } from 'path';

import {
  clearOpencodeInterventionsForBridge,
  clearOpencodeInterventionsForSession,
  registerOpencodeInterventionBridge,
  resolveOpencodeIntervention,
  unregisterOpencodeInterventionBridge,
  type InterventionBridge,
} from '@src/backends/opencode-intervention';
import {
  replyOpencodeSdkQuestion,
  summarizeOpencodeSdkSession,
} from '@src/backends/opencode-sdk';
import {
  monitoring,
  recordMonitoringSpans,
  runWithMonitoringContext,
} from '@src/core/monitoring';
import { createWebPrompt } from '@src/core/plugin';
import {
  getAgentBackend,
  getWorkspaceTarget,
  setInterventionMode,
} from '@src/db';
import { isDemoMode } from '@src/demo-mode';
import { debug, log } from '@src/logger';
import type { InteractivePaymentBroker } from '@src/payments/service';
import { createBrokerPaymentServiceFactory } from '@src/payments/service';
import type { WebSocketPaymentSession } from '@src/payments/web-prompt';
import { PROCESS_INSTANCE_ID } from '@src/process-instance';
import { assertWebSession, renameAppWeaverSession } from '@src/session';
import { watchSessionTitles } from '@src/session-title-notifications';
import { getSubcommandDefinition } from '@src/system/command-definition';
import {
  deleteTimelineEvent,
  getTimelineInsertionCursor,
  getSessionUnreadWindow,
  insertTimelineEvent,
  listTimelineHistoryBefore,
  listTimelineHistoryAfter,
  listTimelineHistoryLatest,
  markSessionRead,
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
import {
  finishSessionRun,
  startSessionRun,
  stopSessionRun,
} from './session-runs';
import type { WebSocketPromptSession } from './ws-prompt-session';
import {
  AuthenticateClientMessageSchema,
  type ChatClientMessage,
  createCapabilityProvidersResultMessage,
  createChatResultMessage,
  createChatStreamChunkMessage,
  createCommandResultMessage,
  createCommandsResultMessage,
  createComposerAiStateResultMessage,
  createDoneMessage,
  createErrorMessage,
  createInterventionRequestMessage,
  createTimelineEventsResultMessage,
  type DeleteTimelineEventClientMessage,
  formatWebSocketClientParseFailure,
  type JsonCommandClientMessage,
  type ListCapabilityProvidersClientMessage,
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
  questionSessions: Set<string>;
  interventionEnabled: boolean;
  interventionBridge: InterventionBridge | null;
  /** Set from NIP-98 on HTTP upgrade and/or first `authenticate` message. */
  nip98Authenticated: boolean;
  /** Demo sessions are intentionally restricted; they are not full backend auth. */
  demoAuthenticated: boolean;
  /** Stable identity for interactive-payment concurrency on this browser connection. */
  paymentScopeId: string;
  paymentSession: WebSocketPaymentSession;
  paymentBroker: InteractivePaymentBroker;
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
}): string {
  const { ctx, timelineId, output } = props;

  switch (output.event.type) {
    case 'diff':
      return insertTimelineEvent(ctx.seenDb, {
        timelineId,
        sessionId: timelineId,
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
      }).id;
    default:
      return assertUnreachable(output.event.type);
  }
}

function sendMessage(
  ws: Bun.ServerWebSocket<WebSocketData>,
  message: WebSocketServerMessage,
): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
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
    enabled: () => ws.readyState === 1 && ws.data.interventionEnabled,
    send: (intervention) => {
      sendMessage(
        ws,
        createInterventionRequestMessage({
          requestId: intervention.id,
          intervention,
        }),
      );
    },
    abort: (sessionId) => stopSessionRun(sessionId),
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
    backend: 'opencode',
    interventionAvailable: false,
    interventionEnabled: false,
    currentSessionId: null,
    workspace: 'appweaver',
    sessionRunning: false,
    currentSessionTitle: null,
    recentSessions: [],
    modelSource: {
      providerId: 'demo/ai-model-source/v1',
      state: {
        sourceId: 'demo/ai-model-source/v1',
        title: 'Demo models',
        active: true,
        transitionState: 'stable',
        health: { status: 'healthy' },
        selectedModelId: 'demo/model',
        effectiveModelId: 'demo/model',
        fallbackReason: 'selected',
        catalogRevision: 'demo-1',
      },
      models: [],
    },
    modelSources: [
      {
        providerId: 'demo/ai-model-source/v1',
        alias: 'core',
        title: 'Core models',
        active: true,
        health: { status: 'healthy' },
      },
    ],
    contextStats: null,
  };
}

type ComposerContextStats = NonNullable<ComposerAiState['contextStats']>;

type WaitForUpdatedComposerAiStateProps = {
  ctx: WebRouteContext;
  sessionId: string;
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

  const prefix = stats.estimated ? '≈' : '';

  if (stats.contextPercent === null) {
    return `${prefix}${formatTokenCount(stats.tokensTotal)}`;
  }

  return `${prefix}${formatTokenCount(stats.tokensTotal)} (${Math.round(stats.contextPercent)}%)`;
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
    previous.contextPercent !== next.contextPercent ||
    previous.estimated !== next.estimated
  );
}

async function waitForUpdatedComposerAiState({
  ctx,
  sessionId,
  previous,
  attempts,
  delayMs,
}: WaitForUpdatedComposerAiStateProps): Promise<ComposerAiState> {
  let latest = await getComposerAiState(ctx, sessionId);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (contextStatsChanged(previous, latest.contextStats)) {
      return latest;
    }

    await sleep(delayMs);
    latest = await getComposerAiState(ctx, sessionId);
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
      sessionId: message.timelineId,
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
          firstUnreadId: null,
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
          sessionId: message.sessionId,
          eventId: null,
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

    case 'list_capability_providers':
      sendMessage(
        ws,
        createErrorMessage({
          requestId: message.requestId,
          message: 'demo_mode_capability_not_allowed',
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
  sessionId: string;
}): Promise<void> {
  const { requestId, sessionId } = params;
  const compactAbort = startSessionRun(sessionId, requestId, 'compact');

  try {
    await compactSessionInRun(params, compactAbort);
  } finally {
    finishSessionRun(sessionId, requestId);
  }
}

async function compactSessionInRun(
  params: {
    ws: Bun.ServerWebSocket<WebSocketData>;
    ctx: WebRouteContext;
    requestId: string;
    sessionId: string;
  },
  compactAbort: AbortController,
): Promise<void> {
  const { ws, ctx, requestId, sessionId } = params;
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

    const state = await getComposerAiState(ctx, sessionId);
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
      effectiveModel: state.modelSource.state.effectiveModelId,
      auto: false,
      onAgentStreamChunk: (chunk) => {
        sendMessage(
          ws,
          createChatStreamChunkMessage({
            requestId,
            sessionId,
            chunk,
          }),
        );
      },
      streamAbortSignal: compactAbort.signal,
    });

    const afterState = await waitForUpdatedComposerAiState({
      ctx,
      sessionId,
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
      parts.push(
        Array.isArray(value)
          ? value
              .filter((item) => item !== '')
              .map(String)
              .join(' ')
          : String(value),
      );
    }
  }

  for (const [key, value] of Object.entries(values.options)) {
    if (value === true) {
      parts.push(`--${key}`);
    } else if (value !== false && value !== '' && value != null) {
      parts.push(
        `--${key}`,
        Array.isArray(value)
          ? value
              .filter((item) => item !== '')
              .map(String)
              .join(' ')
          : String(value),
      );
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
  if (params.message.afterCursor !== null) {
    const result = listTimelineHistoryAfter({
      db: params.ctx.seenDb,
      timelineId: params.message.timelineId,
      afterCursor: params.message.afterCursor,
      limit: params.message.limit,
    });

    sendMessage(params.ws, {
      ...createTimelineEventsResultMessage({
        requestId: params.message.requestId,
        timelineId: params.message.timelineId,
        items: result.items,
        hasMore: result.hasMore,
        firstUnreadId: null,
      }),
      cursor: result.cursor,
    });

    sendMessage(params.ws, createDoneMessage(params.message.requestId));

    return;
  }

  const cursor = getTimelineInsertionCursor(params.ctx.seenDb);

  const unread = getSessionUnreadWindow(
    params.ctx.seenDb,
    params.message.timelineId,
    params.message.limit,
  );

  const result = listTimelineHistoryLatest(
    params.ctx.seenDb,
    params.message.timelineId,
    unread.limit,
  );

  const firstUnreadId = result.items.some(
    (item) => item.id === unread.firstUnreadId,
  )
    ? unread.firstUnreadId
    : null;

  sendMessage(params.ws, {
    ...createTimelineEventsResultMessage({
      requestId: params.message.requestId,
      timelineId: params.message.timelineId,
      items: result.items,
      hasMore: result.hasMore,
      firstUnreadId,
    }),
    cursor,
  });

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
      firstUnreadId: null,
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
    sessionId: params.message.timelineId,
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
  paymentBroker?: InteractivePaymentBroker;
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
        const event = insertTimelineEvent(ctx.seenDb, {
          timelineId: message.timelineId,
          sessionId: message.timelineId,
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

        sendMessage(ws, { ...serverMessage, timelineEventId: event.id });

        return;
      }

      sendMessage(ws, serverMessage);
    },
  });

  if (recordTl) {
    insertTimelineEvent(ctx.seenDb, {
      id: `${message.requestId}-user`,
      timelineId: message.timelineId,
      sessionId: message.timelineId,
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
      let timelineEventId: string | undefined;

      if (recordTl) {
        timelineEventId = insertTimelineEvent(ctx.seenDb, {
          timelineId: message.timelineId,
          sessionId: message.timelineId,
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
        }).id;
      }

      sendMessage(ws, {
        ...createCommandResultMessage({
          requestId: message.requestId,
          output: reply,
        }),
        timelineEventId,
      });
    },
    promptFn,
    interactivePaymentServiceFactory: params.paymentBroker
      ? createBrokerPaymentServiceFactory({
          broker: params.paymentBroker,
          scopeId: ws.data.paymentScopeId,
        })
      : undefined,
  });

  let timelineEventId: string | undefined;

  if (recordTl && isTimelineEventOutput(result.output)) {
    timelineEventId = insertCommandOutputTimelineEvent({
      ctx,
      timelineId: message.timelineId,
      output: result.output,
    });
  } else if (recordTl) {
    timelineEventId = insertTimelineEvent(ctx.seenDb, {
      timelineId: message.timelineId,
      sessionId: message.timelineId,
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
    }).id;
  }

  sendMessage(ws, {
    ...createCommandResultMessage({
      requestId: message.requestId,
      output: result.output,
    }),
    timelineEventId,
  });

  sendMessage(ws, createDoneMessage(message.requestId));
}

async function handleJsonCommand(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: JsonCommandClientMessage;
  paymentBroker?: InteractivePaymentBroker;
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
    interactivePaymentServiceFactory: params.paymentBroker
      ? createBrokerPaymentServiceFactory({
          broker: params.paymentBroker,
          scopeId: ws.data.paymentScopeId,
        })
      : undefined,
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

async function handleListCapabilityProviders(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  message: ListCapabilityProvidersClientMessage;
}): Promise<void> {
  const { ws, message } = params;

  const { capabilityRegistry } =
    await import('@src/core/capabilities/registry');

  const providers = capabilityRegistry.listProviders(message.capability);

  sendMessage(
    ws,
    createCapabilityProvidersResultMessage({
      requestId: message.requestId,
      capability: message.capability,
      providers,
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

  // Raw capability path for fuzzy-file-search (composer picker needs JSON output, not WebNodeRoot)
  if (message.operation === 'capability:v1:fuzzy-file-search.search') {
    const { capabilityRegistry } =
      await import('@src/core/capabilities/registry');

    const { getPluginByAlias } = await import('@src/core/registry');

    const consumer = getPluginByAlias(message.consumerAlias);

    if (!consumer) {
      sendMessage(
        ws,
        createErrorMessage({
          requestId: message.requestId,
          message: `Unknown capability consumer: ${message.consumerAlias}`,
        }),
      );

      return;
    }

    const result = await capabilityRegistry.invokeById({
      operationId: message.operation,
      provider: message.providerId ?? 'auto',
      input: message.input,
      caller: {
        type: 'plugin',
        pluginName: consumer.identity.name,
        alias: consumer.identity.alias,
      },
    });

    if (result.status === 'success') {
      const { createCapabilityResultMessage } = await import('./ws-schema');

      sendMessage(
        ws,
        createCapabilityResultMessage({
          requestId: message.requestId,
          operation: message.operation,
          output: result.output,
          provider: result.provider,
        }),
      );
    } else if (result.status === 'missing') {
      sendMessage(
        ws,
        createErrorMessage({
          requestId: message.requestId,
          message: `Capability provider missing for ${message.operation}`,
        }),
      );
    } else if (result.status === 'selection-required') {
      sendMessage(
        ws,
        createErrorMessage({
          requestId: message.requestId,
          message: `Capability provider selection required for ${message.operation}`,
        }),
      );
    }

    sendMessage(ws, createDoneMessage(message.requestId));

    return;
  }

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
    let timelineEventId: string | undefined;

    if (message.surface === 'timeline') {
      timelineEventId = insertTimelineEvent(ctx.seenDb, {
        timelineId: message.timelineId,
        sessionId: message.timelineId,
        source: 'web',
        kind: 'command_result',
        role: null,
        command: output.meta.command,
        subcommand: output.meta.subcommand,
        subcommandTag: output.meta.subcommand,
        values: output.meta.arguments
          ? {
              arguments: output.meta.arguments,
              options: output.meta.options ?? {},
            }
          : null,
        form: null,
        text: null,
        web: output,
        clientView: null,
        prompt: null,
        requestId: null,
      }).id;
    }

    sendMessage(ws, {
      ...createCommandResultMessage({
        requestId: message.requestId,
        output,
      }),
      timelineEventId,
    });
  }

  sendMessage(ws, createDoneMessage(message.requestId));
}

async function handleChat(params: {
  ws: Bun.ServerWebSocket<WebSocketData>;
  ctx: WebRouteContext;
  message: ChatClientMessage;
}): Promise<void> {
  const { sessionId, requestId } = params.message;
  const abort = startSessionRun(sessionId, requestId, 'chat');

  try {
    await runChatInSession(params, abort);
  } finally {
    finishSessionRun(sessionId, requestId);
  }
}

async function runChatInSession(
  params: {
    ws: Bun.ServerWebSocket<WebSocketData>;
    ctx: WebRouteContext;
    message: ChatClientMessage;
  },
  chatAbort: AbortController,
): Promise<void> {
  const { ws, ctx, message } = params;
  const backendName = getAgentBackend(ctx.seenDb);

  const cwd =
    getWorkspaceTarget(ctx.seenDb) === 'appweaver'
      ? ctx.dmBotRoot
      : ctx.parentOfBotRoot;

  const useStream = true;

  debug('websocket chat received', {
    requestId: message.requestId,
    timelineId: message.timelineId,
    backend: backendName,
    contentLength: message.content.length,
    contentPreview: message.content.slice(0, 120),
    sessionId: message.sessionId,
  });

  insertTimelineEvent(ctx.seenDb, {
    id: `${message.requestId}-user`,
    timelineId: message.timelineId,
    sessionId: message.sessionId,
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
      sessionId: message.sessionId,
      onSessionReady: (sessionId) => {
        registeredSessionId = sessionId;

        debug('websocket chat session ready', {
          requestId: message.requestId,
          sessionId,
          aborted: chatAbort.signal.aborted,
        });

        registerOpencodeInterventionBridge({
          sessionId,
          bridge: sessionBridge,
        });
      },
      onStreamChunk: useStream
        ? (chunk) => {
            if (chunk.kind === 'question') {
              ws.data.questionSessions.add(message.sessionId);

              if (ws.readyState !== 1) {
                stopSessionRun(message.sessionId);

                return;
              }

              log.info(
                `[websocket] presenting OpenCode question ${chunk.requestId}`,
              );

              const promptFn = ws.data.promptSession.createPromptFn({
                requestId: message.requestId,
                timelineId: message.timelineId,
                recordInTimeline: false,
                send: (serverMessage) => {
                  if (serverMessage.type === 'prompt') {
                    const event = insertTimelineEvent(ctx.seenDb, {
                      timelineId: message.timelineId,
                      sessionId: message.sessionId,
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

                    sendMessage(ws, {
                      ...serverMessage,
                      timelineEventId: event.id,
                    });

                    return;
                  }

                  sendMessage(ws, serverMessage);
                },
              });

              void promptFn(createWebPrompt(chunk.prompt))
                .then((answer) =>
                  replyOpencodeSdkQuestion({
                    requestId: chunk.requestId,
                    sessionId: chunk.sessionId,
                    cwd,
                    answer,
                  }),
                )
                .catch((err) => {
                  log.warn(
                    `OpenCode question reply failed: ${err instanceof Error ? err.message : String(err)}`,
                  );
                })
                .finally(() =>
                  ws.data.questionSessions.delete(message.sessionId),
                );

              return;
            }

            sendMessage(
              ws,
              createChatStreamChunkMessage({
                requestId: message.requestId,
                sessionId: message.sessionId,
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
                sessionId: message.sessionId,
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
                sessionId: message.sessionId,
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
                sessionId: message.sessionId,
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

    debug('websocket chat result received', {
      requestId: message.requestId,
      sessionId: result.sessionId,
      outputLength: result.output.length,
      aborted: chatAbort.signal.aborted,
    });
  } catch (err) {
    debug('websocket chat run exception', {
      requestId: message.requestId,
      error: err instanceof Error ? err.message : String(err),
      aborted: chatAbort.signal.aborted,
    });

    log.warn(
      `[websocket] chat run failed ${message.requestId}: ${err instanceof Error ? err.message : String(err)}`,
    );

    throw err;
  } finally {
    ws.data.questionSessions.delete(message.sessionId);

    if (registeredSessionId) {
      unregisterOpencodeInterventionBridge({
        sessionId: registeredSessionId,
        bridge: sessionBridge,
      });
    }

    debug('websocket chat run finalized', {
      requestId: message.requestId,
      aborted: chatAbort.signal.aborted,
    });
  }

  const output = result.output;

  log.info(
    `[websocket] inserting assistant chat ${message.requestId} (${output.length} chars)`,
  );

  const assistantEvent = insertTimelineEvent(ctx.seenDb, {
    timelineId: message.timelineId,
    sessionId: message.sessionId,
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
      sessionId: message.sessionId,
      eventId: assistantEvent.id,
      output,
    }),
  );

  log.info(`[websocket] sent chat_result ${message.requestId}`);

  sendMessage(ws, createDoneMessage(message.requestId));
  log.info(`[websocket] sent done ${message.requestId}`);
}

export function createWebSocketHandler(ctx: WebRouteContext) {
  const connections = new Set<Bun.ServerWebSocket<WebSocketData>>();
  let stopWatchingTitles: (() => void) | null = null;

  return {
    open(ws: Bun.ServerWebSocket<WebSocketData>): void {
      connections.add(ws);

      if (!stopWatchingTitles && !isDemoMode()) {
        stopWatchingTitles = watchSessionTitles(ctx.seenDb, (update) => {
          for (const connection of connections) {
            if (
              connection.data.nip98Authenticated &&
              !connection.data.demoAuthenticated
            ) {
              sendMessage(connection, {
                type: 'session_title_updated',
                requestId: 'session-title-update',
                ...update,
              });
            }
          }
        });
      }

      ensureInterventionBridge(ws, ctx.seenDb);
      ws.data.paymentSession.setSender((message) => sendMessage(ws, message));
    },
    close(ws: Bun.ServerWebSocket<WebSocketData>): void {
      connections.delete(ws);

      if (connections.size === 0) {
        stopWatchingTitles?.();
        stopWatchingTitles = null;
      }

      for (const sessionId of ws.data.questionSessions) {
        stopSessionRun(sessionId);
      }

      ws.data.questionSessions.clear();
      ws.data.promptSession.clearAll();
      ws.data.paymentSession.close();
      ws.data.interventionEnabled = false;

      if (ws.data.interventionBridge) {
        clearOpencodeInterventionsForBridge(ws.data.interventionBridge, false);
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

          sendMessage(ws, {
            ...createDoneMessage(authTry.data.requestId),
            instanceId: PROCESS_INSTANCE_ID,
          });

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

          if ('timelineId' in message) {
            assertWebSession(
              ctx.seenDb,
              message.timelineId,
              getWorkspaceTarget(ctx.seenDb),
            );
          }

          if (
            message.type === 'compact_session' ||
            message.type === 'cancel_chat'
          ) {
            assertWebSession(
              ctx.seenDb,
              message.sessionId,
              getWorkspaceTarget(ctx.seenDb),
            );
          }

          if (
            message.type === 'chat' &&
            message.sessionId !== message.timelineId
          ) {
            throw new Error('Chat session does not match its timeline.');
          }

          switch (message.type) {
            case 'authenticate': {
              sendMessage(ws, {
                ...createDoneMessage(message.requestId),
                instanceId: PROCESS_INSTANCE_ID,
              });

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
                  state: await getComposerAiState(ctx, message.sessionId),
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
                sessionId: message.sessionId,
              });

              return;
            }

            case 'rename_session': {
              renameAppWeaverSession({
                db: ctx.seenDb,
                sessionId: message.sessionId,
                workspace: getWorkspaceTarget(ctx.seenDb),
                title: message.title,
                mode: 'manual',
              });

              sendMessage(ws, createDoneMessage(message.requestId));

              return;
            }

            case 'mark_session_read': {
              assertWebSession(
                ctx.seenDb,
                message.sessionId,
                getWorkspaceTarget(ctx.seenDb),
              );

              markSessionRead(ctx.seenDb, message.sessionId, message.messageId);
              sendMessage(ws, createDoneMessage(message.requestId));

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
                    run: () =>
                      handleRunCommand({
                        ws,
                        ctx,
                        message,
                        paymentBroker: ws.data.paymentBroker,
                      }),
                  }),
                );
              } else {
                await handleRunCommand({
                  ws,
                  ctx,
                  message,
                  paymentBroker: ws.data.paymentBroker,
                });
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
                paymentBroker: ws.data.paymentBroker,
              });

              return;
            }

            case 'payment_action': {
              await ws.data.paymentSession.handleAction(message);

              return;
            }

            case 'list_capability_providers': {
              await handleListCapabilityProviders({ ws, message });

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
                  id: message.eventId,
                  timelineId: resolved.timelineId,
                  sessionId: resolved.timelineId,
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
              debug('websocket cancel_chat received', {
                cancelRequestId: message.requestId,
                sessionId: message.sessionId,
              });

              stopSessionRun(message.sessionId);

              clearOpencodeInterventionsForSession(message.sessionId);

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
