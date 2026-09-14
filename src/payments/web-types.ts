import type {
  PaymentFailureCode,
  PaymentUnsupportedReason,
} from './interactive-types';
import type { LightningNetwork } from './lightning-invoice';

export type WebPaymentNwcSource = {
  id: string;
  label: string;
  walletAlias: string | null;
  available: boolean;
  balance: string | null;
  message: string | null;
};

export type WebPaymentCashuSource = {
  mintUrl: string;
  balance: string;
};

export type WebPaymentRequest = {
  attemptId: string;
  app: {
    pluginAlias: string;
    title: string;
    iconUrl: string | null;
  };
  purpose: string;
  recipient: string | null;
  amount: string;
  lightning: {
    invoice: string;
    paymentHash: string;
    network: LightningNetwork;
    expiresAt: number;
    refreshable: boolean;
  } | null;
  nwc: WebPaymentNwcSource[];
  cashu: WebPaymentCashuSource[];
  cashuAccepted: boolean;
  weblnAllowed: boolean;
  otherAllowed: boolean;
  unsupported: PaymentUnsupportedReason[];
};

export type WebPaymentStatus = {
  attemptId: string;
  state:
    | 'ready'
    | 'paying'
    | 'settling'
    | 'failed'
    | 'expired'
    | 'success'
    | 'rejected';
  sourceId: string | null;
  message: string;
  code: PaymentFailureCode | null;
  fee: string | null;
};

export type WebPaymentAction =
  | 'reject'
  | 'close'
  | 'refresh_invoice'
  | 'pay_nwc'
  | 'webln_result'
  | 'check_settlement';
