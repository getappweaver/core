import { randomUUID } from 'node:crypto';

import type { CoreDb } from '@src/db';
import { listNwcConnections, type NwcConnectionSummary } from '@src/nwc/state';
import { getCashuMints, type WalletDb } from '@src/wallet/db';

import { Satoshi } from './amount';
import type {
  InteractivePaymentRequest,
  InteractivePaymentResult,
  InteractivePaymentService,
  InteractivePaymentServiceFactory,
  PaymentApp,
} from './interactive-types';
import {
  validateInteractivePaymentRequest,
  type ValidatedInteractivePaymentRequest,
} from './validation';

export type InteractivePaymentSourceSnapshot = {
  browser: { discovery: 'client-at-presentation' };
  nwc: NwcConnectionSummary[];
  cashu: Array<{ mintUrl: string; balance: Satoshi }>;
};

export type InteractivePaymentPresentation = {
  attemptId: string;
  app: PaymentApp;
  request: ValidatedInteractivePaymentRequest;
  sources: InteractivePaymentSourceSnapshot;
};

export type InteractivePaymentPresenter = (
  presentation: InteractivePaymentPresentation,
) => Promise<InteractivePaymentResult>;

type InteractivePaymentBrokerOptions = {
  coreDb: CoreDb;
  walletDb: WalletDb | null;
  presenter?: InteractivePaymentPresenter;
};

export class InteractivePaymentBroker {
  readonly #coreDb: CoreDb;
  readonly #walletDb: WalletDb | null;
  readonly #presenter: InteractivePaymentPresenter | null;
  readonly #activeScopes = new Set<string>();

  constructor(options: InteractivePaymentBrokerOptions) {
    this.#coreDb = options.coreDb;
    this.#walletDb = options.walletDb;
    this.#presenter = options.presenter ?? null;
  }

  createService(params: {
    scopeId: string;
    app: PaymentApp;
  }): InteractivePaymentService {
    return {
      requestPayment: (request) =>
        this.#requestPayment(params.scopeId, params.app, request),
    };
  }

  async #requestPayment(
    scopeId: string,
    app: PaymentApp,
    request: InteractivePaymentRequest,
  ): Promise<InteractivePaymentResult> {
    const validated = validateInteractivePaymentRequest(request);

    if (!this.#presenter) {
      return {
        status: 'unsupported',
        reasons: [
          {
            code: 'PAYMENT_UI_UNAVAILABLE',
            message: 'Interactive payment UI is not available yet.',
          },
        ],
      };
    }

    if (this.#activeScopes.has(scopeId)) {
      return {
        status: 'failed',
        error: {
          code: 'PAYMENT_BUSY',
          message: 'Another interactive payment is already active.',
        },
      };
    }

    this.#activeScopes.add(scopeId);

    try {
      return await this.#presenter({
        attemptId: randomUUID(),
        app,
        request: validated,
        sources: this.#discoverSources(),
      });
    } catch {
      return {
        status: 'failed',
        error: {
          code: 'PAYMENT_FAILED',
          message: 'The interactive payment flow failed.',
        },
      };
    } finally {
      this.#activeScopes.delete(scopeId);
    }
  }

  #discoverSources(): InteractivePaymentSourceSnapshot {
    return {
      browser: { discovery: 'client-at-presentation' },
      nwc: listNwcConnections(this.#coreDb),
      cashu: this.#walletDb
        ? getCashuMints(this.#walletDb).map((mint) => ({
            mintUrl: mint.mint,
            balance: Satoshi.parse(String(mint.total_amount)),
          }))
        : [],
    };
  }
}

export function createUnsupportedInteractivePaymentService(): InteractivePaymentService {
  return {
    requestPayment: async (request) => {
      validateInteractivePaymentRequest(request);

      return {
        status: 'unsupported',
        reasons: [
          {
            code: 'INTERACTIVE_TRANSPORT_UNAVAILABLE',
            message: 'This transport does not support interactive payments.',
          },
        ],
      };
    },
  };
}

export function createBrokerPaymentServiceFactory(params: {
  broker: InteractivePaymentBroker;
  scopeId: string;
}): InteractivePaymentServiceFactory {
  return (app) => params.broker.createService({ scopeId: params.scopeId, app });
}
