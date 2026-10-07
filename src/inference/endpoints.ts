import {
  InferenceEndpointV1,
  type InferenceEndpointDescriptorV1,
} from '@src/capabilities/inference-endpoint.v1';
import type { CapabilityProviderSummary } from '@src/capabilities/types';
import { capabilityRegistry } from '@src/core/capabilities/registry';

export type RegisteredInferenceEndpoint = InferenceEndpointDescriptorV1 & {
  provider: CapabilityProviderSummary;
  bridge: { title: string; basePath: string };
};

export async function listInferenceEndpoints(): Promise<
  RegisteredInferenceEndpoint[]
> {
  const providers = capabilityRegistry.listProviders(
    InferenceEndpointV1.capability,
  );

  const groups = await Promise.all(
    providers.map(async (provider) => {
      const result = await capabilityRegistry.invoke({
        operation: InferenceEndpointV1.operations.list,
        provider: provider.providerId,
        input: {},
        caller: { type: 'core', component: 'inference-bridge' },
      });

      if (result.status !== 'success') {
        throw new Error('Inference endpoint discovery is unavailable.');
      }

      const ids = new Set<string>();

      return result.output.endpoints.map((endpoint) => {
        if (
          endpoint.path !== result.output.basePath &&
          !endpoint.path.startsWith(`${result.output.basePath}/`)
        ) {
          throw new Error(
            `Inference endpoint is outside its advertised base path: ${endpoint.path}`,
          );
        }

        if (ids.has(endpoint.id)) {
          throw new Error(
            `Duplicate inference endpoint ID: ${provider.providerId}/${endpoint.id}`,
          );
        }

        ids.add(endpoint.id);

        return {
          ...endpoint,
          provider,
          bridge: {
            title: result.output.title,
            basePath: result.output.basePath,
          },
        };
      });
    }),
  );

  const endpoints = groups.flat();
  const routes = new Set<string>();
  for (const endpoint of endpoints) {
    const route = `${endpoint.method} ${endpoint.path}`;

    if (routes.has(route)) {
      throw new Error(`Duplicate inference route: ${route}`);
    }

    routes.add(route);
  }

  return endpoints;
}

export function inferenceJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function inferenceErrorResponse(
  message: string,
  status: number,
): Response {
  return inferenceJsonResponse(
    {
      error: {
        message,
        type:
          status === 401
            ? 'authentication_error'
            : status >= 500
              ? 'server_error'
              : 'invalid_request_error',
      },
    },
    status,
  );
}
