import { normalizeMintUrl } from '@src/wallet/mint-url';

import { Satoshi } from './amount';
import type {
  AcceptedPaymentOption,
  CashuPaymentOption,
  InteractivePaymentRequest,
  LightningPaymentOption,
  PaymentSettlement,
} from './interactive-types';
import {
  LightningInvoiceError,
  parseLightningInvoice,
  type ParsedLightningInvoice,
} from './lightning-invoice';

export class InteractivePaymentContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InteractivePaymentContractError';
  }
}

export type ValidatedInteractivePaymentRequest = {
  purpose: string;
  recipient: string | null;
  amount: Satoshi;
  options: readonly AcceptedPaymentOption[];
  lightning: LightningPaymentOption | null;
  cashu: CashuPaymentOption | null;
};

export type ValidatedLightningInvoice = {
  parsed: ParsedLightningInvoice;
  checkSettlement: () => Promise<PaymentSettlement>;
};

function assertAmount(value: unknown): asserts value is Satoshi {
  if (!(value instanceof Satoshi) || value.isZero()) {
    throw new InteractivePaymentContractError(
      'Interactive payment amounts must be positive Satoshi values.',
    );
  }
}

export function validateInteractivePaymentRequest(
  request: InteractivePaymentRequest,
): ValidatedInteractivePaymentRequest {
  if (!request || typeof request !== 'object') {
    throw new InteractivePaymentContractError(
      'Interactive payment request must be an object.',
    );
  }

  const purpose = request.purpose?.trim();
  const recipient = request.recipient?.trim() || null;

  if (!purpose || purpose.length > 500) {
    throw new InteractivePaymentContractError(
      'Interactive payment purpose must be 1-500 characters.',
    );
  }

  if (recipient && recipient.length > 500) {
    throw new InteractivePaymentContractError(
      'Interactive payment recipient must be at most 500 characters.',
    );
  }

  if (!Array.isArray(request.options) || request.options.length === 0) {
    throw new InteractivePaymentContractError(
      'Interactive payment request must include at least one option.',
    );
  }

  let lightning: LightningPaymentOption | null = null;
  let cashu: CashuPaymentOption | null = null;
  let amount: Satoshi | null = null;

  for (const option of request.options as readonly AcceptedPaymentOption[]) {
    assertAmount(option?.amount);

    if (amount && !amount.equals(option.amount)) {
      throw new InteractivePaymentContractError(
        'All payment options must use the same principal amount.',
      );
    }

    amount = option.amount;

    if (option.type === 'lightning') {
      if (lightning) {
        throw new InteractivePaymentContractError(
          'Only one Lightning payment option is allowed.',
        );
      }

      if (typeof option.createInvoice !== 'function') {
        throw new InteractivePaymentContractError(
          'Lightning payment option requires createInvoice.',
        );
      }

      lightning = option;
    } else if (option.type === 'cashu') {
      if (cashu) {
        throw new InteractivePaymentContractError(
          'Only one Cashu payment option is allowed.',
        );
      }

      if (
        !Array.isArray(option.acceptedMints) ||
        option.acceptedMints.length === 0 ||
        option.acceptedMints.some(
          (mint) => typeof mint !== 'string' || mint.trim().length === 0,
        )
      ) {
        throw new InteractivePaymentContractError(
          'Cashu payment option requires at least one accepted mint.',
        );
      }

      if (typeof option.acceptToken !== 'function') {
        throw new InteractivePaymentContractError(
          'Cashu payment option requires acceptToken.',
        );
      }

      try {
        option.acceptedMints.forEach(normalizeMintUrl);
      } catch {
        throw new InteractivePaymentContractError(
          'Cashu payment option contains an invalid mint URL.',
        );
      }

      cashu = option;
    } else {
      throw new InteractivePaymentContractError(
        'Unsupported interactive payment rail.',
      );
    }
  }

  return {
    purpose,
    recipient,
    amount: amount!,
    options: [...request.options],
    lightning,
    cashu,
  };
}

export async function createValidatedLightningInvoice(
  option: LightningPaymentOption,
): Promise<ValidatedLightningInvoice> {
  let created: Awaited<ReturnType<LightningPaymentOption['createInvoice']>>;

  try {
    created = await option.createInvoice();
  } catch (error) {
    throw new InteractivePaymentContractError(
      `Lightning invoice creation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    !created ||
    typeof created.invoice !== 'string' ||
    typeof created.checkSettlement !== 'function'
  ) {
    throw new InteractivePaymentContractError(
      'Lightning invoice callback returned an invalid result.',
    );
  }

  let parsed: ParsedLightningInvoice;

  try {
    parsed = parseLightningInvoice(created.invoice);
  } catch (error) {
    if (error instanceof LightningInvoiceError) {
      throw new InteractivePaymentContractError(error.message);
    }

    throw error;
  }

  if (!parsed.amount) {
    throw new InteractivePaymentContractError(
      'Amountless BOLT-11 invoices are not supported.',
    );
  }

  if (!parsed.amount.equals(option.amount.toMillisatoshi())) {
    throw new InteractivePaymentContractError(
      'BOLT-11 invoice amount does not match the declared principal.',
    );
  }

  return {
    parsed,
    checkSettlement: () => created.checkSettlement(),
  };
}
