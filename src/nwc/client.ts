import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import { finalizeEvent, getPublicKey, nip44, verifyEvent } from 'nostr-tools';
import type { SubCloser } from 'nostr-tools/pool';
import { hexToBytes } from 'nostr-tools/utils';

import { Millisatoshi } from '@src/payments/types';

import { parseNwcConnectionUri, safeNwcConnection } from './connection';
import {
  NwcAbortedError,
  NwcMethodUnsupportedError,
  NwcNetworkError,
  NwcPublishError,
  NwcPublishTimeoutError,
  NwcReplyTimeoutError,
  NwcResponseError,
  NwcUnsupportedEncryptionError,
  NwcWalletError,
} from './errors';
import {
  NWC_ENCRYPTION,
  NWC_WALLET_INFO_KIND,
  NWC_WALLET_REQUEST_KIND,
  NWC_WALLET_RESPONSE_KIND,
  parseNwcResponse,
  parseNwcWalletServiceInfo,
  serializeNwcRequest,
} from './protocol';
import type { NwcTransport } from './transport';
import type {
  NwcConnection,
  NwcInvoiceLookupResult,
  NwcPaymentResult,
  NwcRequestPayload,
  NwcResponsePayload,
  NwcSuccessResponse,
  NwcWalletInfo,
  NwcWalletServiceInfo,
  SafeNwcConnection,
} from './types';

const DEFAULT_PUBLISH_TIMEOUT_MS = 5_000;
const DEFAULT_REPLY_TIMEOUT_MS = 60_000;
const DEFAULT_INFO_TIMEOUT_MS = 10_000;
const MAX_ENCRYPTED_RESPONSE_LENGTH = 128 * 1024;

export type NwcClientOptions = {
  transport: NwcTransport;
  connection: NwcConnection;
  publishTimeoutMs?: number;
  replyTimeoutMs?: number;
  infoTimeoutMs?: number;
};

export type NwcRequestOptions = {
  signal?: AbortSignal;
};

export type NwcPayInvoiceRequest = NwcRequestOptions & {
  invoice: string;
  amount?: Millisatoshi;
  metadata?: Record<string, unknown>;
};

export type NwcLookupInvoiceRequest = NwcRequestOptions & {
  invoice?: string;
  paymentHash?: string;
};

function hasTag(event: NostrEvent, name: string, value: string): boolean {
  return event.tags.some((tag) => tag[0] === name && tag[1] === value);
}

