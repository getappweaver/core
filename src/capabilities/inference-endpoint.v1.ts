import { z } from 'zod';

import { defineCapability } from './types';

export const InferenceEndpointV1Schema = z.object({
  id: z.string().min(1),
  method: z.enum(['GET', 'POST']),
  path: z.string().regex(/^\/v1\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/),
  description: z.string().min(1),
  maxBodyBytes: z
    .number()
    .int()
    .min(0)
    .max(2 * 1024 * 1024),
});

/** Explicit HTTP exports; unrelated internal capabilities remain private. */
export const InferenceEndpointV1 = defineCapability({
  capability: { name: 'inference-endpoint', version: 1 },
  addedInCoreVersion: '13.9.2',
  operations: {
    list: {
      id: 'capability:v1:inference-endpoint.list',
      required: true,
      inputSchema: z.object({}),
      outputSchema: z.object({
        title: z.string().min(1),
        basePath: z.string().regex(/^\/v1(?:\/[a-z0-9]+(?:[/-][a-z0-9]+)*)?$/),
        endpoints: z.array(InferenceEndpointV1Schema),
      }),
    },
    handle: {
      id: 'capability:v1:inference-endpoint.handle',
      required: true,
      inputSchema: z.object({
        endpointId: z.string().min(1),
        request: z.instanceof(Request),
      }),
      outputSchema: z.instanceof(Response),
    },
  },
});

export type InferenceEndpointDescriptorV1 = z.infer<
  typeof InferenceEndpointV1Schema
>;
