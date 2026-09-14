import { z } from 'zod';

import { NWC_SUPPORTED_METHODS } from './types';

const HEX_32_BYTES_PATTERN = /^[0-9a-fA-F]{64}$/;
const HEX_64_BYTES_PATTERN = /^[0-9a-fA-F]{128}$/;

const SAFE_NON_NEGATIVE_INTEGER = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const UNIX_TIMESTAMP = SAFE_NON_NEGATIVE_INTEGER;
const EMPTY_PARAMS = z.object({}).strict();
const METADATA = z.record(z.string(), z.unknown());

export const NwcSupportedMethodSchema = z.enum(NWC_SUPPORTED_METHODS);

export const NwcWalletInfoEventSchema = z.object({
  id: z.string().regex(HEX_32_BYTES_PATTERN),
  pubkey: z.string().regex(HEX_32_BYTES_PATTERN),
  created_at: UNIX_TIMESTAMP,
  kind: z.literal(13194),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string().regex(HEX_64_BYTES_PATTERN),
});

export const NwcGetInfoResultSchema = z.object({
  alias: z.string(),
  color: z.string(),
  pubkey: z.string(),
  network: z.string(),
  block_height: SAFE_NON_NEGATIVE_INTEGER,
  block_hash: z.string(),
  methods: z.array(z.string()),
  extensions: z.array(z.string()).optional(),
});

export const NwcGetBalanceResultSchema = z.object({
  balance: SAFE_NON_NEGATIVE_INTEGER,
});

export const NwcPayInvoiceResultSchema = z.object({
  preimage: z.string().regex(HEX_32_BYTES_PATTERN),
  fees_paid: SAFE_NON_NEGATIVE_INTEGER.optional(),
});

export const NwcTransactionSchema = z.object({
  type: z.enum(['incoming', 'outgoing']),
  state: z
    .enum(['pending', 'settled', 'accepted', 'expired', 'failed'])
    .optional(),
  invoice: z.string().min(1).optional(),
  description: z.string().optional(),
  description_hash: z.string().optional(),
  preimage: z.string().optional(),
  payment_hash: z.string().regex(HEX_32_BYTES_PATTERN),
  amount: SAFE_NON_NEGATIVE_INTEGER,
  fees_paid: SAFE_NON_NEGATIVE_INTEGER.optional(),
  created_at: UNIX_TIMESTAMP,
  expires_at: UNIX_TIMESTAMP.optional(),
  settled_at: UNIX_TIMESTAMP.optional(),
  metadata: METADATA.optional(),
});

export const NwcRequestPayloadSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('get_info'), params: EMPTY_PARAMS }),
  z.object({ method: z.literal('get_balance'), params: EMPTY_PARAMS }),
  z.object({
    method: z.literal('pay_invoice'),
    params: z.object({
      invoice: z.string().min(1),
      amount: SAFE_NON_NEGATIVE_INTEGER.optional(),
      metadata: METADATA.optional(),
    }),
  }),
  z.object({
    method: z.literal('lookup_invoice'),
    params: z
      .object({
        invoice: z.string().min(1).optional(),
        payment_hash: z.string().regex(HEX_32_BYTES_PATTERN).optional(),
      })
      .refine((value) => Boolean(value.invoice || value.payment_hash), {
        message: 'lookup_invoice requires invoice or payment_hash.',
      }),
  }),
]);

const NwcWalletResponseErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
});

// Deployed wallets may omit the inactive envelope field instead of sending null.
const NwcSuccessErrorSchema = z.null().optional().default(null);
const NwcFailureResultSchema = z.null().optional().default(null);

const NwcSuccessResponseSchema = z.discriminatedUnion('result_type', [
  z.object({
    result_type: z.literal('get_info'),
    result: NwcGetInfoResultSchema,
    error: NwcSuccessErrorSchema,
  }),
  z.object({
    result_type: z.literal('get_balance'),
    result: NwcGetBalanceResultSchema,
    error: NwcSuccessErrorSchema,
  }),
  z.object({
    result_type: z.literal('pay_invoice'),
    result: NwcPayInvoiceResultSchema,
    error: NwcSuccessErrorSchema,
  }),
  z.object({
    result_type: z.literal('lookup_invoice'),
    result: NwcTransactionSchema,
    error: NwcSuccessErrorSchema,
  }),
]);

const NwcFailureResponseSchema = z.object({
  result_type: NwcSupportedMethodSchema,
  result: NwcFailureResultSchema,
  error: NwcWalletResponseErrorSchema,
});

export const NwcResponsePayloadSchema = z.union([
  NwcSuccessResponseSchema,
  NwcFailureResponseSchema,
]);

export type NwcRequestPayloadInput = z.input<typeof NwcRequestPayloadSchema>;
export type NwcResponsePayloadOutput = z.output<
  typeof NwcResponsePayloadSchema
>;
