import { randomUUID } from 'node:crypto';

import { z, ZodError } from 'zod';

import { createBackend } from '@src/backends/factory';
import { opencodeRuntimeController } from '@src/backends/opencode-runtime-controller';
import type {
  AgentBackend,
  ChatCompletionMessage,
  ChatCompletionResult,
} from '@src/backends/types';
import { createModelSourceCoordinator } from '@src/core/model-source';
import {
  getState,
  getWorkspaceTarget,
  STATE_INFERENCE_API_KEY_HASH,
  type WorkspaceTarget,
} from '@src/db';
import { verifyInferenceApiKey } from '@src/inference/api-key';

import type { WebRouteContext } from './routes';

const MAX_CHAT_COMPLETION_BODY_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  reasoning: z.string().optional(),
  reasoning_content: z.string().optional(),
});

const ChatCompletionRequestSchema = z.object({
  model: z.string().trim().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  stream: z.boolean().optional(),
  stream_options: z
    .object({ include_usage: z.boolean().optional() })
    .optional(),
  tools: z.never().optional(),
  tool_choice: z.never().optional(),
});

type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);

  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');

  return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(message: string, status: number): Response {
  const type =
    status === 401
      ? 'authentication_error'
      : status >= 500
        ? 'server_error'
        : 'invalid_request_error';

  return jsonResponse(
    {
      error: {
        message,
        type,
      },
    },
    { status },
  );
}

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();

  return token.length > 0 ? token : null;
}

function verifyRequestAuthorization(
  req: Request,
  ctx: WebRouteContext,
): Response | null {
  if (!getState(ctx.seenDb, STATE_INFERENCE_API_KEY_HASH)) {
    return errorResponse(
      `Inference API key not configured. Run ${ctx.prefix}bot inference-key first.`,
      503,
    );
  }

  if (!verifyInferenceApiKey(ctx.seenDb, bearerToken(req))) {
    return errorResponse('Invalid inference API key.', 401);
  }

  return null;
}

async function parseRequestBody(req: Request): Promise<ChatCompletionRequest> {
  const body = await req.text();

  if (Buffer.byteLength(body) > MAX_CHAT_COMPLETION_BODY_BYTES) {
    throw new Error('request_body_too_large');
  }

  return ChatCompletionRequestSchema.parse(JSON.parse(body) as unknown);
}

function createInferenceBackend(ctx: WebRouteContext): AgentBackend {
  return createBackend({
    backendName: 'opencode',
    dmBotRoot: ctx.dmBotRoot,
  });
}

function inferenceCwd(ctx: WebRouteContext): string {
  return getWorkspaceTarget(ctx.seenDb) === 'appweaver'
    ? ctx.dmBotRoot
    : ctx.parentOfBotRoot;
}

function normalizeMessages(
  request: ChatCompletionRequest,
): ChatCompletionMessage[] {
  return request.messages.map((message) => ({
    role: message.role,
    content: message.content,
    reasoning: message.reasoning ?? message.reasoning_content ?? null,
  }));
}

function contentFromResult(
  result: ChatCompletionResult,
  type: 'text' | 'reasoning',
): string {
  return result.outputs
    .filter((output) => output.type === type)
    .map((output) => output.value)
    .join('');
}

function usageFromResult(result: ChatCompletionResult): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} | null {
  return result.tokens
    ? {
        prompt_tokens: result.tokens.input,
        completion_tokens: result.tokens.output,
        total_tokens: result.tokens.total,
      }
    : null;
}

async function handleModels(ctx: WebRouteContext): Promise<Response> {
  const models = await createModelSourceCoordinator(ctx.seenDb).listModels(
    getWorkspaceTarget(ctx.seenDb),
    'opencode',
  );

  return jsonResponse({
    object: 'list',
    data: models.map((model) => ({
      id: model.id,
      object: 'model',
      owned_by: model.group,
    })),
  });
}

type CompletionContext = {
  id: string;
  created: number;
  request: ChatCompletionRequest;
  runtimeModelId: string;
  providerId: string;
  backend: AgentBackend;
  cwd: string;
  workspace: WorkspaceTarget;
  db: WebRouteContext['seenDb'];
};

type RunCompletionProps = {
  context: CompletionContext;
  onChunk: Parameters<AgentBackend['runChatCompletion']>[0]['onChunk'];
  abortSignal: AbortSignal;
};

async function runCompletion({
  context,
  onChunk,
  abortSignal,
}: RunCompletionProps): Promise<ChatCompletionResult> {
  const result = await context.backend.runChatCompletion({
    messages: normalizeMessages(context.request),
    model: context.runtimeModelId,
    cwd: context.cwd,
    onChunk,
    abortSignal,
  });

  await createModelSourceCoordinator(context.db).recordSuccessfulUse(
    context.workspace,
    'opencode',
    context.request.model,
    context.providerId,
  );

  return result;
}

