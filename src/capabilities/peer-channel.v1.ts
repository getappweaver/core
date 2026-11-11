/** Inbound protocol ownership and callbacks; subscriptions belong to the app. */
import { z } from 'zod';

import {
  FipsPubkeySchema,
  PeerPayloadV1Schema,
  PeerProtocolSchema,
  PeerStatusV1Schema,
  PeerTopicSchema,
} from './peer-network.v1';
import { defineCapability } from './types';

export const PeerChannelReceiveInputV1Schema = z.object({
  fromMasterPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  fromFipsPubkey: FipsPubkeySchema,
  protocol: PeerProtocolSchema,
  topic: PeerTopicSchema,
  payload: PeerPayloadV1Schema,
  receivedAt: z.number().int().nonnegative(),
});
export const PeerChannelReceiveOutputV1Schema = z.object({
  accepted: z.boolean(),
});
export const PeerChannelV1 = defineCapability({
  capability: { name: 'peer-channel', version: 1 },
  addedInCoreVersion: '14.13.4',
  operations: {
    describe: {
      id: 'capability:v1:peer-channel.describe',
      required: true,
      inputSchema: z.object({}),
      outputSchema: z.object({
        protocols: z.array(PeerProtocolSchema).max(64),
      }),
      webResult: () => null,
    },
    receive: {
      id: 'capability:v1:peer-channel.receive',
      required: true,
      inputSchema: PeerChannelReceiveInputV1Schema,
      outputSchema: PeerChannelReceiveOutputV1Schema,
      webResult: () => null,
    },
    'connection-changed': {
      id: 'capability:v1:peer-channel.connection-changed',
      required: true,
      inputSchema: z.object({
        fipsPubkey: FipsPubkeySchema,
        connectionState: PeerStatusV1Schema,
        lastConfirmedAt: z.number().int().nonnegative().nullable(),
        lastError: z.string().nullable(),
      }),
      outputSchema: z.object({ accepted: z.boolean() }),
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
