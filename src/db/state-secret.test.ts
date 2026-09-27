import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';

import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { encrypt, getConversationKey } from 'nostr-tools/nip44';
import { bytesToHex } from 'nostr-tools/utils';

import type { CoreDb } from './shared';
import { STATE_ROUTSTR_SK_KEY } from './shared';
import {
  getRoutstrSkKey,
  getState,
  initSkKeyEncryption,
  setState,
} from './state';

const ROUTSTR_KEY =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

describe('Routstr secret migration', () => {
  let sqlite: Database;
  let db: CoreDb;
  let privateKey: Uint8Array;
  let publicKey: string;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.run('CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT)');
    db = sqlite as CoreDb;
    privateKey = generateSecretKey();
    publicKey = getPublicKey(privateKey);
    initSkKeyEncryption(bytesToHex(privateKey), publicKey);
  });

  afterEach(() => sqlite.close());

  test('migrates legacy plaintext into an envelope', () => {
    setState(db, STATE_ROUTSTR_SK_KEY, ROUTSTR_KEY);

    expect(getRoutstrSkKey(db)).toBe(ROUTSTR_KEY);
    const stored = getState(db, STATE_ROUTSTR_SK_KEY)!;
    expect(stored).not.toContain(ROUTSTR_KEY);
    expect(JSON.parse(stored)).toMatchObject({
      version: 1,
      algorithm: 'nip44-v2',
    });
  });

  test('migrates legacy raw NIP-44 ciphertext into an envelope', () => {
    const legacyCiphertext = encrypt(
      ROUTSTR_KEY,
      getConversationKey(privateKey, publicKey),
    );
    setState(db, STATE_ROUTSTR_SK_KEY, legacyCiphertext);

    expect(getRoutstrSkKey(db)).toBe(ROUTSTR_KEY);
    expect(getState(db, STATE_ROUTSTR_SK_KEY)).not.toBe(legacyCiphertext);
  });
});
