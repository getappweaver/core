import { describe, expect, test } from 'bun:test';

import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';

import {
  decryptSecret,
  encryptSecret,
  EncryptedSecretError,
  initSecretEncryption,
} from './encrypted-secret';

function initializeWithNewIdentity(): void {
  const privateKey = generateSecretKey();
  initSecretEncryption(bytesToHex(privateKey), getPublicKey(privateKey));
}

describe('encrypted secret envelopes', () => {
  test('round trips without exposing plaintext in the envelope', () => {
    initializeWithNewIdentity();
    const secret = 'nostr+walletconnect://secret-value';
    const envelope = encryptSecret(secret);

    expect(envelope).toMatchObject({ version: 1, algorithm: 'nip44-v2' });
    expect(JSON.stringify(envelope)).not.toContain(secret);
    expect(decryptSecret(envelope)).toBe(secret);
  });

  test('rejects malformed envelopes with a redacted error', () => {
    initializeWithNewIdentity();

    expect(() => decryptSecret({ version: 1, ciphertext: 'private' })).toThrow(
      new EncryptedSecretError(
        'SECRET_ENVELOPE_INVALID',
        'Stored secret envelope is invalid.',
      ),
    );
  });

  test('fails explicitly when a different identity decrypts the envelope', () => {
    initializeWithNewIdentity();
    const envelope = encryptSecret('do-not-disclose');
    initializeWithNewIdentity();

    try {
      decryptSecret(envelope);
      throw new Error('Expected decryption to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(EncryptedSecretError);
      expect((error as EncryptedSecretError).code).toBe(
        'SECRET_DECRYPTION_FAILED',
      );
      expect(String(error)).not.toContain('do-not-disclose');
    }
  });
});