async function handleNonStreamingCompletion(
  context: CompletionContext,
  abortSignal: AbortSignal,
): Promise<Response> {
  const result = await runCompletion({
    context,
    onChunk: () => {},
    abortSignal,
  });

  const reasoning = contentFromResult(result, 'reasoning');

  return jsonResponse({
    id: context.id,
    object: 'chat.completion',
    created: context.created,
    model: context.request.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: contentFromResult(result, 'text'),
          ...(reasoning ? { reasoning_content: reasoning } : {}),
        },
        finish_reason: 'stop',
      },
    ],
    usage: usageFromResult(result),
  });
}

function sseData(value: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
}

function handleStreamingCompletion(
  context: CompletionContext,
  abortSignal: AbortSignal,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const enqueue = (data: Uint8Array): boolean => {
        if (closed) {
          return false;
        }

        try {
          controller.enqueue(data);

          return true;
        } catch {
          closed = true;

          return false;
        }
      };

      const close = (): void => {
        if (closed) {
          return;
        }

        closed = true;

        try {
          controller.close();
        } catch {
          // The client may already have disconnected.
        }
      };

      const emitDelta = (delta: Record<string, string>): void => {
        enqueue(
          sseData({
            id: context.id,
            object: 'chat.completion.chunk',
            created: context.created,
            model: context.request.model,
            choices: [{ index: 0, delta, finish_reason: null }],
          }),
        );
      };

      emitDelta({ role: 'assistant' });

      void opencodeRuntimeController
        .holdUntil(() =>
          runCompletion({
            context,
            onChunk: (chunk) => {
              emitDelta(
                chunk.type === 'text_delta'
                  ? { content: chunk.content }
                  : { reasoning_content: chunk.content },
              );
            },
            abortSignal,
          }),
        )
        .then((result) => {
          enqueue(
            sseData({
              id: context.id,
              object: 'chat.completion.chunk',
              created: context.created,
              model: context.request.model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              ...(context.request.stream_options?.include_usage
                ? { usage: usageFromResult(result) }
                : {}),
            }),
          );

          enqueue(encoder.encode('data: [DONE]\n\n'));
          close();
        })
        .catch((err) => {
          enqueue(
            sseData({
              error: {
                message: err instanceof Error ? err.message : String(err),
                type: abortSignal.aborted ? 'aborted' : 'server_error',
              },
            }),
          );

          close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function handleChatCompletion(
  req: Request,
  ctx: WebRouteContext,
): Promise<Response> {
  let request: ChatCompletionRequest;

  try {
    request = await parseRequestBody(req);
  } catch (err) {
    const message =
      err instanceof SyntaxError
        ? 'Invalid JSON body.'
        : err instanceof ZodError
          ? err.issues.map((issue) => issue.message).join('; ')
          : err instanceof Error
            ? err.message
            : String(err);

    const status = message === 'request_body_too_large' ? 413 : 400;

    return errorResponse(message, status);
  }

  const workspace = getWorkspaceTarget(ctx.seenDb);

  try {
    return await opencodeRuntimeController.withPreparedRun({
      prepare: () =>
        createModelSourceCoordinator(ctx.seenDb).prepareRun(
          workspace,
          'opencode',
        ),
      run: async (prepared) => {
        if (request.model !== prepared.modelId) {
          return errorResponse(
            `Model must match the active model-source selection: ${prepared.modelId}`,
            400,
          );
        }

        const context: CompletionContext = {
          id: `chatcmpl-${randomUUID()}`,
          created: Math.floor(Date.now() / 1000),
          request,
          runtimeModelId: prepared.runtimeModelId,
          providerId: prepared.providerId,
          backend: createInferenceBackend(ctx),
          cwd: inferenceCwd(ctx),
          workspace,
          db: ctx.seenDb,
        };

        return request.stream
          ? handleStreamingCompletion(context, req.signal)
          : handleNonStreamingCompletion(context, req.signal);
      },
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err), 500);
  }
}

export function isInferenceRoute(pathname: string): boolean {
  return pathname === '/v1/models' || pathname === '/v1/chat/completions';
}

export async function handleInferenceRoute(
  req: Request,
  ctx: WebRouteContext,
): Promise<Response> {
  const authFailure = verifyRequestAuthorization(req, ctx);

  if (authFailure) {
    return authFailure;
  }

  const pathname = new URL(req.url).pathname;

  if (req.method === 'GET' && pathname === '/v1/models') {
    return handleModels(ctx).catch((err) =>
      errorResponse(err instanceof Error ? err.message : String(err), 500),
    );
  }

  if (req.method === 'POST' && pathname === '/v1/chat/completions') {
    return handleChatCompletion(req, ctx);
  }

  return errorResponse('Method not allowed.', 405);
}
