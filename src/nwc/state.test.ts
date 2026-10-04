import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';

import { getState, setState, STATE_NWC_CONNECTIONS } from '@src/db';
import type { CoreDb } from '@src/db/shared';
import {
  EncryptedSecretError,
  initSecretEncryption,
} from '@src/security/encrypted-secret';

import { addNwcConnection, getStoredNwcConnection } from './state';

const CONNECTION_URI =
  'nostr+walletconnect://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef?relay=wss%3A%2F%2Frelay.example.com&secret=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

function initializeWithNewIdentity(): void {
  const privateKey = generateSecretKey();
  initSecretEncryption(bytesToHex(privateKey), getPublicKey(privateKey));
}

describe('NWC encrypted state', () => {
  let sqlite: Database;
  let db: CoreDb;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.run('CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT)');
    db = sqlite as CoreDb;
    initializeWithNewIdentity();
  });

  afterEach(() => sqlite.close());

  test('persists newly added connection URIs only as ciphertext', () => {
    const connection = addNwcConnection({
      db,
      label: 'Primary',
      connectionUri: CONNECTION_URI,
    });

    const raw = getState(db, STATE_NWC_CONNECTIONS)!;

    expect(raw).not.toContain(CONNECTION_URI);
    expect(raw).not.toContain('abcdef0123456789');

    expect(JSON.parse(raw)).toMatchObject({
      version: 2,
      connections: [
        {
          id: connection.id,
          connectionUriCiphertext: {
            version: 1,
            algorithm: 'nip44-v2',
          },
        },
      ],
    });

    expect(getStoredNwcConnection(db, connection.id)?.connectionUri).toBe(
      CONNECTION_URI,
    );
  });

  test('decrypts persisted state after encryption is reinitialized', () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    initSecretEncryption(bytesToHex(privateKey), publicKey);

    const connection = addNwcConnection({
      db,
      label: 'Primary',
      connectionUri: CONNECTION_URI,
    });

    initSecretEncryption(bytesToHex(privateKey), publicKey);

    expect(getStoredNwcConnection(db, connection.id)?.connectionUri).toBe(
      CONNECTION_URI,
    );
  });

  test('migrates version 1 plaintext state atomically on read', () => {
    setState(
      db,
      STATE_NWC_CONNECTIONS,
      JSON.stringify({
        version: 1,
        revision: 3,
        connections: [
          {
            id: '31bcd2f3-92db-428d-9b93-86b389ec21a5',
            label: 'Legacy',
            connectionUri: CONNECTION_URI,
            createdAt: 1,
            updatedAt: 1,
            verifiedAt: null,
            walletAlias: null,
            methods: [],
          },
        ],
      }),
    );

    expect(
      getStoredNwcConnection(db, '31bcd2f3-92db-428d-9b93-86b389ec21a5')
        ?.connectionUri,
    ).toBe(CONNECTION_URI);

    const migrated = getState(db, STATE_NWC_CONNECTIONS)!;
    expect(migrated).not.toContain(CONNECTION_URI);
    expect(JSON.parse(migrated)).toMatchObject({ version: 2, revision: 4 });
  });

  test('does not rewrite invalid legacy state', () => {
    const invalid = JSON.stringify({
      version: 1,
      revision: 0,
      connections: [
        {
          id: '31bcd2f3-92db-428d-9b93-86b389ec21a5',
          label: 'Broken',
          connectionUri: 'secret plaintext',
          createdAt: 1,
          updatedAt: 1,
          verifiedAt: null,
          walletAlias: null,
          methods: [],
        },
      ],
    });

    setState(db, STATE_NWC_CONNECTIONS, invalid);

    expect(() =>
      getStoredNwcConnection(db, '31bcd2f3-92db-428d-9b93-86b389ec21a5'),
    ).toThrow('Stored NWC connection state is invalid.');

    expect(getState(db, STATE_NWC_CONNECTIONS)).toBe(invalid);
  });

  test('fails with a redacted error after an identity change', () => {
    const connection = addNwcConnection({
      db,
      label: 'Primary',
      connectionUri: CONNECTION_URI,
    });

    initializeWithNewIdentity();

    try {
      getStoredNwcConnection(db, connection.id);
      throw new Error('Expected decryption to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(EncryptedSecretError);
      expect(String(error)).not.toContain(CONNECTION_URI);
      expect(String(error)).not.toContain('abcdef0123456789');
    }
  });

  test('rejects malformed ciphertext without exposing stored data', () => {
    const connection = addNwcConnection({
      db,
      label: 'Primary',
      connectionUri: CONNECTION_URI,
    });

    const state = JSON.parse(getState(db, STATE_NWC_CONNECTIONS)!) as {
      connections: Array<{
        connectionUriCiphertext: { ciphertext: string };
      }>;
    };

    state.connections[0]!.connectionUriCiphertext.ciphertext = 'malformed';
    setState(db, STATE_NWC_CONNECTIONS, JSON.stringify(state));

    expect(() => getStoredNwcConnection(db, connection.id)).toThrow(
      'Could not decrypt stored secret.',
    );
  });
});
