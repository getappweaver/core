/**
 * Capability: peer-channel:v1
 * Added in AppWeaver core: 14.13.4
 */
import { z } from 'zod';

import { defineCapability } from './types';

export const PeerChannelReceiveInputV1Schema = z.object({
  fromMasterPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  fromFipsPubkey: z.string().regex(/^(02|03)[0-9a-f]{64}$/),
  channel: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
  payload: z.string(),
  signature: z.string().nullable(),
  receivedAt: z.number().int().nonnegative(),
});

export const PeerChannelReceiveOutputV1Schema = z.object({
  accepted: z.boolean(),
});

export const PeerChannelV1 = defineCapability({
  capability: { name: 'peer-channel', version: 1 },
  addedInCoreVersion: '14.13.4',
  operations: {
    receive: {
      id: 'capability:v1:peer-channel.receive',
      required: true,
      inputSchema: PeerChannelReceiveInputV1Schema,
      outputSchema: PeerChannelReceiveOutputV1Schema,
      webResult: () => null,
    },
  },
});

export type PeerChannelReceiveInputV1 = z.infer<
  typeof PeerChannelReceiveInputV1Schema
>;
export type PeerChannelReceiveOutputV1 = z.infer<
  typeof PeerChannelReceiveOutputV1Schema
>;
