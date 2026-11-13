// ---------------------------------------------------------------------------
// src/nostr/bunker.ts — NIP-46 Bunker (remote signer) client
//
// Adapted from recall-trainer/src/lib/nostr/BunkerProvider.ts
// + RemoteSignerHelpers.ts. Standalone — no React or app dependencies.
// ---------------------------------------------------------------------------

import type {
  EventTemplate,
  NostrEvent,
  SimplePool,
  VerifiedEvent,
} from 'nostr-tools';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip04,
  nip44,
  verifyEvent,
} from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

import { debug } from '@src/logger';

import {
  isRelaySuccess,
  publishSignedEventWithProgress,
} from './relay-publish';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NIP46_KIND = 24133;
const DEFAULT_PERMS = 'sign_event,get_public_key,nip44_encrypt,nip44_decrypt';
const REQUEST_TIMEOUT_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BunkerSignerData = {
  relays: string[];
  ephemeralSecret: string; // hex
  ephemeralPubkey: string;
  remoteSignerPubkey: string;
  userPubkey: string;
};

type Nip46ResponsePayload = {
  id: string;
  result?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRandomHexString(length: number): string {
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
  const id = generateRandomHexString(16);

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

function decryptContent(
  content: string,
  senderPubkey: string,
  ephemeralSecret: Uint8Array,
): string | null {
  try {
    if (content.includes('?iv=')) {
      return nip04.decrypt(ephemeralSecret, senderPubkey, content);
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

export type BunkerProgressSeverity = 'info' | 'warning' | 'error';
export type BunkerProgress = (
  message: string,
  severity: BunkerProgressSeverity,
) => void;

type SendNip46RequestProps = {
  pool: SimplePool;
  relays: string[];
  ephemeralSecret: Uint8Array;
  ephemeralPubkey: string;
  remoteSignerPubkey: string;
  method: string;
  params: string[];
  onProgress: BunkerProgress | null;
};

async function sendNip46Request(
  params: SendNip46RequestProps,
): Promise<Nip46ResponsePayload> {
  const {
    pool,
    relays,
    ephemeralSecret,
    ephemeralPubkey,
    remoteSignerPubkey,
    method,
  } = params;

  const { encrypted, id } = encryptRequest(
    method,
    params.params,
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

  params.onProgress?.(
    `NIP-46 ${method}: waiting up to ${REQUEST_TIMEOUT_MS / 1000}s; transport relays: ${relays.join(', ')}`,
    'info',
  );

  return new Promise((resolve, reject) => {
    let settled = false;
    const subscriptions: { close: (reason?: string) => void }[] = [];
    const listeningRelays = new Set<string>();
    const acceptingRelays = new Set<string>();
    const seenResponses = new Set<string>();

    const report = (message: string, severity: BunkerProgressSeverity) => {
      if (!settled) {
        params.onProgress?.(message, severity);
      }
    };

    const cleanup = () => {
      settled = true;
      clearTimeout(timer);
      for (const sub of subscriptions) {
        sub.close('NIP-46 request settled');
      }
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      cleanup();
      reject(error);
    };

    const timer = setTimeout(() => {
      fail(
        new Error(
          `NIP-46 request timed out (${method}) after ${REQUEST_TIMEOUT_MS / 1000}s; no matching signer response. Request accepted by ${acceptingRelays.size}/${relays.length} relay(s); reply subscriptions requested and not reported closed on ${listeningRelays.size}/${relays.length} relay(s). Transport relays: ${relays.join(', ')}`,
        ),
      );
    }, REQUEST_TIMEOUT_MS);

    const subscriptionFilter = {
      kinds: [NIP46_KIND],
      authors: [remoteSignerPubkey],
      '#p': [ephemeralPubkey],
      limit: 1,
    };

    debug('Subscribing to: ', subscriptionFilter, 'Relays: ', relays);

    const handleResponse = (event: NostrEvent, relay: string) => {
      if (settled) {
        return;
      }

      if (event.kind !== NIP46_KIND || event.pubkey !== remoteSignerPubkey) {
        return;
      }

      if (seenResponses.has(event.id)) {
        return;
      }

      seenResponses.add(event.id);

      report(
        `Reply transport ${relay}: received signer event ${event.id}`,
        'info',
      );

      const decrypted = decryptContent(
        event.content,
        event.pubkey,
        ephemeralSecret,
      );

      if (!decrypted) {
        report(
          `Reply transport ${relay}: ignored undecryptable event; continuing to wait for this request`,
          'warning',
        );

        return;
      }

      let parsed: Nip46ResponsePayload;
      try {
        const value: unknown = JSON.parse(decrypted);

        if (
          !value ||
          typeof value !== 'object' ||
          typeof (value as Nip46ResponsePayload).id !== 'string'
        ) {
          report(
            `Reply transport ${relay}: ignored malformed response envelope`,
            'warning',
          );

          return;
        }

        parsed = value as Nip46ResponsePayload;
      } catch {
        report(
          `Reply transport ${relay}: ignored malformed response JSON`,
          'warning',
        );

        return;
      }

      if (parsed.id !== id) {
        report(
          `Reply transport ${relay}: response belongs to another request; continuing to wait`,
          'info',
        );

        return;
      }

      report(
        `Reply transport ${relay}: response matches active ${method} request`,
        'info',
      );

      if (parsed.error) {
        fail(new Error(parsed.error));

        return;
      }

      report(`NIP-46 ${method}: matching signer response received`, 'info');

      cleanup();
      resolve(parsed);
    };

    for (const relay of relays) {
      report(`Reply transport ${relay}: connecting independently`, 'info');

      void pool
        .ensureRelay(relay, { connectionTimeout: 10_000 })
        .then(() => {
          if (settled) {
            return;
          }

          report(
            `Reply transport ${relay}: connected; requesting response subscription (REQ, not a server acknowledgement)`,
            'info',
          );

          listeningRelays.add(relay);

          const sub = pool.subscribe([relay], subscriptionFilter, {
            onevent: (event) => handleResponse(event, relay),
            oninvalidevent: () =>
              report(
                `Reply transport ${relay}: invalid event ignored by relay client`,
                'warning',
              ),
            onclose: (reasons) => {
              if (settled) {
                return;
              }

              listeningRelays.delete(relay);

              report(
                `Reply transport ${relay}: response subscription closed: ${reasons.map((item) => item.reason).join('; ') || 'no reason supplied'}`,
                'warning',
              );
            },
          });

          subscriptions.push(sub);

          if (settled) {
            sub.close('NIP-46 request already settled');
          }
        })
        .catch((error) => {
          listeningRelays.delete(relay);

          report(
            `Reply transport ${relay}: connection/subscription failed: ${error instanceof Error ? error.message : String(error)}; other relays continue`,
            'warning',
          );
        });
    }

    void publishSignedEventWithProgress({
      relays,
      signed: signedEvent,
      onResult: (result) => {
        if (settled) {
          return;
        }

        if (isRelaySuccess(result)) {
          acceptingRelays.add(result.relay);
        }

        report(
          `Signing transport ${result.relay}: ${isRelaySuccess(result) ? 'request accepted (delivery to signer not confirmed)' : result.result.message}`,
          isRelaySuccess(result) ? 'info' : 'warning',
        );
      },
    })
      .then((publishOutcomes) => {
        const acceptedRelays = publishOutcomes
          .filter(isRelaySuccess)
          .map((r) => r.relay);

        if (acceptedRelays.length === 0) {
          throw new Error('Failed to publish NIP-46 request to any relay');
        }

        debug('NIP-46 sign request published to relays: ', acceptedRelays);
      })
      .catch((err) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

// ---------------------------------------------------------------------------
// Parse bunker URL
// ---------------------------------------------------------------------------

export type ParsedBunkerUrl = {
  remoteSignerPubkey: string;
  relays: string[];
  secret?: string;
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

export function connectBunker(
  pool: SimplePool,
  bunkerUrl: string,
): Promise<BunkerSignerData> {
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

    const sub = pool.subscribe(
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

          const decrypted = decryptContent(
            event.content,
            event.pubkey,
            clientSecret,
          );

          if (!decrypted) {
            return;
          }

          let parsed: { id: string; result?: string; error?: string };
          try {
            parsed = JSON.parse(decrypted);
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
                pool,
                relays,
                ephemeralSecret: clientSecret,
                ephemeralPubkey: clientPubkey,
                remoteSignerPubkey,
                method: 'get_public_key',
                params: [],
                onProgress: null,
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
      pubkey: clientPubkey,
      content: connectContent,
      tags: [['p', remoteSignerPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    } as EventTemplate;

    const signed = finalizeEvent(template, clientSecret);

    void Promise.allSettled(pool.publish(relays, signed)).catch((err) => {
      clearTimeout(timer);
      sub.close();
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Sign event via bunker
// ---------------------------------------------------------------------------

export async function bunkerSignEvent(
  pool: SimplePool,
  data: BunkerSignerData,
  event: EventTemplate,
): Promise<VerifiedEvent> {
  return bunkerSignEventWithProgress({ pool, data, event, onProgress: null });
}

type BunkerSignEventWithProgressProps = {
  pool: SimplePool;
  data: BunkerSignerData;
  event: EventTemplate;
  onProgress: BunkerProgress | null;
};

export async function bunkerSignEventWithProgress({
  pool,
  data,
  event,
  onProgress,
}: BunkerSignEventWithProgressProps): Promise<VerifiedEvent> {
  const ephemeralSecret = hexToBytes(data.ephemeralSecret);

  const response = await sendNip46Request({
    pool,
    relays: data.relays,
    ephemeralSecret,
    ephemeralPubkey: data.ephemeralPubkey,
    remoteSignerPubkey: data.remoteSignerPubkey,
    method: 'sign_event',
    params: [JSON.stringify(event)],
    onProgress,
  });

  const signed = JSON.parse(response.result ?? 'null') as NostrEvent;

  if (!signed || typeof signed.id !== 'string') {
    throw new Error('Invalid sign_event response from bunker');
  }

  const verified = verifyEvent(signed);

  if (!verified) {
    throw new Error('Failed to verify sign_event response from bunker');
  }

  return signed;
}

export async function bunkerNip44Encrypt(props: {
  pool: SimplePool;
  data: BunkerSignerData;
  pubkey: string;
  plaintext: string;
}): Promise<string> {
  const ephemeralSecret = hexToBytes(props.data.ephemeralSecret);

  const response = await sendNip46Request({
    pool: props.pool,
    relays: props.data.relays,
    ephemeralSecret,
    ephemeralPubkey: props.data.ephemeralPubkey,
    remoteSignerPubkey: props.data.remoteSignerPubkey,
    method: 'nip44_encrypt',
    params: [props.pubkey, props.plaintext],
    onProgress: null,
  });

  const encrypted = response.result?.trim() ?? '';

  if (!encrypted) {
    throw new Error('Invalid nip44_encrypt response from bunker');
  }

  return encrypted;
}

export async function bunkerNip44Decrypt(props: {
  pool: SimplePool;
  data: BunkerSignerData;
  pubkey: string;
  ciphertext: string;
}): Promise<string> {
  const ephemeralSecret = hexToBytes(props.data.ephemeralSecret);

  const response = await sendNip46Request({
    pool: props.pool,
    relays: props.data.relays,
    ephemeralSecret,
    ephemeralPubkey: props.data.ephemeralPubkey,
    remoteSignerPubkey: props.data.remoteSignerPubkey,
    method: 'nip44_decrypt',
    params: [props.pubkey, props.ciphertext],
    onProgress: null,
  });

  const plaintext = response.result ?? '';

  if (!plaintext) {
    throw new Error('Invalid nip44_decrypt response from bunker');
  }

  return plaintext;
}
