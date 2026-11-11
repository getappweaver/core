/** Experimental peer networking contract; app permissions are in-process policy, not isolation. */
import { z } from 'zod';

import { defineCapability } from './types';

export const FipsPubkeySchema = z.string().regex(/^(02|03)[0-9a-f]{64}$/);
export const PeerProtocolSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
export const PeerTopicSchema = z.string().min(1).max(256);

/** Explicit byte representation for callers crossing JSON-only boundaries. */
const JsonBytesSchema = z
  .object({
    encoding: z.literal('base64'),
    data: z
      .string()
      .max(1_398_104)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  })
  .strict()
  .transform(({ data }) => {
    const decoded = atob(data);

    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  });

export const PeerPayloadV1Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({
    kind: z.literal('binary'),
    bytes: z.union([z.instanceof(Uint8Array), JsonBytesSchema]),
  }),
]);
export type PeerPayloadV1 = z.infer<typeof PeerPayloadV1Schema>;

/** Native capability calls should keep bytes; JSON callers must opt into this encoding. */
export function peerPayloadToJson(payload: PeerPayloadV1):
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'binary';
      bytes: { encoding: 'base64'; data: string };
    } {
  if (payload.kind === 'text') {
    return payload;
  }

  let value = '';
  for (const byte of payload.bytes) {
    value += String.fromCharCode(byte);
  }

  return { kind: 'binary', bytes: { encoding: 'base64', data: btoa(value) } };
}

export const PeerStatusV1Schema = z.enum([
  'unknown',
  'connecting',
  'connected',
  'disconnected',
]);
export const PeerNetworkErrorV1Schema = z.object({
  code: z.enum([
    'permission-denied',
    'unsupported-protocol',
    'peer-unavailable',
    'payload-too-large',
    'busy',
    'timeout',
    'transport-error',
  ]),
  message: z.string(),
});
export const PeerSummaryV1Schema = z.object({
  id: z.string().min(1),
  masterPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  fipsPubkey: FipsPubkeySchema,
  label: z.string().min(1),
  connectionState: PeerStatusV1Schema,
  lastConfirmedAt: z.number().int().nonnegative().nullable(),
  lastError: z.string().nullable(),
});
export const PeerGrantScopeV1Schema = z.object({
  remoteFipsPubkeys: z.array(FipsPubkeySchema).min(1).max(128),
  protocol: PeerProtocolSchema,
  topics: z.array(PeerTopicSchema).min(1).max(128),
});
export const PeerGrantV1Schema = PeerGrantScopeV1Schema.extend({
  id: z.string().min(1),
  appAlias: z.string().min(1),
  localFipsPubkey: FipsPubkeySchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
/** An explicit UI entry point; returning it never opens an approval prompt. */
export const PeerManagementCommandV1Schema = z.object({
  command: z.string().min(1),
  subcommand: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  options: z.record(z.string(), z.unknown()),
});
export const PeerNetworkListPeersInputV1Schema = z.object({});
export const PeerNetworkListPeersOutputV1Schema = z.object({
  localMasterPubkey: z.string().regex(/^[0-9a-f]{64}$/),
  localFipsPubkey: FipsPubkeySchema,
  peers: z.array(PeerSummaryV1Schema),
});
export const PeerNetworkSendInputV1Schema = z.object({
  toFipsPubkey: FipsPubkeySchema,
  protocol: PeerProtocolSchema,
  topic: PeerTopicSchema,
  payload: PeerPayloadV1Schema,
});
/** sentAt is local send completion time, never a remote persistence acknowledgement. */
export const PeerNetworkSendOutputV1Schema = z
  .object({
    sent: z.boolean(),
    sentAt: z.number().int().nonnegative().nullable(),
    error: PeerNetworkErrorV1Schema.nullable(),
  })
  .refine(
    (value) =>
      value.sent
        ? value.error === null && value.sentAt !== null
        : value.error !== null && value.sentAt === null,
    'Inconsistent send result',
  );

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
    'get-limits': {
      id: 'capability:v1:peer-network.get-limits',
      required: true,
      inputSchema: z.object({}),
      outputSchema: z.object({
        maxPayloadBytes: z.number().int().positive(),
        maxConcurrentSends: z.number().int().positive(),
        sendTimeoutMs: z.number().int().positive(),
      }),
    },
    connect: {
      id: 'capability:v1:peer-network.connect',
      required: true,
      inputSchema: z.object({ toFipsPubkey: FipsPubkeySchema }),
      outputSchema: z.object({
        connected: z.boolean(),
        error: PeerNetworkErrorV1Schema.nullable(),
      }),
    },
    send: {
      id: 'capability:v1:peer-network.send',
      required: true,
      inputSchema: PeerNetworkSendInputV1Schema,
      outputSchema: PeerNetworkSendOutputV1Schema,
    },
    'list-grants': {
      id: 'capability:v1:peer-network.list-grants',
      required: true,
      inputSchema: z.object({}),
      outputSchema: z.object({
        grants: z.array(PeerGrantV1Schema),
        managementCommand: PeerManagementCommandV1Schema,
      }),
    },
    'request-access': {
      id: 'capability:v1:peer-network.request-access',
      required: true,
      inputSchema: PeerGrantScopeV1Schema,
      outputSchema: z.object({
        requestId: z.string().min(1),
        reviewCommand: PeerManagementCommandV1Schema,
      }),
    },
  },
});

export type PeerStatusV1 = z.infer<typeof PeerStatusV1Schema>;
export type PeerSummaryV1 = z.infer<typeof PeerSummaryV1Schema>;
export type PeerGrantV1 = z.infer<typeof PeerGrantV1Schema>;
export type PeerGrantScopeV1 = z.infer<typeof PeerGrantScopeV1Schema>;
export type PeerNetworkErrorV1 = z.infer<typeof PeerNetworkErrorV1Schema>;
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
