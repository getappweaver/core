/** Capability: resource-view:v1. Added in AppWeaver core: 14.11.1. */
import { z } from 'zod';

import { WebRenderResultSchema } from '@src/web/ui-schema';

import { CapabilityResourceRefSchema, defineCapability } from './types';

export const ResourceAddressSchema = CapabilityResourceRefSchema.extend({
  capability: z.object({
    name: z.literal('resource-view'),
    version: z.literal(1),
  }),
  providerId: z.string().min(1).max(500),
  resourceType: z.string().min(1).max(100),
  resourceId: z.string().min(1).max(8000),
  surface: z.enum(['modal', 'timeline']).optional(),
});
export type ResourceAddress = z.infer<typeof ResourceAddressSchema>;

export const ResourceViewV1 = defineCapability({
  capability: { name: 'resource-view', version: 1 },
  addedInCoreVersion: '14.11.1',
  operations: {
    open: {
      id: 'capability:v1:resource-view.open',
      required: true,
      inputSchema: ResourceAddressSchema.pick({
        resourceType: true,
        resourceId: true,
      }),
      outputSchema: z.discriminatedUnion('status', [
        z.object({ status: z.literal('found'), view: WebRenderResultSchema }),
        z.object({
          status: z.literal('not-found'),
          view: WebRenderResultSchema,
        }),
      ]),
      webResult: (output) => output.view,
    },
  },
});

export function resourceAddressToHash(address: ResourceAddress): string {
  const parsed = ResourceAddressSchema.parse(address);

  return `#/resource/v1/${[parsed.providerId, parsed.resourceType, parsed.resourceId].map(encodeURIComponent).join('/')}`;
}

export function resourceAddressFromHash(hash: string): ResourceAddress | null {
  const match = /^#\/resource\/v1\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(hash);

  if (!match) {
    return null;
  }

  try {
    const parsed = ResourceAddressSchema.safeParse({
      capability: ResourceViewV1.capability,
      providerId: decodeURIComponent(match[1]!),
      resourceType: decodeURIComponent(match[2]!),
      resourceId: decodeURIComponent(match[3]!),
    });

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
