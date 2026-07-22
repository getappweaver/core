import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { z } from 'zod';

const hex64Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/i)
  .transform((value) => value.toLowerCase());

const hex128Schema = z
  .string()
  .regex(/^[0-9a-f]{128}$/i)
  .transform((value) => value.toLowerCase());

export const nostrEventSchema = z
  .object({
    id: hex64Schema,
    pubkey: hex64Schema,
    created_at: z.number().int().nonnegative(),
    kind: z.number().int().nonnegative(),
    tags: z.array(z.array(z.string())),
    content: z.string(),
    sig: hex128Schema,
  })
  .strict();

export const NostrEventSchema = nostrEventSchema;

export function parseVerifiedNostrEvent(value: unknown): NostrEvent {
  const event = nostrEventSchema.parse(value);

  if (!verifyEvent(event)) {
    throw new Error('Nostr event ID or signature is invalid');
  }

  return event;
}
