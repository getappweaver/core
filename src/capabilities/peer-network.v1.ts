/**
 * Capability: peer-network:v1
 * Added in AppWeaver core: 14.13.4
 */
import { z } from 'zod';

import { defineCapability } from './types';

export const PeerStatusV1Schema = z.enum(['online', 'connecting', 'offline']);

export const PeerSummaryV1Schema = z.object({
  id: z.string().min(1),
  masterPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  fipsPubkey: z.string().regex(/^(02|03)[0-9a-f]{64}$/),
  label: z.string().min(1),
  status: PeerStatusV1Schema,
  lastSeenAt: z.number().int().nonnegative().nullable(),
});

export const PeerNetworkListPeersInputV1Schema = z.object({});

export const PeerNetworkListPeersOutputV1Schema = z.object({
  localMasterPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  localFipsPubkey: z.string().regex(/^(02|03)[0-9a-f]{64}$/),
  peers: z.array(PeerSummaryV1Schema),
});

export const PeerNetworkSendInputV1Schema = z.object({
  toMasterPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  channel: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
  payload: z.string(),
  signature: z.string().nullable(),
});

export const PeerNetworkSendOutputV1Schema = z.object({
  delivered: z.boolean(),
  sentAt: z.number().int().nonnegative(),
});

export const PeerNetworkV1 = defineCapability({
  capability: { name: 'peer-network', version: 1 },
  addedInCoreVersion: '14.13.4',
  operations: {
    'list-peers': {
      id: 'capability:v1:peer-network.list-peers',
      required: true,
      inputSchema: PeerNetworkListPeersInputV1Schema,
      outputSchema: PeerNetworkListPeersOutputV1Schema,
    },
    send: {
      id: 'capability:v1:peer-network.send',
      required: true,
      inputSchema: PeerNetworkSendInputV1Schema,
      outputSchema: PeerNetworkSendOutputV1Schema,
    },
  },
});

export type PeerStatusV1 = z.infer<typeof PeerStatusV1Schema>;
export type PeerSummaryV1 = z.infer<typeof PeerSummaryV1Schema>;
export type PeerNetworkListPeersInputV1 = z.infer<
  typeof PeerNetworkListPeersInputV1Schema
>;
export type PeerNetworkListPeersOutputV1 = z.infer<
  typeof PeerNetworkListPeersOutputV1Schema
>;
export type PeerNetworkSendInputV1 = z.infer<
  typeof PeerNetworkSendInputV1Schema
>;
export type PeerNetworkSendOutputV1 = z.infer<
  typeof PeerNetworkSendOutputV1Schema
>;
