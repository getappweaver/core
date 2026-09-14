import type { Satoshi } from './amount';

export type PaymentRail = 'lightning' | 'cashu';

export type PaymentSettlement =
  | { status: 'settled' }
  | { status: 'pending' }
  | { status: 'failed'; message: string };

export type CashuTokenAcceptance =
  | { status: 'accepted' }
  | { status: 'rejected'; message: string }
  | { status: 'unknown'; message: string };

export type LightningPaymentOption = {
  type: 'lightning';
  amount: Satoshi;
  /** Invoice was issued for this request; use its encoded lifetime if local time is skewed. */
  freshlyCreated?: boolean;
  /** Whether repeated createInvoice calls produce a genuinely new invoice. */
  refreshable?: boolean;
  createInvoice(): Promise<{
    invoice: string;
    checkSettlement(): Promise<PaymentSettlement>;
  }>;
};

export type CashuPaymentOption = {
  type: 'cashu';
  amount: Satoshi;
  acceptedMints: readonly [string, ...string[]];
  acceptToken(input: {
    attemptId: string;
    token: string;
  }): Promise<CashuTokenAcceptance>;
};

export type AcceptedPaymentOption = LightningPaymentOption | CashuPaymentOption;

export type InteractivePaymentRequest = {
  purpose: string;
  recipient?: string;
  options: readonly AcceptedPaymentOption[];
};

export type PaymentApp = {
  pluginName: string;
  pluginAlias: string;
  title: string;
  iconUrl: string | null;
  /** Core-owned source restriction; plugin callers cannot supply app metadata. */
  sourcePolicy?: 'all' | 'nwc-only';
};

export type PaymentUnsupportedCode =
  | 'INTERACTIVE_TRANSPORT_UNAVAILABLE'
  | 'PAYMENT_UI_UNAVAILABLE'
  | 'LIGHTNING_UNAVAILABLE'
  | 'CASHU_UNAVAILABLE'
  | 'MINT_MISMATCH';

export type PaymentUnsupportedReason = {
  code: PaymentUnsupportedCode;
  message: string;
};

export type PaymentFailureCode =
  | 'PAYMENT_BUSY'
  | 'INVOICE_CREATION_FAILED'
  | 'INVALID_INVOICE'
  | 'INVOICE_EXPIRED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INSUFFICIENT_BALANCE'
  | 'QUOTA_EXCEEDED'
  | 'UNAUTHORIZED'
  | 'PAYMENT_TIMEOUT'
  | 'PAYMENT_FAILED'
  | 'SETTLEMENT_FAILED'
  | 'TOKEN_DELIVERY_FAILED';

export type PaymentFailure = {
  code: PaymentFailureCode;
  message: string;
};

export type LightningPaymentReceipt = {
  type: 'lightning';
  attemptId: string;
  amount: Satoshi;
  paymentHash: string;
  source: 'webln' | 'nwc' | 'other';
  sourceId: string | null;
};

export type CashuPaymentReceipt = {
  type: 'cashu';
  attemptId: string;
  amount: Satoshi;
  mintUrl: string;
};

export type PaymentReceipt = LightningPaymentReceipt | CashuPaymentReceipt;

export type InteractivePaymentResult =
  | { status: 'success'; receipt: PaymentReceipt }
  | { status: 'rejected'; reason: 'user-rejected' | 'modal-closed' }
  | { status: 'unsupported'; reasons: PaymentUnsupportedReason[] }
  | { status: 'failed'; error: PaymentFailure };

export type InteractivePaymentService = {
  requestPayment(
    request: InteractivePaymentRequest,
  ): Promise<InteractivePaymentResult>;
};

export type InteractivePaymentServiceFactory = (
  app: PaymentApp,
) => InteractivePaymentService;
