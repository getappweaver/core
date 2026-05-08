import { bytesToHex } from '@noble/hashes/utils.js';
import * as bip39 from '@scure/bip39';
import type { EventTemplate, NostrEvent, VerifiedEvent } from 'nostr-tools';
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import type { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';
import { z } from 'zod';

import { log } from '@src/logger';
import { fetchNip65RelaySet } from '@src/nostr/nip65';
import {
  publishSignedEventToRelays,
  summarizeRelayOutcomes,
  type RelayResult,
} from '@src/nostr/relay-publish';

import {
  getWalletCounterRows,
  upsertWalletCounterRows,
  type WalletCounterRow,
  type WalletDb,
} from './db';
import { createMintCounterKey, parseMintCounterKey } from './mint-url';

export const DETERMINISTIC_WALLET_STATE_KIND = 17376;

export const DeterministicWalletStateSchema = z.object({
  bip39seed: z
    .string()
    .regex(/^[0-9a-f]+$/i)
    .refine((value) => value.length === 64 || value.length === 128, {
      message: 'bip39seed must be 32 or 64 bytes encoded as hex',
    }),
  counters: z.record(z.string(), z.string().regex(/^\d+$/)),
});

export type DeterministicWalletState = z.infer<
  typeof DeterministicWalletStateSchema
>;

export function walletCounterRowsToStateCounters(
  rows: WalletCounterRow[],
): DeterministicWalletState['counters'] {
  return Object.fromEntries(
    rows.map((row) => [
      createMintCounterKey({ mintUrl: row.mint, keysetId: row.keyset_id }),
      String(row.next),
    ]),
  );
}

export function stateCountersToWalletCounterRows(
  counters: DeterministicWalletState['counters'],
): WalletCounterRow[] {
  return Object.entries(counters).flatMap(([key, next]) => {
    const parsed = parseMintCounterKey(key);

    if (!parsed) {
      return [];
    }

    return [
      {
        mint: parsed.mintUrl,
        keyset_id: parsed.keysetId,
        next: Number(next),
      },
    ];
  });
}

export function buildDeterministicWalletState(props: {
  bip39seedHex: string;
  counterRows: WalletCounterRow[];
}): DeterministicWalletState {
  return DeterministicWalletStateSchema.parse({
    bip39seed: props.bip39seedHex,
    counters: walletCounterRowsToStateCounters(props.counterRows),
  });
}

type WalletStateCryptoProps = {
  botKeyHex: string;
  signerPubkey: string;
  ownerPubkey: string;
};

type BuildDeterministicWalletStateEventProps = WalletStateCryptoProps & {
  state: DeterministicWalletState;
  createdAt: number | null;
};

type PublishDeterministicWalletStateProps = WalletStateCryptoProps & {
  relays: string[];
  state: DeterministicWalletState;
};

type FetchDeterministicWalletStateProps = WalletStateCryptoProps & {
  pool: SimplePool;
  relays: string[];
};

type HydrateDeterministicWalletStateProps = WalletStateCryptoProps & {
  pool: SimplePool;
  readRelays: string[];
  walletDb: WalletDb;
  mnemonic: string;
};

type HydrateDeterministicWalletStateWithDecryptProps = {
  pool: SimplePool;
  readRelays: string[];
  ownerPubkey: string;
  walletDb: WalletDb;
  mnemonic: string;
  decryptSelfContent: (ciphertext: string) => Promise<string>;
};

type PublishCurrentDeterministicWalletStateProps = WalletStateCryptoProps & {
  writeRelays: string[];
  walletDb: WalletDb;
  mnemonic: string;
};

type PublishCurrentDeterministicWalletStateWithSignerProps = {
  writeRelays: string[];
  walletDb: WalletDb;
  mnemonic: string;
  signEncryptedSelfEvent: (props: {
    kind: number;
    plaintext: string;
    tags: string[][];
  }) => Promise<VerifiedEvent>;
};

type ResolveDeterministicWalletStateRelaysProps = {
  pool: SimplePool;
  ownerPubkey: string;
  fallbackRelays: string[];
};

export function mnemonicToBip39SeedHex(mnemonic: string): string {
  return bytesToHex(bip39.mnemonicToSeedSync(mnemonic));
}

export function encryptDeterministicWalletState(
  props: WalletStateCryptoProps & { state: DeterministicWalletState },
): string {
  const conversationKey = getConversationKey(
    hexToBytes(props.botKeyHex),
    props.ownerPubkey,
  );

  return encrypt(JSON.stringify(props.state), conversationKey);
}

export function decryptDeterministicWalletState(
  props: WalletStateCryptoProps & { content: string },
): DeterministicWalletState {
  const conversationKey = getConversationKey(
    hexToBytes(props.botKeyHex),
    props.ownerPubkey,
  );

  const plaintext = decrypt(props.content, conversationKey);

  return DeterministicWalletStateSchema.parse(JSON.parse(plaintext));
}

export function buildDeterministicWalletStateEvent(
  props: BuildDeterministicWalletStateEventProps,
): EventTemplate {
  return {
    kind: DETERMINISTIC_WALLET_STATE_KIND,
    created_at: props.createdAt ?? Math.floor(Date.now() / 1000),
    tags: [],
    content: encryptDeterministicWalletState(props),
  };
}

export async function publishDeterministicWalletState(
  props: PublishDeterministicWalletStateProps,
): Promise<{ signed: VerifiedEvent; outcomes: RelayResult[] }> {
  const template = buildDeterministicWalletStateEvent({
    botKeyHex: props.botKeyHex,
    signerPubkey: props.signerPubkey,
    ownerPubkey: props.ownerPubkey,
    state: props.state,
    createdAt: null,
  });

  const signed = finalizeEvent(template, hexToBytes(props.botKeyHex));

  const outcomes = await publishSignedEventToRelays(props.relays, signed);

  return { signed, outcomes };
}

export async function fetchDeterministicWalletState(
  props: FetchDeterministicWalletStateProps,
): Promise<{ event: NostrEvent; state: DeterministicWalletState } | null> {
  const events = await props.pool.querySync(
    props.relays,
    {
      kinds: [DETERMINISTIC_WALLET_STATE_KIND],
      authors: [props.ownerPubkey],
      limit: 10,
    },
    { maxWait: 2_000 },
  );

  const [latest] = [...events].sort((a, b) => b.created_at - a.created_at);

  if (!latest) {
    return null;
  }

  return {
    event: latest,
    state: decryptDeterministicWalletState({
      botKeyHex: props.botKeyHex,
      signerPubkey: props.signerPubkey,
      ownerPubkey: props.ownerPubkey,
      content: latest.content,
    }),
  };
}

export async function resolveDeterministicWalletStateRelays(
  props: ResolveDeterministicWalletStateRelaysProps,
): Promise<{ readRelays: string[]; writeRelays: string[] }> {
  return fetchNip65RelaySet({
    pool: props.pool,
    authorPubkey: props.ownerPubkey,
    fallbackRelays: props.fallbackRelays,
  });
}

export async function hydrateDeterministicWalletState(
  props: HydrateDeterministicWalletStateProps,
): Promise<void> {
  if (props.signerPubkey !== props.ownerPubkey) {
    log.warn(
      'Skipping deterministic wallet state hydration: BOT_KEY cannot decrypt master-owned wallet state.',
    );

    return;
  }

  let remote: Awaited<ReturnType<typeof fetchDeterministicWalletState>>;

  try {
    remote = await fetchDeterministicWalletState({
      botKeyHex: props.botKeyHex,
      signerPubkey: props.signerPubkey,
      ownerPubkey: props.ownerPubkey,
      pool: props.pool,
      relays: props.readRelays,
    });
  } catch (err) {
    log.warn(
      `Could not fetch deterministic wallet state from Nostr: ${err instanceof Error ? err.message : String(err)}`,
    );

    return;
  }

  if (!remote) {
    log.info('No deterministic wallet state found on Nostr.');

    return;
  }

  const localSeedHex = mnemonicToBip39SeedHex(props.mnemonic);

  if (remote.state.bip39seed.toLowerCase() !== localSeedHex.toLowerCase()) {
    throw new Error(
      'Deterministic wallet state seed on Nostr does not match CASHU_MNEMONIC.',
    );
  }

  const rows = stateCountersToWalletCounterRows(remote.state.counters);

  upsertWalletCounterRows({ db: props.walletDb, rows });

  log.info(
    `Hydrated ${rows.length} deterministic wallet counter(s) from Nostr.`,
  );
}

export async function hydrateDeterministicWalletStateWithDecrypt(
  props: HydrateDeterministicWalletStateWithDecryptProps,
): Promise<void> {
  const events = await props.pool.querySync(
    props.readRelays,
    {
      kinds: [DETERMINISTIC_WALLET_STATE_KIND],
      authors: [props.ownerPubkey],
      limit: 10,
    },
    { maxWait: 2_000 },
  );

  const [latest] = [...events].sort((a, b) => b.created_at - a.created_at);

  if (!latest) {
    log.info('No deterministic wallet state found on Nostr.');

    return;
  }

  let state: DeterministicWalletState;

  try {
    state = DeterministicWalletStateSchema.parse(
      JSON.parse(await props.decryptSelfContent(latest.content)),
    );
  } catch (err) {
    log.warn(
      `Could not decrypt deterministic wallet state from Nostr: ${err instanceof Error ? err.message : String(err)}`,
    );

    return;
  }

  const localSeedHex = mnemonicToBip39SeedHex(props.mnemonic);

  if (state.bip39seed.toLowerCase() !== localSeedHex.toLowerCase()) {
    throw new Error(
      'Deterministic wallet state seed on Nostr does not match CASHU_MNEMONIC.',
    );
  }

  const rows = stateCountersToWalletCounterRows(state.counters);

  upsertWalletCounterRows({ db: props.walletDb, rows });

  log.info(
    `Hydrated ${rows.length} deterministic wallet counter(s) from Nostr.`,
  );
}

export async function publishCurrentDeterministicWalletState(
  props: PublishCurrentDeterministicWalletStateProps,
): Promise<void> {
  if (props.signerPubkey !== props.ownerPubkey) {
    log.warn(
      'Skipping deterministic wallet state publish: BOT_KEY cannot author master-owned wallet state.',
    );

    return;
  }

  const state = buildDeterministicWalletState({
    bip39seedHex: mnemonicToBip39SeedHex(props.mnemonic),
    counterRows: getWalletCounterRows(props.walletDb),
  });

  try {
    const { outcomes } = await publishDeterministicWalletState({
      botKeyHex: props.botKeyHex,
      signerPubkey: props.signerPubkey,
      ownerPubkey: props.ownerPubkey,
      relays: props.writeRelays,
      state,
    });

    const summary = summarizeRelayOutcomes(outcomes);

    if (summary.accepted.length === 0) {
      log.warn(
        'Deterministic wallet state publish was rejected by all relays.',
      );

      return;
    }

    if (summary.rejected.length > 0) {
      log.warn(
        `Deterministic wallet state publish rejected by ${summary.rejected.length} relay(s).`,
      );
    }

    log.info(
      `Published deterministic wallet state to ${summary.accepted.length} relay(s).`,
    );
  } catch (err) {
    log.warn(
      `Could not publish deterministic wallet state: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function publishCurrentDeterministicWalletStateWithSigner(
  props: PublishCurrentDeterministicWalletStateWithSignerProps,
): Promise<void> {
  const state = buildDeterministicWalletState({
    bip39seedHex: mnemonicToBip39SeedHex(props.mnemonic),
    counterRows: getWalletCounterRows(props.walletDb),
  });

  try {
    const signed = await props.signEncryptedSelfEvent({
      kind: DETERMINISTIC_WALLET_STATE_KIND,
      plaintext: JSON.stringify(state),
      tags: [],
    });

    const outcomes = await publishSignedEventToRelays(
      props.writeRelays,
      signed,
    );

    const summary = summarizeRelayOutcomes(outcomes);

    if (summary.accepted.length === 0) {
      log.warn(
        'Deterministic wallet state publish was rejected by all relays.',
      );

      return;
    }

    if (summary.rejected.length > 0) {
      log.warn(
        `Deterministic wallet state publish rejected by ${summary.rejected.length} relay(s).`,
      );
    }

    log.info(
      `Published deterministic wallet state to ${summary.accepted.length} relay(s).`,
    );
  } catch (err) {
    log.warn(
      `Could not publish deterministic wallet state: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
