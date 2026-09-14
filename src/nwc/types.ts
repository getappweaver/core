export const NWC_SUPPORTED_METHODS = [
  'get_info',
  'get_balance',
  'pay_invoice',
  'lookup_invoice',
] as const;

export type NwcSupportedMethod = (typeof NWC_SUPPORTED_METHODS)[number];
export type NwcEncryption = 'nip44_v2';

/** Contains the bearer secret and must never be logged or sent to the browser. */
export type NwcConnection = {
  readonly walletPubkey: string;
  readonly relayUrls: readonly string[];
  readonly secret: string;
  readonly lud16: string | null;
};

export type SafeNwcConnection = Omit<NwcConnection, 'secret'>;

export type NwcWalletServiceInfo = {
  walletPubkey: string;
  methods: string[];
  encryptions: string[];
  extensions: string[];
};

export type NwcGetInfoResult = {
  alias: string;
  color: string;
  pubkey: string;
  network: string;
  block_height: number;
  block_hash: string;
  methods: string[];
  extensions?: string[];
};

export type NwcGetBalanceResult = {
  balance: number;
};

export type NwcPayInvoiceResult = {
  preimage: string;
  fees_paid?: number;
};

export type NwcTransactionState =
  'pending' | 'settled' | 'accepted' | 'expired' | 'failed';

export type NwcTransaction = {
  type: 'incoming' | 'outgoing';
  state?: NwcTransactionState;
  invoice?: string;
  description?: string;
  description_hash?: string;
  preimage?: string;
  payment_hash: string;
  amount: number;
  fees_paid?: number;
  created_at: number;
  expires_at?: number;
  settled_at?: number;
  metadata?: Record<string, unknown>;
};

export type NwcWalletInfo = Omit<NwcGetInfoResult, 'block_height'> & {
  blockHeight: number;
};

export type NwcPaymentResult = {
  preimage: string;
  feesPaid: import('@src/payments/types').Millisatoshi | null;
};

export type NwcInvoiceLookupResult = Omit<
  NwcTransaction,
  'amount' | 'fees_paid'
> & {
  amount: import('@src/payments/types').Millisatoshi;
  feesPaid: import('@src/payments/types').Millisatoshi | null;
};

export type NwcRequestPayload =
  | { method: 'get_info'; params: Record<string, never> }
  | { method: 'get_balance'; params: Record<string, never> }
  | {
      method: 'pay_invoice';
      params: {
        invoice: string;
        amount?: number;
        metadata?: Record<string, unknown>;
      };
    }
  | {
      method: 'lookup_invoice';
      params: { invoice?: string; payment_hash?: string };
    };

export type NwcWalletResponseError = {
  code: string;
  message: string;
};

export type NwcSuccessResponse =
  | {
      result_type: 'get_info';
      result: NwcGetInfoResult;
      error: null;
    }
  | {
      result_type: 'get_balance';
      result: NwcGetBalanceResult;
      error: null;
    }
  | {
      result_type: 'pay_invoice';
      result: NwcPayInvoiceResult;
      error: null;
    }
  | {
      result_type: 'lookup_invoice';
      result: NwcTransaction;
      error: null;
    };

export type NwcFailureResponse = {
  result_type: NwcSupportedMethod;
  result: null;
  error: NwcWalletResponseError;
};

export type NwcResponsePayload = NwcSuccessResponse | NwcFailureResponse;
