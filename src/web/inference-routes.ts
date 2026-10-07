import { InferenceEndpointV1 } from '@src/capabilities/inference-endpoint.v1';
import { capabilityRegistry } from '@src/core/capabilities/registry';
import { getState, STATE_INFERENCE_API_KEY_HASH } from '@src/db';
import { verifyInferenceApiKey } from '@src/inference/api-key';
import {
  inferenceErrorResponse,
  listInferenceEndpoints,
} from '@src/inference/endpoints';

import type { WebRouteContext } from './routes';

type BoundedInferenceRequestProps = { request: Request; maxBodyBytes: number };

async function boundedInferenceRequest({
  request,
  maxBodyBytes,
}: BoundedInferenceRequestProps): Promise<Request> {
  const declaredLength = Number(request.headers.get('Content-Length'));

  if (declaredLength > maxBodyBytes) {
    throw new Error('request_body_too_large');
  }

  const chunks: Uint8Array[] = [];
  let bytes = 0;

  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        bytes += value.byteLength;

        if (bytes > maxBodyBytes) {
          await reader.cancel();
          throw new Error('request_body_too_large');
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(request.headers);
  // Authentication is owned by the bridge; providers do not receive the client key.
  headers.delete('Authorization');
  headers.delete('Cookie');
  headers.delete('Content-Length');

  return new Request(request.url, {
    method: request.method,
    headers,
    signal: request.signal,
    body: request.method === 'POST' ? body : null,
  });
}

export function isInferenceRoute(pathname: string): boolean {
  return pathname === '/v1' || pathname.startsWith('/v1/');
}

export async function handleInferenceRoute(
  req: Request,
  ctx: WebRouteContext,
): Promise<Response> {
  if (!getState(ctx.seenDb, STATE_INFERENCE_API_KEY_HASH)) {
    return inferenceErrorResponse(
      `Inference API key not configured. Run ${ctx.prefix}bot inference-key first.`,
      503,
    );
  }

  const authorization = req.headers.get('Authorization');

  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : null;

  if (!verifyInferenceApiKey(ctx.seenDb, token)) {
    return inferenceErrorResponse('Invalid inference API key.', 401);
  }

  try {
    const path = new URL(req.url).pathname;
    const endpoints = await listInferenceEndpoints();
    const matchingPath = endpoints.filter((endpoint) => endpoint.path === path);

    if (!matchingPath.length) {
      return inferenceErrorResponse('Unknown inference endpoint.', 404);
    }

    const endpoint = matchingPath.find((entry) => entry.method === req.method);

    if (!endpoint) {
      const response = inferenceErrorResponse('Method not allowed.', 405);

      response.headers.set(
        'Allow',
        matchingPath.map((entry) => entry.method).join(', '),
      );

      return response;
    }

    const request = await boundedInferenceRequest({
      request: req,
      maxBodyBytes: endpoint.maxBodyBytes,
    });

    request.signal.throwIfAborted();

    const result = await capabilityRegistry.invoke({
      operation: InferenceEndpointV1.operations.handle,
      provider: endpoint.provider.providerId,
      input: { endpointId: endpoint.id, request },
      caller: { type: 'core', component: 'inference-bridge' },
    });

    if (result.status !== 'success') {
      return inferenceErrorResponse('Inference endpoint is unavailable.', 503);
    }

    const response = new Response(result.output.body, result.output);
    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'request_body_too_large') {
      return inferenceErrorResponse(
        'Request body exceeds the endpoint payload limit.',
        413,
      );
    }

    return inferenceErrorResponse(
      req.signal.aborted
        ? 'Inference request aborted.'
        : 'Inference endpoint is unavailable.',
      503,
    );
  }
}
