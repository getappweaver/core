import type { VerifiedEvent } from 'nostr-tools';

import { log } from '@src/logger';
import { CashuWallet } from '@src/wallet/cashu';
import type { WalletDb } from '@src/wallet/db';
import {
  bumpCounters,
  getBalanceByMint,
  logWalletOperation,
} from '@src/wallet/db';
import { publishCurrentDeterministicWalletState } from '@src/wallet/nostr-state';
import { publishCurrentDeterministicWalletStateWithSigner } from '@src/wallet/nostr-state';

import type { WalletReceiveRepresentation } from './representation';

type HandleWalletReceiveProps = {
  mnemonic: string | null | undefined;
  walletDb: WalletDb | null;
  mintUrl: string | null;
  token: string | undefined;
  prefix: string;
  botKeyHex: string;
  signerPubkey: string | null;
  ownerPubkey: string;
  walletStateWriteRelays: string[];
  signEncryptedSelfEvent:
    | ((props: {
        kind: number;
        plaintext: string;
        tags: string[][];
      }) => Promise<VerifiedEvent>)
    | null;
};

function toRepresentation(
  data: WalletReceiveRepresentation['data'],
): WalletReceiveRepresentation {
  return {
    kind: 'wallet.receive',
    version: 1,
    meta: { command: 'wallet', subcommand: 'receive' },
    data,
  };
}

export async function handleWalletReceive(
  props: HandleWalletReceiveProps,
): Promise<WalletReceiveRepresentation> {
  const {
    mnemonic,
    walletDb,
    mintUrl,
    token,
    prefix,
    botKeyHex,
    signerPubkey,
    ownerPubkey,
    walletStateWriteRelays,
    signEncryptedSelfEvent,
  } = props;

  if (!walletDb) {
    return toRepresentation({ view: 'no-wallet-db' });
  }

  if (!mnemonic) {
    return toRepresentation({ view: 'no-mnemonic' });
  }

  if (!mintUrl) {
    return toRepresentation({ view: 'no-mint', prefix });
  }

  if (!token) {
    return toRepresentation({ view: 'usage', prefix });
  }

  const wallet = new CashuWallet({ mnemonic, mintUrl });
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { actuallyReceived, fee } = await wallet.receiveToken(token);

      log.ok(`Received ${actuallyReceived} sats to mint ${mintUrl}.`);

      await getBalanceByMint(walletDb, mintUrl);

      logWalletOperation(walletDb, {
        ts: null,
        mint_url: mintUrl,
        operation: 'in',
        amount: actuallyReceived,
        fee,
        token,
      });

      if (signEncryptedSelfEvent) {
        await publishCurrentDeterministicWalletStateWithSigner({
          writeRelays: walletStateWriteRelays,
          walletDb,
          mnemonic,
          signEncryptedSelfEvent,
        });
      } else if (signerPubkey) {
        await publishCurrentDeterministicWalletState({
          botKeyHex,
          signerPubkey,
          ownerPubkey,
          writeRelays: walletStateWriteRelays,
          walletDb,
          mnemonic,
        });
      }

      return toRepresentation({ view: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      const isSignedError =
        msg.includes('outputs have already been signed') ||
        msg.includes('already signed');

      if (isSignedError && attempt < maxRetries - 1) {
        bumpCounters(walletDb, mintUrl);
        continue;
      }

      return toRepresentation({
        view: 'failure',
        message: `Failed to receive: ${msg}`,
      });
    }
  }

  return toRepresentation({
    view: 'failure',
    message: `Failed to receive after ${maxRetries} retries.`,
  });
}
