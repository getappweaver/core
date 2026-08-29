import { afterEach, describe, expect, test } from 'bun:test';

import { createSetupSecret } from './secret';

const originalMasterPubkey = process.env.BOT_MASTER_PUBKEY;
const originalSetupSecret = process.env.SETUP_SECRET;

afterEach(() => {
  if (originalMasterPubkey === undefined) {
    delete process.env.BOT_MASTER_PUBKEY;
  } else {
    process.env.BOT_MASTER_PUBKEY = originalMasterPubkey;
  }

  if (originalSetupSecret === undefined) {
    delete process.env.SETUP_SECRET;
  } else {
    process.env.SETUP_SECRET = originalSetupSecret;
  }
});

describe('createSetupSecret', () => {
  test('does not create a secret when Nostr setup auth is configured', () => {
    process.env.BOT_MASTER_PUBKEY = 'a'.repeat(64);
    process.env.SETUP_SECRET = 'ignored';

    expect(createSetupSecret()).toBe('');
  });

  test('uses an explicit setup secret without a master pubkey', () => {
    delete process.env.BOT_MASTER_PUBKEY;
    process.env.SETUP_SECRET = 'configured-secret';

    expect(createSetupSecret()).toBe('configured-secret');
  });

  test('generates a secret without either configured authentication option', () => {
    delete process.env.BOT_MASTER_PUBKEY;
    delete process.env.SETUP_SECRET;

    expect(createSetupSecret()).toHaveLength(43);
  });
});
