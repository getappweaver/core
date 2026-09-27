import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import { hexToBytes } from 'nostr-tools/utils';
import { z } from 'zod';

export const EncryptedSecretEnvelopeSchema = z.strictObject({
  version: z.literal(1),
  algorithm: z.literal('nip44-v2'),
  ciphertext: z.string().min(1),
});

export type EncryptedSecretEnvelope = z.infer<
  typeof EncryptedSecretEnvelopeSchema
>;

let conversationKey: Uint8Array | null = null;

export class EncryptedSecretError extends Error {
  readonly code:
    | 'SECRET_ENCRYPTION_NOT_INITIALIZED'
    | 'SECRET_ENVELOPE_INVALID'
    | 'SECRET_ENCRYPTION_FAILED'
    | 'SECRET_DECRYPTION_FAILED';

  constructor(
    code: EncryptedSecretError['code'],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'EncryptedSecretError';
    this.code = code;
  }
}

export function initSecretEncryption(
  privateKeyHex: string,
  publicKeyHex: string,
): void {
  conversationKey = getConversationKey(hexToBytes(privateKeyHex), publicKeyHex);
}

function requireConversationKey(): Uint8Array {
  if (!conversationKey) {
    throw new EncryptedSecretError(
      'SECRET_ENCRYPTION_NOT_INITIALIZED',
      'Secret encryption is not initialized.',
    );
  }

  return conversationKey;
}

export function encryptSecret(value: string): EncryptedSecretEnvelope {
  try {
    return {
      version: 1,
      algorithm: 'nip44-v2',
      ciphertext: encrypt(value, requireConversationKey()),
    };
  } catch (error) {
    if (error instanceof EncryptedSecretError) {
      throw error;
    }

    throw new EncryptedSecretError(
      'SECRET_ENCRYPTION_FAILED',
      'Could not encrypt stored secret.',
      error,
    );
  }
}

export function decryptSecret(envelope: unknown): string {
  const parsed = EncryptedSecretEnvelopeSchema.safeParse(envelope);

  if (!parsed.success) {
    throw new EncryptedSecretError(
      'SECRET_ENVELOPE_INVALID',
      'Stored secret envelope is invalid.',
    );
  }

  try {
    return decrypt(parsed.data.ciphertext, requireConversationKey());
  } catch (error) {
    if (error instanceof EncryptedSecretError) {
      throw error;
    }

    throw new EncryptedSecretError(
      'SECRET_DECRYPTION_FAILED',
      'Could not decrypt stored secret.',
      error,
    );
  }
}

/** Reads the pre-envelope NIP-44 format only for one-time migrations. */
export function decryptLegacySecretCiphertext(ciphertext: string): string {
  try {
    return decrypt(ciphertext, requireConversationKey());
  } catch (error) {
    if (error instanceof EncryptedSecretError) {
      throw error;
    }

    throw new EncryptedSecretError(
      'SECRET_DECRYPTION_FAILED',
      'Could not decrypt legacy stored secret.',
      error,
    );
  }
}
