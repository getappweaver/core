import { getAgentBackend } from '@src/db';
import { getSubcommandDefinition } from '@src/system/command-definition';
import {
  deleteTimelineEvent,
  insertTimelineEvent,
  listTimelineHistoryBefore,
  listTimelineHistoryLatest,
  upsertTimelineCommandForm,
} from '@src/timeline/db';
import {
  summarizeTimelineDiffFiles,
  type TimelinePayload,
} from '@src/timeline/types';

import { runWebChat } from './chat';
import {
  getCommandDefinitionForWeb,
  listAllCommandsDetailForWeb,
} from './command-catalog';
import { getComposerAiState } from './composer-ai-state';
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
  createTimelineEventsResultMessage,
  type DeleteTimelineEventClientMessage,
  formatWebSocketClientParseFailure,
  type JsonCommandClientMessage,
  type LoadTimelineBeforeClientMessage,
  type LoadTimelineClientMessage,
  type RunCommandClientMessage,
  type SaveTimelineFormClientMessage,
  WebSocketClientMessageSchema,
  type WebSocketServerMessage,
} from './ws-schema';

export type WebSocketData = {
  promptSession: WebSocketPromptSession;
  currentChatAbort: AbortController | null;
  /** Set from NIP-98 on HTTP upgrade and/or first `authenticate` message. */
  nip98Authenticated: boolean;
};

function sendMessage(
  ws: Bun.ServerWebSocket<WebSocketData>,
  message: WebSocketServerMessage,
): void {
  ws.send(JSON.stringify(message));
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

function combineStreamedThinkingWithOutput(
  streamedText: string,
  output: string,
): string {
  const thinking = streamedText.trim();
  const finalOutput = output.trim();

  if (!thinking || !finalOutput || thinking === finalOutput) {
    return output;
  }

  if (thinking.includes(finalOutput) || finalOutput.includes(thinking)) {
    return output;
  }

  return `**Thinking:**\n${thinking}\n\n${output}`;
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
      text: typeof result.output === 'string' ? result.output : null,
      web:
        typeof result.output === 'string' ||
        result.output.kind === 'client_view'
          ? null
          : result.output,
      clientView:
        typeof result.output === 'string' || result.output.kind === 'ui'
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
  let streamedText = '';

  try {
    result = await runWebChat({
      ctx,
      content: message.content,
      onStreamChunk: useStream
        ? (chunk) => {
            if (chunk.kind === 'diff') {
              insertTimelineEvent(ctx.seenDb, {
                timelineId: message.timelineId,
                source: 'web',
                kind: 'diff_summary',
                role: null,
                command: null,
                subcommand: null,
                subcommandTag: null,
                values: null,
                form: null,
                text: null,
                web: null,
                clientView: null,
                diffSummary: summarizeTimelineDiffFiles(chunk.files),
                prompt: null,
                requestId: null,
              });
            }

            if (chunk.kind === 'tool') {
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

            if (chunk.kind === 'text_delta') {
              streamedText += chunk.text;
            }

            sendMessage(
              ws,
              createChatStreamChunkMessage({
                requestId: message.requestId,
                chunk,
              }),
            );
          }
        : null,
      streamAbortSignal: useStream ? chatAbort.signal : null,
    });
  } catch (err) {
    ws.data.currentChatAbort = null;
    throw err;
  } finally {
    if (ws.data.currentChatAbort === chatAbort) {
      ws.data.currentChatAbort = null;
    }
  }

  const output = combineStreamedThinkingWithOutput(streamedText, result.output);

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

  sendMessage(ws, createDoneMessage(message.requestId));
}

export function createWebSocketHandler(ctx: WebRouteContext) {
  return {
    open(_ws: Bun.ServerWebSocket<WebSocketData>): void {},
    close(ws: Bun.ServerWebSocket<WebSocketData>): void {
      ws.data.currentChatAbort?.abort();
      ws.data.currentChatAbort = null;
      ws.data.promptSession.clearAll();
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

          const nip = verifyNip98Authorization({
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

            case 'load_timeline': {
              await handleLoadTimeline({ ws, ctx, message });

              return;
            }

            case 'load_timeline_before': {
              await handleLoadTimelineBefore({ ws, ctx, message });

              return;
            }

            case 'run_command': {
              await handleRunCommand({
                ws,
                ctx,
                message,
              });

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
              sendMessage(ws, createDoneMessage(message.requestId));

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
