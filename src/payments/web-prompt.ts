import type { SimplePool } from 'nostr-tools/pool';

import { NwcClient } from '@src/nwc/client';
import { parseNwcConnectionUri } from '@src/nwc/connection';
import { NwcError, NwcWalletError } from '@src/nwc/errors';
import { getStoredNwcConnection } from '@src/nwc/state';
import { normalizeMintUrl } from '@src/wallet/mint-url';
import type { WebSocketMessageSender } from '@src/web/ws-prompt-session';
import {
  createPaymentRequestMessage,
  createPaymentStatusMessage,
  type PaymentActionClientMessage,
} from '@src/web/ws-schema';

import type { CoreDb } from '../db';

import type {
  InteractivePaymentResult,
  LightningPaymentReceipt,
  PaymentFailureCode,
} from './interactive-types';
import { verifyLightningPreimage } from './lightning-invoice';
import type {
  InteractivePaymentPresentation,
  InteractivePaymentPresenter,
} from './service';
import { createValidatedLightningInvoice } from './validation';
import type {
  WebPaymentNwcSource,
  WebPaymentRequest,
  WebPaymentStatus,
} from './web-types';

const MODAL_TIMEOUT_MS = 10 * 60_000;
const SETTLEMENT_TIMEOUT_MS = 45_000;
const SETTLEMENT_POLL_MS = 2_000;
const CALLBACK_TIMEOUT_MS = 8_000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

type PreparedLightning = Awaited<
  ReturnType<typeof createValidatedLightningInvoice>
>;

type PendingPayment = {
  presentation: InteractivePaymentPresentation;
  lightning: PreparedLightning | null;
  resolve: (result: InteractivePaymentResult) => void;
  modalTimer: ReturnType<typeof setTimeout>;
  expiryTimer: ReturnType<typeof setTimeout> | null;
  effectiveExpiresAt: number;
};

function effectiveInvoiceExpiry(
  lightning: PreparedLightning,
  freshlyCreated: boolean,
): number {
  if (
    !freshlyCreated ||
    Math.abs(lightning.parsed.createdAt * 1000 - Date.now()) <=
      CLOCK_SKEW_TOLERANCE_MS
  ) {
    return lightning.parsed.expiresAt;
  }

  const lifetime = Math.max(
    0,
    lightning.parsed.expiresAt - lightning.parsed.createdAt,
  );

  return Math.floor(Date.now() / 1000) + lifetime;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Payment callback timed out.')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function nwcFailure(error: unknown): {
  code: PaymentFailureCode;
  message: string;
} {
  if (error instanceof NwcWalletError) {
    switch (error.walletCode) {
      case 'INSUFFICIENT_BALANCE':
        return { code: 'INSUFFICIENT_BALANCE', message: error.message };
      case 'QUOTA_EXCEEDED':
        return { code: 'QUOTA_EXCEEDED', message: error.message };
      case 'UNAUTHORIZED':
      case 'RESTRICTED':
        return { code: 'UNAUTHORIZED', message: error.message };
      default:
        return { code: 'PAYMENT_FAILED', message: error.message };
    }
  }

  if (
    error instanceof NwcError &&
    (error.code === 'NWC_REPLY_TIMEOUT' || error.code === 'NWC_PUBLISH_TIMEOUT')
  ) {
    return { code: 'PAYMENT_TIMEOUT', message: error.message };
  }

  return {
    code: 'PROVIDER_UNAVAILABLE',
    message: error instanceof Error ? error.message : 'NWC payment failed.',
  };
}

export class WebSocketPaymentSession {
  readonly #coreDb: CoreDb;
  readonly #pool: SimplePool;
  #sender: WebSocketMessageSender | null = null;
  #pending: PendingPayment | null = null;
  #actionRunning = false;

  constructor(params: { coreDb: CoreDb; pool: SimplePool }) {
    this.#coreDb = params.coreDb;
    this.#pool = params.pool;
  }

  setSender(sender: WebSocketMessageSender): void {
    this.#sender = sender;
  }

