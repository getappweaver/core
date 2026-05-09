import { join } from 'path';

import { nip19 } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import { parseRelayUrls } from '@src/env';
import { setEnvInFile } from '@src/env-file';

type SetMasterPubkeyProps = {
  dmBotRoot: string;
  rawPubkey: string;
};

type SetMasterPubkeyResult = {
  masterPubkey: string;
};

type GenerateBotKeyProps = {
  dmBotRoot: string;
};

type GenerateBotKeyResult = {
  botPubkey: string;
};

type SetRelaysProps = {
  dmBotRoot: string;
  rawRelays: string[];
};

type SetRelaysResult = {
  relays: string[];
};

function normalizeMasterPubkey(raw: string): string {
  const value = raw.trim();

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return value.toLowerCase();
  }

  if (value.startsWith('npub1')) {
    const decoded = nip19.decode(value);

    if (decoded.type === 'npub' && typeof decoded.data === 'string') {
      return decoded.data.toLowerCase();
    }
  }

  throw new Error('invalid_master_pubkey');
}

export function setSetupMasterPubkey({
  dmBotRoot,
  rawPubkey,
}: SetMasterPubkeyProps): SetMasterPubkeyResult {
  const masterPubkey = normalizeMasterPubkey(rawPubkey);

  setEnvInFile(join(dmBotRoot, '.env'), 'BOT_MASTER_PUBKEY', masterPubkey);
  process.env.BOT_MASTER_PUBKEY = masterPubkey;

  return { masterPubkey };
}

export function generateSetupBotKey({
  dmBotRoot,
}: GenerateBotKeyProps): GenerateBotKeyResult {
  const secretKey = generateSecretKey();
  const botKeyHex = Buffer.from(secretKey).toString('hex');
  const botPubkey = getPublicKey(secretKey);
  const envPath = join(dmBotRoot, '.env');

  setEnvInFile(envPath, 'BOT_KEY', botKeyHex);
  setEnvInFile(envPath, 'BOT_PUBKEY', botPubkey);
  process.env.BOT_KEY = botKeyHex;
  process.env.BOT_PUBKEY = botPubkey;

  secretKey.fill(0);

  return { botPubkey };
}

export function setSetupRelays({
  dmBotRoot,
  rawRelays,
}: SetRelaysProps): SetRelaysResult {
  const joined = rawRelays.join(',');
  const relays = parseRelayUrls(joined);

  if (relays.length === 0) {
    throw new Error('invalid_relays');
  }

  for (const relay of relays) {
    try {
      const url = new URL(relay);

      if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
        throw new Error('invalid_relays');
      }
    } catch {
      throw new Error('invalid_relays');
    }
  }

  const envValue = relays.join(',');

  setEnvInFile(join(dmBotRoot, '.env'), 'BOT_RELAYS', envValue);
  process.env.BOT_RELAYS = envValue;

  return { relays };
}