function positiveTimeout(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

export class NwcClient {
  readonly #transport: NwcTransport;
  readonly #connection: NwcConnection;
  readonly #secretKey: Uint8Array;
  readonly #clientPubkey: string;
  readonly #conversationKey: Uint8Array;
  readonly #publishTimeoutMs: number;
  readonly #replyTimeoutMs: number;
  readonly #infoTimeoutMs: number;
  #walletServiceInfoPromise: Promise<NwcWalletServiceInfo> | null = null;

  constructor(options: NwcClientOptions) {
    this.#transport = options.transport;
    this.#connection = options.connection;
    this.#secretKey = hexToBytes(options.connection.secret);
    this.#clientPubkey = getPublicKey(this.#secretKey);

    this.#conversationKey = nip44.getConversationKey(
      this.#secretKey,
      options.connection.walletPubkey,
    );

    this.#publishTimeoutMs = positiveTimeout(
      options.publishTimeoutMs,
      DEFAULT_PUBLISH_TIMEOUT_MS,
    );

    this.#replyTimeoutMs = positiveTimeout(
      options.replyTimeoutMs,
      DEFAULT_REPLY_TIMEOUT_MS,
    );

    this.#infoTimeoutMs = positiveTimeout(
      options.infoTimeoutMs,
      DEFAULT_INFO_TIMEOUT_MS,
    );
  }

  static fromUri(transport: NwcTransport, connectionUri: string): NwcClient {
    return new NwcClient({
      transport,
      connection: parseNwcConnectionUri(connectionUri),
    });
  }

  get connection(): SafeNwcConnection {
    return safeNwcConnection(this.#connection);
  }

  get clientPubkey(): string {
    return this.#clientPubkey;
  }

  async getWalletServiceInfo(
    options: NwcRequestOptions = {},
  ): Promise<NwcWalletServiceInfo> {
    if (options.signal?.aborted) {
      throw new NwcAbortedError();
    }

    if (!this.#walletServiceInfoPromise) {
      this.#walletServiceInfoPromise = this.#loadWalletServiceInfo(
        options.signal,
      ).catch((error) => {
        this.#walletServiceInfoPromise = null;
        throw error;
      });
    }

    return this.#walletServiceInfoPromise;
  }

  async getInfo(options: NwcRequestOptions = {}): Promise<NwcWalletInfo> {
    const response = await this.#execute(
      { method: 'get_info', params: {} },
      options.signal,
    );

    if (response.result_type !== 'get_info') {
      throw new NwcResponseError('NWC wallet returned an unexpected result.');
    }

    const { block_height: blockHeight, ...result } = response.result;

    return { ...result, blockHeight };
  }

  async getBalance(options: NwcRequestOptions = {}): Promise<Millisatoshi> {
    const response = await this.#execute(
      { method: 'get_balance', params: {} },
      options.signal,
    );

    if (response.result_type !== 'get_balance') {
      throw new NwcResponseError('NWC wallet returned an unexpected result.');
    }

    return Millisatoshi.parse(BigInt(response.result.balance));
  }

  async payInvoice(request: NwcPayInvoiceRequest): Promise<NwcPaymentResult> {
    const response = await this.#execute(
      {
        method: 'pay_invoice',
        params: {
          invoice: request.invoice,
          ...(request.amount
            ? { amount: request.amount.toNwcWireNumber() }
            : {}),
          ...(request.metadata ? { metadata: request.metadata } : {}),
        },
      },
      request.signal,
    );

    if (response.result_type !== 'pay_invoice') {
      throw new NwcResponseError('NWC wallet returned an unexpected result.');
    }

    return {
      preimage: response.result.preimage,
      feesPaid:
        response.result.fees_paid === undefined
          ? null
          : Millisatoshi.parse(BigInt(response.result.fees_paid)),
    };
  }

  async lookupInvoice(
    request: NwcLookupInvoiceRequest,
  ): Promise<NwcInvoiceLookupResult> {
    const response = await this.#execute(
      {
        method: 'lookup_invoice',
        params: {
          ...(request.invoice ? { invoice: request.invoice } : {}),
          ...(request.paymentHash ? { payment_hash: request.paymentHash } : {}),
        },
      },
      request.signal,
    );

    if (response.result_type !== 'lookup_invoice') {
      throw new NwcResponseError('NWC wallet returned an unexpected result.');
    }

    const { amount, fees_paid: feesPaid, ...result } = response.result;

    return {
      ...result,
      amount: Millisatoshi.parse(BigInt(amount)),
      feesPaid:
        feesPaid === undefined ? null : Millisatoshi.parse(BigInt(feesPaid)),
    };
  }

  async #loadWalletServiceInfo(
    signal: AbortSignal | undefined,
  ): Promise<NwcWalletServiceInfo> {
    if (signal?.aborted) {
      throw new NwcAbortedError();
    }

    return new Promise((resolve, reject) => {
      let subscription: SubCloser | null = null;
      let settled = false;

      const finish = (
        result:
          | { type: 'success'; value: NwcWalletServiceInfo }
          | { type: 'error'; error: unknown },
      ) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        subscription?.close();

        if (result.type === 'success') {
          resolve(result.value);
        } else {
          reject(result.error);
        }
      };

      const onAbort = () =>
        finish({ type: 'error', error: new NwcAbortedError() });

      const timeout = setTimeout(
        () => finish({ type: 'error', error: new NwcReplyTimeoutError() }),
        this.#infoTimeoutMs,
      );

      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        subscription = this.#transport.subscribe(
          [...this.#connection.relayUrls],
          {
            kinds: [NWC_WALLET_INFO_KIND],
            authors: [this.#connection.walletPubkey],
            limit: 1,
          },
          {
            maxWait: this.#infoTimeoutMs,
            onevent: (event) => {
              if (
                event.kind !== NWC_WALLET_INFO_KIND ||
                event.pubkey !== this.#connection.walletPubkey ||
                !verifyEvent(event)
              ) {
                return;
              }

              try {
                const info = parseNwcWalletServiceInfo(event);

                if (!info.encryptions.includes(NWC_ENCRYPTION)) {
                  finish({
                    type: 'error',
                    error: new NwcUnsupportedEncryptionError(),
                  });

                  return;
                }

                finish({ type: 'success', value: info });
              } catch (error) {
                finish({ type: 'error', error });
              }
            },
          },
        );
      } catch (error) {
        finish({
          type: 'error',
          error: new NwcNetworkError(undefined, error),
        });
      }
    });
  }

  async #execute(
    payload: NwcRequestPayload,
    signal: AbortSignal | undefined,
  ): Promise<NwcSuccessResponse> {
    if (signal?.aborted) {
      throw new NwcAbortedError();
    }

    const walletInfo = await this.getWalletServiceInfo({ signal });

    if (!walletInfo.methods.includes(payload.method)) {
      throw new NwcMethodUnsupportedError(payload.method);
    }

    const plaintext = serializeNwcRequest(payload);
    const encrypted = nip44.encrypt(plaintext, this.#conversationKey);
    const now = Math.floor(Date.now() / 1000);
    const expiration = now + Math.ceil(this.#replyTimeoutMs / 1000) + 5;

    const template: EventTemplate = {
      kind: NWC_WALLET_REQUEST_KIND,
      created_at: now,
      content: encrypted,
      tags: [
        ['p', this.#connection.walletPubkey],
        ['encryption', NWC_ENCRYPTION],
        ['expiration', String(expiration)],
      ],
    };

    const requestEvent = finalizeEvent(template, this.#secretKey);

    return new Promise((resolve, reject) => {
      let subscription: SubCloser | null = null;
      let settled = false;
      let publishSettled = false;

      const finish = (
        result:
          | { type: 'success'; value: NwcSuccessResponse }
          | { type: 'error'; error: unknown },
      ) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(publishTimeout);
        clearTimeout(replyTimeout);
        signal?.removeEventListener('abort', onAbort);
        subscription?.close();

        if (result.type === 'success') {
          resolve(result.value);
        } else {
          reject(result.error);
        }
      };

      const onAbort = () =>
        finish({ type: 'error', error: new NwcAbortedError() });

      const publishTimeout = setTimeout(() => {
        if (!publishSettled) {
          finish({ type: 'error', error: new NwcPublishTimeoutError() });
        }
      }, this.#publishTimeoutMs);

      const replyTimeout = setTimeout(
        () => finish({ type: 'error', error: new NwcReplyTimeoutError() }),
        this.#replyTimeoutMs,
      );

      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        subscription = this.#transport.subscribe(
          [...this.#connection.relayUrls],
          {
            kinds: [NWC_WALLET_RESPONSE_KIND],
            authors: [this.#connection.walletPubkey],
            '#e': [requestEvent.id],
            '#p': [this.#clientPubkey],
          },
          {
            maxWait: this.#replyTimeoutMs,
            onevent: (event) => {
              if (
                event.kind !== NWC_WALLET_RESPONSE_KIND ||
                event.pubkey !== this.#connection.walletPubkey ||
                !hasTag(event, 'e', requestEvent.id) ||
                !hasTag(event, 'p', this.#clientPubkey) ||
                !verifyEvent(event)
              ) {
                return;
              }

              try {
                const response = this.#decodeResponse(event);

                if (response.result_type !== payload.method) {
                  throw new NwcResponseError(
                    'NWC response result type does not match the request.',
                  );
                }

                if (response.error) {
                  finish({
                    type: 'error',
                    error: new NwcWalletError(
                      response.error.code,
                      response.error.message,
                    ),
                  });

                  return;
                }

                finish({ type: 'success', value: response });
              } catch (error) {
                finish({ type: 'error', error });
              }
            },
          },
        );

        const publishes = this.#transport.publish(
          [...this.#connection.relayUrls],
          requestEvent,
          { maxWait: this.#publishTimeoutMs, abort: signal },
        );

        void Promise.any(publishes)
          .then(() => {
            publishSettled = true;
            clearTimeout(publishTimeout);
          })
          .catch((error) => {
            publishSettled = true;

            finish({
              type: 'error',
              error: new NwcPublishError(undefined, error),
            });
          });
      } catch (error) {
        finish({
          type: 'error',
          error: new NwcNetworkError(undefined, error),
        });
      }
    });
  }

  #decodeResponse(event: NostrEvent): NwcResponsePayload {
    if (event.content.length > MAX_ENCRYPTED_RESPONSE_LENGTH) {
      throw new NwcResponseError('NWC response exceeds the size limit.');
    }

    let plaintext: string;

    try {
      plaintext = nip44.decrypt(event.content, this.#conversationKey);
    } catch (error) {
      throw new NwcResponseError('Could not decrypt the NWC response.', error);
    }

    return parseNwcResponse(plaintext);
  }
}