  readonly present: InteractivePaymentPresenter = async (presentation) => {
    if (!this.#sender) {
      return {
        status: 'unsupported',
        reasons: [
          {
            code: 'PAYMENT_UI_UNAVAILABLE',
            message: 'The browser payment UI is disconnected.',
          },
        ],
      };
    }

    if (!presentation.request.lightning) {
      return {
        status: 'unsupported',
        reasons: [
          {
            code: 'CASHU_UNAVAILABLE',
            message: 'Cashu payment execution is not implemented yet.',
          },
        ],
      };
    }

    const lightningOption = presentation.request.lightning;

    let lightning: PreparedLightning;

    try {
      lightning = await createValidatedLightningInvoice(lightningOption);
    } catch (error) {
      return {
        status: 'failed',
        error: {
          code: 'INVOICE_CREATION_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Lightning invoice creation failed.',
        },
      };
    }

    return new Promise<InteractivePaymentResult>((resolve) => {
      const modalTimer = setTimeout(() => {
        void this.#sendStatus({
          state: 'failed',
          sourceId: null,
          code: 'PAYMENT_TIMEOUT',
          message: 'The payment approval window timed out.',
        }).finally(() => {
          this.#finish({
            status: 'failed',
            error: {
              code: 'PAYMENT_TIMEOUT',
              message: 'The payment approval window timed out.',
            },
          });
        });
      }, MODAL_TIMEOUT_MS);

      this.#pending = {
        presentation,
        lightning,
        resolve,
        modalTimer,
        expiryTimer: null,
        effectiveExpiresAt: effectiveInvoiceExpiry(
          lightning,
          lightningOption.freshlyCreated === true,
        ),
      };

      void this.#sendRequest().catch(() => {
        this.#finish({
          status: 'failed',
          error: {
            code: 'PAYMENT_FAILED',
            message: 'Payment source discovery failed.',
          },
        });
      });
    });
  };

  async handleAction(message: PaymentActionClientMessage): Promise<void> {
    const pending = this.#pending;

    if (!pending || pending.presentation.attemptId !== message.attemptId) {
      return;
    }

    if (message.action === 'reject' || message.action === 'close') {
      await this.#sendStatus({
        state: 'rejected',
        sourceId: null,
        message: 'Payment rejected.',
      });

      this.#finish({
        status: 'rejected',
        reason: message.action === 'close' ? 'modal-closed' : 'user-rejected',
      });

      return;
    }

    if (this.#actionRunning) {
      return;
    }

    this.#actionRunning = true;

    try {
      switch (message.action) {
        case 'refresh_invoice':
          await this.#refreshInvoice();
          break;
        case 'pay_nwc':
          await this.#payNwc(message.sourceId ?? '');
          break;
        case 'webln_result':
          await this.#acceptWeblnResult(message.preimage, message.error);
          break;
        case 'check_settlement':
          await this.#settle('other', null);
          break;
        default:
          break;
      }
    } finally {
      this.#actionRunning = false;
    }
  }

  close(): void {
    if (!this.#pending) {
      return;
    }

    this.#finish({ status: 'rejected', reason: 'modal-closed' });
    this.#sender = null;
  }

  async #refreshInvoice(): Promise<void> {
    const pending = this.#pending;

    if (!pending?.presentation.request.lightning) {
      return;
    }

    if (pending.presentation.request.lightning.refreshable === false) {
      await this.#sendStatus({
        state: 'expired',
        sourceId: null,
        code: 'INVOICE_EXPIRED',
        message:
          'Close this payment and submit again to request a fresh invoice.',
      });

      return;
    }

    try {
      pending.lightning = await createValidatedLightningInvoice(
        pending.presentation.request.lightning,
      );

      pending.effectiveExpiresAt = effectiveInvoiceExpiry(
        pending.lightning,
        pending.presentation.request.lightning.freshlyCreated === true,
      );

      await this.#sendRequest();
    } catch (error) {
      await this.#sendStatus({
        state: 'failed',
        sourceId: null,
        code: 'INVOICE_CREATION_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Lightning invoice creation failed.',
      });
    }
  }

  async #payNwc(sourceId: string): Promise<void> {
    const pending = this.#pending;

    if (!pending?.lightning) {
      return;
    }

    if (
      !pending.presentation.sources.nwc.some((source) => source.id === sourceId)
    ) {
      await this.#sendStatus({
        state: 'failed',
        sourceId,
        code: 'UNAUTHORIZED',
        message: 'That NWC wallet is not eligible for this payment.',
      });

      return;
    }

    const stored = getStoredNwcConnection(this.#coreDb, sourceId);

    if (!stored) {
      await this.#sendStatus({
        state: 'failed',
        sourceId,
        code: 'PROVIDER_UNAVAILABLE',
        message: 'NWC wallet is no longer available.',
      });

      return;
    }

    await this.#sendStatus({
      state: 'paying',
      sourceId,
      message: `Waiting for ${stored.label}...`,
    });

    try {
      const client = this.#nwcClient(stored.connectionUri);

      const result = await client.payInvoice({
        invoice: pending.lightning.parsed.invoice,
      });

      if (
        !verifyLightningPreimage(
          result.preimage,
          pending.lightning.parsed.paymentHash,
        )
      ) {
        const failure = {
          code: 'PAYMENT_FAILED' as const,
          message: 'Wallet returned an invalid payment preimage.',
        };

        await this.#sendStatus({
          state: 'failed',
          sourceId,
          ...failure,
        });

        this.#finish({ status: 'failed', error: failure });

        return;
      }

      await this.#settle('nwc', sourceId, result.feesPaid?.toString() ?? null);
    } catch (error) {
      const failure = nwcFailure(error);

      if (failure.code === 'PAYMENT_TIMEOUT') {
        try {
          const lookup = await this.#nwcClient(
            stored.connectionUri,
          ).lookupInvoice({ invoice: pending.lightning.parsed.invoice });

          if (
            lookup.state === 'settled' &&
            lookup.preimage &&
            verifyLightningPreimage(
              lookup.preimage,
              pending.lightning.parsed.paymentHash,
            )
          ) {
            await this.#settle(
              'nwc',
              sourceId,
              lookup.feesPaid?.toString() ?? null,
            );

            return;
          }
        } catch {
          // Preserve the original timeout when reconciliation is unavailable.
        }
      }

      await this.#sendStatus({
        state: 'failed',
        sourceId,
        code: failure.code,
        message: failure.message,
      });

      if (failure.code === 'PAYMENT_TIMEOUT') {
        this.#finish({ status: 'failed', error: failure });
      }
    }
  }

  async #acceptWeblnResult(
    preimage: string | undefined,
    error: string | undefined,
  ): Promise<void> {
    const pending = this.#pending;

    if (!pending?.lightning) {
      return;
    }

    if (error) {
      const timedOut = error.toLowerCase().includes('timed out');

      const failure = {
        code: timedOut
          ? ('PAYMENT_TIMEOUT' as const)
          : ('PAYMENT_FAILED' as const),
        message: error,
      };

      await this.#sendStatus({
        state: 'failed',
        sourceId: 'webln',
        ...failure,
      });

      if (timedOut) {
        this.#finish({ status: 'failed', error: failure });
      }

      return;
    }

    if (
      !preimage ||
      !verifyLightningPreimage(preimage, pending.lightning.parsed.paymentHash)
    ) {
      const failure = {
        code: 'PAYMENT_FAILED' as const,
        message: 'WebLN returned an invalid payment preimage.',
      };

      await this.#sendStatus({
        state: 'failed',
        sourceId: 'webln',
        ...failure,
      });

      this.#finish({ status: 'failed', error: failure });

      return;
    }

    await this.#settle('webln', null);
  }

  async #settle(
    source: LightningPaymentReceipt['source'],
    sourceId: string | null,
    fee: string | null = null,
  ): Promise<void> {
    const pending = this.#pending;

    if (!pending?.lightning) {
      return;
    }

    await this.#sendStatus({
      state: 'settling',
      sourceId: source === 'webln' ? 'webln' : sourceId,
      message: 'Waiting for recipient settlement confirmation...',
      fee,
    });

    const deadline = Date.now() + SETTLEMENT_TIMEOUT_MS;

    try {
      while (Date.now() < deadline) {
        const settlement = await withTimeout(
          pending.lightning.checkSettlement(),
          CALLBACK_TIMEOUT_MS,
        );

        if (settlement.status === 'settled') {
          await this.#sendStatus({
            state: 'success',
            sourceId: source === 'webln' ? 'webln' : sourceId,
            message: 'Payment confirmed.',
            fee,
          });

          this.#finish({
            status: 'success',
            receipt: {
              type: 'lightning',
              attemptId: pending.presentation.attemptId,
              amount: pending.presentation.request.amount,
              paymentHash: pending.lightning.parsed.paymentHash,
              source,
              sourceId,
            },
          });

          return;
        }

        if (settlement.status === 'failed') {
          throw new Error(settlement.message);
        }

        await wait(SETTLEMENT_POLL_MS);
      }

      throw new Error('Settlement confirmation timed out.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Settlement confirmation failed.';

      await this.#sendStatus({
        state: 'failed',
        sourceId: source === 'webln' ? 'webln' : sourceId,
        code: message.includes('timed out')
          ? 'PAYMENT_TIMEOUT'
          : 'SETTLEMENT_FAILED',
        message,
        fee,
      });

      if (source !== 'other') {
        this.#finish({
          status: 'failed',
          error: {
            code: message.includes('timed out')
              ? 'PAYMENT_TIMEOUT'
              : 'SETTLEMENT_FAILED',
            message,
          },
        });
      }
    }
  }

  async #sendRequest(): Promise<void> {
    const pending = this.#pending;

    if (!pending || !this.#sender) {
      return;
    }

    const request = await this.#wireRequest(pending);

    if (this.#pending !== pending || !this.#sender) {
      return;
    }

    await this.#sender(createPaymentRequestMessage(request));

    const expiryMessage =
      pending.presentation.request.lightning?.refreshable === false
        ? 'Invoice expired. Close this payment and submit again.'
        : 'Invoice expired. Request a fresh invoice.';

    await this.#sendStatus({
      state:
        pending.lightning && pending.effectiveExpiresAt * 1000 <= Date.now()
          ? 'expired'
          : 'ready',
      sourceId: null,
      message:
        pending.lightning && pending.effectiveExpiresAt * 1000 <= Date.now()
          ? expiryMessage
          : 'Choose a payment source.',
      code:
        pending.lightning && pending.effectiveExpiresAt * 1000 <= Date.now()
          ? 'INVOICE_EXPIRED'
          : null,
    });

    this.#scheduleExpiry(pending);
  }

  async #wireRequest(pending: PendingPayment): Promise<WebPaymentRequest> {
    const request = pending.presentation.request;

    const acceptedMints = new Set(
      request.cashu?.acceptedMints.map((mint) => normalizeMintUrl(mint)) ?? [],
    );

    const cashu = pending.presentation.sources.cashu
      .filter((mint) => acceptedMints.has(normalizeMintUrl(mint.mintUrl)))
      .map((mint) => ({
        mintUrl: mint.mintUrl,
        balance: mint.balance.toString(),
      }));

    const unsupported = [];

    if (request.cashu && cashu.length === 0) {
      unsupported.push({
        code: 'MINT_MISMATCH' as const,
        message: 'No funded local Cashu mint matches the recipient.',
      });
    } else if (request.cashu) {
      unsupported.push({
        code: 'CASHU_UNAVAILABLE' as const,
        message: 'Cashu payment execution is not implemented yet.',
      });
    }

    return {
      attemptId: pending.presentation.attemptId,
      app: {
        pluginAlias: pending.presentation.app.pluginAlias,
        title: pending.presentation.app.title,
        iconUrl: pending.presentation.app.iconUrl,
      },
      purpose: request.purpose,
      recipient: request.recipient,
      amount: request.amount.toString(),
      lightning: pending.lightning
        ? {
            invoice: pending.lightning.parsed.invoice,
            paymentHash: pending.lightning.parsed.paymentHash,
            network: pending.lightning.parsed.network,
            expiresAt: pending.effectiveExpiresAt,
            refreshable:
              pending.presentation.request.lightning?.refreshable !== false,
          }
        : null,
      nwc: pending.lightning
        ? await Promise.all(
            pending.presentation.sources.nwc.map((source) =>
              this.#inspectNwc(source.id),
            ),
          )
        : [],
      cashu,
      cashuAccepted: request.cashu !== null,
      weblnAllowed:
        pending.presentation.app.sourcePolicy !== 'nwc-only' &&
        pending.lightning !== null,
      otherAllowed:
        pending.presentation.app.sourcePolicy !== 'nwc-only' &&
        pending.lightning !== null,
      unsupported,
    };
  }

  async #inspectNwc(id: string): Promise<WebPaymentNwcSource> {
    const stored = getStoredNwcConnection(this.#coreDb, id);

    if (!stored) {
      return {
        id,
        label: 'Removed NWC wallet',
        walletAlias: null,
        available: false,
        balance: null,
        message: 'Wallet is no longer configured.',
      };
    }

    try {
      const client = this.#nwcClient(stored.connectionUri);

      const service = await client.getWalletServiceInfo({
        signal: AbortSignal.timeout(5_000),
      });

      if (!service.methods.includes('pay_invoice')) {
        return {
          id,
          label: stored.label,
          walletAlias: stored.walletAlias,
          available: false,
          balance: null,
          message: 'Wallet does not support invoice payments.',
        };
      }

      let balance: string | null = null;

      if (service.methods.includes('get_balance')) {
        try {
          balance = (
            await client.getBalance({ signal: AbortSignal.timeout(5_000) })
          )
            .toSatoshiFloor()
            .toString();
        } catch {
          // Balance is advisory; a reachable wallet remains usable.
        }
      }

      return {
        id,
        label: stored.label,
        walletAlias: stored.walletAlias,
        available: true,
        balance,
        message: null,
      };
    } catch (error) {
      return {
        id,
        label: stored.label,
        walletAlias: stored.walletAlias,
        available: false,
        balance: null,
        message:
          error instanceof Error ? error.message : 'Wallet is unavailable.',
      };
    }
  }

  #nwcClient(connectionUri: string): NwcClient {
    return new NwcClient({
      transport: this.#pool,
      connection: parseNwcConnectionUri(connectionUri),
      infoTimeoutMs: 5_000,
      publishTimeoutMs: 5_000,
      replyTimeoutMs: 30_000,
    });
  }

  #scheduleExpiry(pending: PendingPayment): void {
    if (pending.expiryTimer) {
      clearTimeout(pending.expiryTimer);
      pending.expiryTimer = null;
    }

    if (!pending.lightning) {
      return;
    }

    const delay = pending.effectiveExpiresAt * 1000 - Date.now();

    if (delay <= 0) {
      return;
    }

    const timerDelay = Math.min(delay, MAX_TIMER_DELAY_MS);

    pending.expiryTimer = setTimeout(() => {
      if (delay > MAX_TIMER_DELAY_MS) {
        pending.expiryTimer = null;
        this.#scheduleExpiry(pending);

        return;
      }

      const message =
        pending.presentation.request.lightning?.refreshable === false
          ? 'Invoice expired. Close this payment and submit again.'
          : 'Invoice expired. Request a fresh invoice.';

      void this.#sendStatus({
        state: 'expired',
        sourceId: null,
        code: 'INVOICE_EXPIRED',
        message,
      });
    }, timerDelay);
  }

  async #sendStatus(
    status: Omit<WebPaymentStatus, 'attemptId' | 'code' | 'fee'> & {
      code?: PaymentFailureCode | null;
      fee?: string | null;
    },
  ): Promise<void> {
    const attemptId = this.#pending?.presentation.attemptId;

    if (!attemptId || !this.#sender) {
      return;
    }

    await this.#sender(
      createPaymentStatusMessage({
        attemptId,
        code: status.code ?? null,
        fee: status.fee ?? null,
        ...status,
      }),
    );
  }

  #finish(result: InteractivePaymentResult): void {
    const pending = this.#pending;

    if (!pending) {
      return;
    }

    clearTimeout(pending.modalTimer);

    if (pending.expiryTimer) {
      clearTimeout(pending.expiryTimer);
    }

    this.#pending = null;
    pending.resolve(result);
  }
}
