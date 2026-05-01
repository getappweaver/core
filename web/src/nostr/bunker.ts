// ---------------------------------------------------------------------------
// web/src/nostr/bunker.ts — browser-safe NIP-46 bunker client
//
// Mirror of src/nostr/bunker.ts without server-side imports.
// Uses nostr-tools directly; nip04 branch treated as async.
// ---------------------------------------------------------------------------

import type { EventTemplate, NostrEvent, VerifiedEvent } from 'nostr-tools';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip04,
  nip44,
  verifyEvent,
} from 'nostr-tools';
import { BunkerSigner, createNostrConnectURI } from 'nostr-tools/nip46';
import { SimplePool } from 'nostr-tools/pool';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

import type { BunkerSignerData } from './storage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NIP46_KIND = 24133;
const DEFAULT_PERMS = 'sign_event,get_public_key';
const REQUEST_TIMEOUT_MS = 60_000;
/** Default max wait for remote signer to open `nostrconnect://` and complete handshake. */
const NOSTR_CONNECT_WAIT_MS = 300_000;

// ---------------------------------------------------------------------------
// Module-level pool (shared across all bunker calls in this tab)
// ---------------------------------------------------------------------------

export const bunkerPool = new SimplePool();

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type Nip46ResponsePayload = {
  id: string;
  result?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRandomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

function encryptRequest(
  method: string,
  params: string[],
  clientSecret: Uint8Array,
  remoteSignerPubkey: string,
): { encrypted: string; id: string } {
  const id = generateRandomHex(16);

  const conversationKey = nip44.v2.utils.getConversationKey(
    clientSecret,
    remoteSignerPubkey,
  );

  const encrypted = nip44.encrypt(
    JSON.stringify({ id, method, params }),
    conversationKey,
  );

  return { encrypted, id };
}

async function decryptContent(
  content: string,
  senderPubkey: string,
  ephemeralSecret: Uint8Array,
): Promise<string | null> {
  try {
    if (content.includes('?iv=')) {
      return await nip04.decrypt(ephemeralSecret, senderPubkey, content);
    }

    const conversationKey = nip44.v2.utils.getConversationKey(
      ephemeralSecret,
      senderPubkey,
    );

    return nip44.decrypt(content, conversationKey);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Low-level NIP-46 request/response
// ---------------------------------------------------------------------------

type SendNip46RequestParams = {
  relays: string[];
  ephemeralSecret: Uint8Array;
  ephemeralPubkey: string;
  remoteSignerPubkey: string;
  method: string;
  params: string[];
};

function sendNip46Request(
  args: SendNip46RequestParams,
): Promise<Nip46ResponsePayload> {
  const {
    relays,
    ephemeralSecret,
    ephemeralPubkey,
    remoteSignerPubkey,
    method,
  } = args;

  const { encrypted, id } = encryptRequest(
    method,
    args.params,
    ephemeralSecret,
    remoteSignerPubkey,
  );

  const template: EventTemplate = {
    kind: NIP46_KIND,
    content: encrypted,
    tags: [['p', remoteSignerPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  };

  const signedEvent = finalizeEvent(template, ephemeralSecret);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.close();
      reject(new Error(`NIP-46 request timed out (${method})`));
    }, REQUEST_TIMEOUT_MS);

    const sub = bunkerPool.subscribe(
      relays,
      {
        kinds: [NIP46_KIND],
        authors: [remoteSignerPubkey],
        '#p': [ephemeralPubkey],
        limit: 1,
      },
      {
        onevent: async (event) => {
          if (
            event.kind !== NIP46_KIND ||
            event.pubkey !== remoteSignerPubkey
          ) {
            return;
          }

          const decrypted = await decryptContent(
            event.content,
            event.pubkey,
            ephemeralSecret,
          );

          if (!decrypted) {
            clearTimeout(timer);
            sub.close();
            reject(new Error('Failed to decrypt NIP-46 response'));

            return;
          }

          let parsed: Nip46ResponsePayload;
          try {
            parsed = JSON.parse(decrypted) as Nip46ResponsePayload;
          } catch (e) {
            clearTimeout(timer);
            sub.close();
            reject(e);

            return;
          }

          if (parsed.id !== id) {
            return;
          }

          clearTimeout(timer);
          sub.close();

          if (parsed.error) {
            reject(new Error(parsed.error));

            return;
          }

          resolve(parsed);
        },
      },
    );

    void Promise.allSettled(bunkerPool.publish(relays, signedEvent)).catch(
      (err) => {
        clearTimeout(timer);
        sub.close();
        reject(err as Error);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Parse bunker URL
// ---------------------------------------------------------------------------

export type ParsedBunkerUrl = {
  remoteSignerPubkey: string;
  relays: string[];
  secret: string | undefined;
};

export function parseBunkerUrl(bunkerUrl: string): ParsedBunkerUrl {
  const trimmed = bunkerUrl.trim();

  if (!trimmed.toLowerCase().startsWith('bunker://')) {
    throw new Error('Invalid bunker URL: must start with bunker://');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid bunker URL: could not parse');
  }

  const remoteSignerPubkey = url.hostname;

  if (!/^[a-fA-F0-9]{64}$/.test(remoteSignerPubkey)) {
    throw new Error('Invalid bunker URL: host must be a 64-char hex pubkey');
  }

  const relays = url.searchParams.getAll('relay').filter((r) => r.length > 0);

  if (relays.length === 0) {
    throw new Error(
      'Invalid bunker URL: at least one relay= param is required',
    );
  }

  const secret = url.searchParams.get('secret') ?? undefined;

  return { remoteSignerPubkey, relays, secret };
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

export function connectBunker(bunkerUrl: string): Promise<BunkerSignerData> {
  const { remoteSignerPubkey, relays, secret } = parseBunkerUrl(bunkerUrl);

  const clientSecret = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecret);

  const { encrypted: connectContent, id: connectId } = encryptRequest(
    'connect',
    [remoteSignerPubkey, secret ?? '', DEFAULT_PERMS],
    clientSecret,
    remoteSignerPubkey,
  );

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.close();
      reject(new Error('Bunker connect timed out'));
    }, REQUEST_TIMEOUT_MS);

    const sub = bunkerPool.subscribe(
      relays,
      {
        kinds: [NIP46_KIND],
        authors: [remoteSignerPubkey],
        '#p': [clientPubkey],
        limit: 10,
      },
      {
        onevent: async (event) => {
          if (
            event.kind !== NIP46_KIND ||
            event.pubkey !== remoteSignerPubkey
          ) {
            return;
          }

          const decrypted = await decryptContent(
            event.content,
            event.pubkey,
            clientSecret,
          );

          if (!decrypted) {
            return;
          }

          let parsed: { id: string; result?: string; error?: string };
          try {
            parsed = JSON.parse(decrypted) as {
              id: string;
              result?: string;
              error?: string;
            };
          } catch {
            return;
          }

          if (parsed.id !== connectId) {
            return;
          }

          if (parsed.error) {
            clearTimeout(timer);
            sub.close();
            reject(new Error(parsed.error));

            return;
          }

          const result = parsed.result ?? '';

          if (result === 'ack' || (secret !== undefined && result === secret)) {
            clearTimeout(timer);
            sub.close();

            try {
              const response = await sendNip46Request({
                relays,
                ephemeralSecret: clientSecret,
                ephemeralPubkey: clientPubkey,
                remoteSignerPubkey,
                method: 'get_public_key',
                params: [],
              });

              const userPubkey = response.result?.trim() ?? '';

              if (!/^[a-fA-F0-9]{64}$/.test(userPubkey)) {
                reject(new Error('Invalid get_public_key result'));

                return;
              }

              resolve({
                relays,
                ephemeralSecret: bytesToHex(clientSecret),
                ephemeralPubkey: clientPubkey,
                remoteSignerPubkey,
                userPubkey,
              });
            } catch (err) {
              reject(err);
            }
          }
        },
      },
    );

    const template: EventTemplate = {
      kind: NIP46_KIND,
      content: connectContent,
      tags: [['p', remoteSignerPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    };

    const signed = finalizeEvent(template, clientSecret);

    void Promise.allSettled(bunkerPool.publish(relays, signed)).catch((err) => {
      clearTimeout(timer);
      sub.close();
      reject(err as Error);
    });
  });
}

// ---------------------------------------------------------------------------
// Sign event via bunker
// ---------------------------------------------------------------------------

export async function bunkerSignEvent(
  data: BunkerSignerData,
  event: EventTemplate,
): Promise<VerifiedEvent> {
  const ephemeralSecret = hexToBytes(data.ephemeralSecret);

  const response = await sendNip46Request({
    relays: data.relays,
    ephemeralSecret,
    ephemeralPubkey: data.ephemeralPubkey,
    remoteSignerPubkey: data.remoteSignerPubkey,
    method: 'sign_event',
    params: [JSON.stringify(event)],
  });

  const signed = JSON.parse(response.result ?? 'null') as NostrEvent | null;

  if (!signed || typeof signed.id !== 'string') {
    throw new Error('Invalid sign_event response from bunker');
  }

  if (!verifyEvent(signed)) {
    throw new Error('Failed to verify sign_event response from bunker');
  }

  return signed as VerifiedEvent;
}

// ---------------------------------------------------------------------------
// Nostr Connect (client-initiated `nostrconnect://` — NIP-46)
//
// Uses nostr-tools BunkerSigner.fromURI; persisted shape is the same as bunker://.
// See https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#method-2-using-a-client-generated-uri-nostrconnect
// ---------------------------------------------------------------------------

export type NostrConnectPrepareResult = {
  uri: string;
  clientSecretKey: Uint8Array;
};

type GenerateNostrConnectUriProps = {
  relays: string[];
  name: string;
  url: string;
};

function generateConnectionSecret(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Build a `nostrconnect://` URI and ephemeral client key. Show the URI to the user
 * (QR / copy), then call {@link completeNostrConnect} with the same values.
 */
export function generateNostrConnectUri(
  props: GenerateNostrConnectUriProps,
): NostrConnectPrepareResult {
  const { relays, name, url } = props;
  const trimmed = relays.map((r) => r.trim()).filter((r) => r.length > 0);

  if (trimmed.length === 0) {
    throw new Error('At least one relay is required');
  }

  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  const secret = generateConnectionSecret();

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: trimmed,
    secret,
    perms: ['sign_event', 'get_public_key'],
    name,
    url,
  });

  return { uri, clientSecretKey };
}

type CompleteNostrConnectProps = {
  uri: string;
  clientSecretKey: Uint8Array;
};

/**
 * Subscribe for the remote signer to approve the connection (same URI + secret).
 * Resolves with {@link BunkerSignerData} compatible with {@link bunkerSignEvent}.
 */
export async function completeNostrConnect(
  props: CompleteNostrConnectProps,
): Promise<BunkerSignerData> {
  const { uri, clientSecretKey } = props;

  const signer = await BunkerSigner.fromURI(
    clientSecretKey,
    uri,
    { pool: bunkerPool },
    NOSTR_CONNECT_WAIT_MS,
  );

  try {
    const bp = signer.bp;

    if (!bp) {
      throw new Error('Nostr Connect failed: no bunker pointer');
    }

    await signer.connect();
    const userPubkey = await signer.getPublicKey();

    if (!/^[a-fA-F0-9]{64}$/.test(userPubkey)) {
      throw new Error('Invalid get_public_key result');
    }

    const ephemeralPubkey = getPublicKey(clientSecretKey);

    return {
      relays: bp.relays,
      ephemeralSecret: bytesToHex(clientSecretKey),
      ephemeralPubkey,
      remoteSignerPubkey: bp.pubkey,
      userPubkey,
    };
  } finally {
    await signer.close().catch(() => {});
  }
}
