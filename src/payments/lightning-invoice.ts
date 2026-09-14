import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { Millisatoshi } from './amount';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const PAYMENT_HASH_TAG = 1;
const EXPIRY_TAG = 6;
const SIGNATURE_WORDS = 104;
const TIMESTAMP_WORDS = 7;
const DEFAULT_EXPIRY_SECONDS = 3600;
const MAX_INVOICE_LENGTH = 5_000;

export type LightningNetwork = 'mainnet' | 'testnet' | 'regtest' | 'signet';

export type ParsedLightningInvoice = {
  invoice: string;
  network: LightningNetwork;
  amount: Millisatoshi | null;
  paymentHash: string;
  createdAt: number;
  expiresAt: number;
};

export class LightningInvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LightningInvoiceError';
  }
}

function bech32Polymod(values: readonly number[]): number {
  const generators = [
    0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
  ];

  let checksum = 1;

  for (const value of values) {
    const top = checksum >>> 25;

    checksum = ((checksum & 0x1ffffff) << 5) ^ value;

    for (let index = 0; index < generators.length; index += 1) {
      if ((top >>> index) & 1) {
        checksum ^= generators[index]!;
      }
    }
  }

  return checksum >>> 0;
}

function expandHrp(hrp: string): number[] {
  return [
    ...[...hrp].map((character) => character.charCodeAt(0) >>> 5),
    0,
    ...[...hrp].map((character) => character.charCodeAt(0) & 31),
  ];
}

function decodeBech32(invoice: string): { hrp: string; words: number[] } {
  if (
    invoice.length === 0 ||
    invoice.length > MAX_INVOICE_LENGTH ||
    (invoice !== invoice.toLowerCase() && invoice !== invoice.toUpperCase())
  ) {
    throw new LightningInvoiceError('Invalid BOLT-11 invoice encoding.');
  }

  const normalized = invoice.toLowerCase();
  const separator = normalized.lastIndexOf('1');

  if (separator < 1 || separator + 7 > normalized.length) {
    throw new LightningInvoiceError('Invalid BOLT-11 invoice separator.');
  }

  const hrp = normalized.slice(0, separator);

  const words = [...normalized.slice(separator + 1)].map((character) =>
    BECH32_CHARSET.indexOf(character),
  );

  if (words.some((word) => word < 0)) {
    throw new LightningInvoiceError('Invalid BOLT-11 invoice characters.');
  }

  if (bech32Polymod([...expandHrp(hrp), ...words]) !== 1) {
    throw new LightningInvoiceError('Invalid BOLT-11 invoice checksum.');
  }

  return { hrp, words: words.slice(0, -6) };
}

function wordsToBigInt(words: readonly number[]): bigint {
  return words.reduce((value, word) => (value << 5n) | BigInt(word), 0n);
}

function convertWordsToBytes(words: readonly number[]): Uint8Array {
  let accumulator = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const word of words) {
    accumulator = ((accumulator << 5) | word) & 0xfff;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 0xff);
    }
  }

  if (bits >= 5 || ((accumulator << (8 - bits)) & 0xff) !== 0) {
    throw new LightningInvoiceError('Invalid BOLT-11 tagged field padding.');
  }

  return new Uint8Array(bytes);
}

function parseHrp(hrp: string): {
  network: LightningNetwork;
  amount: Millisatoshi | null;
} {
  const match = /^ln(bcrt|bc|tb|sb)(?:(\d+)([munp]?))?$/.exec(hrp);

  if (!match) {
    throw new LightningInvoiceError('Unsupported BOLT-11 invoice network.');
  }

  const networkCode = match[1]!;
  const amountDigits = match[2];
  const multiplier = match[3]!;

  const network: LightningNetwork =
    networkCode === 'bc'
      ? 'mainnet'
      : networkCode === 'tb'
        ? 'testnet'
        : networkCode === 'bcrt'
          ? 'regtest'
          : 'signet';

  if (!amountDigits) {
    return { network, amount: null };
  }

  const value = BigInt(amountDigits);
  let millisatoshis: bigint;

  switch (multiplier) {
    case 'm':
      millisatoshis = value * 100_000_000n;
      break;
    case 'u':
      millisatoshis = value * 100_000n;
      break;
    case 'n':
      millisatoshis = value * 100n;
      break;
    case 'p':
      if (value % 10n !== 0n) {
        throw new LightningInvoiceError(
          'BOLT-11 amount is below millisatoshi precision.',
        );
      }

      millisatoshis = value / 10n;
      break;
    default:
      millisatoshis = value * 100_000_000_000n;
  }

  return { network, amount: Millisatoshi.parse(millisatoshis) };
}

export function parseLightningInvoice(invoice: string): ParsedLightningInvoice {
  const normalized = invoice.trim();
  const { hrp, words } = decodeBech32(normalized);
  const { network, amount } = parseHrp(hrp);

  if (words.length < TIMESTAMP_WORDS + SIGNATURE_WORDS) {
    throw new LightningInvoiceError('BOLT-11 invoice data is truncated.');
  }

  const createdAtBigInt = wordsToBigInt(words.slice(0, TIMESTAMP_WORDS));
  const taggedWords = words.slice(TIMESTAMP_WORDS, -SIGNATURE_WORDS);
  let paymentHash: string | null = null;
  let expirySeconds = DEFAULT_EXPIRY_SECONDS;
  let offset = 0;

  while (offset < taggedWords.length) {
    if (offset + 3 > taggedWords.length) {
      throw new LightningInvoiceError('BOLT-11 tagged field is truncated.');
    }

    const tag = taggedWords[offset]!;
    const length = (taggedWords[offset + 1]! << 5) | taggedWords[offset + 2]!;
    const start = offset + 3;
    const end = start + length;

    if (end > taggedWords.length) {
      throw new LightningInvoiceError('BOLT-11 tagged field is truncated.');
    }

    const data = taggedWords.slice(start, end);

    if (tag === PAYMENT_HASH_TAG) {
      const bytes = convertWordsToBytes(data);

      if (bytes.length !== 32 || paymentHash !== null) {
        throw new LightningInvoiceError(
          'BOLT-11 invoice has an invalid payment hash.',
        );
      }

      paymentHash = bytesToHex(bytes);
    } else if (tag === EXPIRY_TAG) {
      const parsedExpiry = wordsToBigInt(data);

      if (parsedExpiry > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new LightningInvoiceError('BOLT-11 expiry is too large.');
      }

      expirySeconds = Number(parsedExpiry);
    }

    offset = end;
  }

  if (!paymentHash) {
    throw new LightningInvoiceError(
      'BOLT-11 invoice is missing its payment hash.',
    );
  }

  const createdAt = Number(createdAtBigInt);

  return {
    invoice: normalized,
    network,
    amount,
    paymentHash,
    createdAt,
    expiresAt: createdAt + expirySeconds,
  };
}

export function verifyLightningPreimage(
  preimageHex: string,
  paymentHash: string,
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(preimageHex)) {
    return false;
  }

  return (
    bytesToHex(sha256(hexToBytes(preimageHex))) === paymentHash.toLowerCase()
  );
}
