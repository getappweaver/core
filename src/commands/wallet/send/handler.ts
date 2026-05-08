import type { VerifiedEvent } from 'nostr-tools';

import { log } from '@src/logger';
import { CashuWallet } from '@src/wallet/cashu';
import type { WalletDb } from '@src/wallet/db';
import { bumpCounters, logWalletOperation } from '@src/wallet/db';
import { publishCurrentDeterministicWalletState } from '@src/wallet/nostr-state';
import { publishCurrentDeterministicWalletStateWithSigner } from '@src/wallet/nostr-state';

import type { WalletSendRepresentation } from './representation';

type HandleWalletSendProps = {
  mnemonic: string | null | undefined;
  walletDb: WalletDb | null;
  mintUrl: string | null;
  amountArg: string | undefined;
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
  data: WalletSendRepresentation['data'],
): WalletSendRepresentation {
  return {
    kind: 'wallet.send',
    version: 1,
    meta: { command: 'wallet', subcommand: 'send' },
    data,
  };
}

export async function handleWalletSend(
  props: HandleWalletSendProps,
): Promise<WalletSendRepresentation> {
  const {
    mnemonic,
    walletDb,
    mintUrl,
    amountArg,
    prefix,
    botKeyHex,
    signerPubkey,
    ownerPubkey,
    walletStateWriteRelays,
    signEncryptedSelfEvent,
  } = props;

  const amount = parseInt(amountArg ?? '', 10);

  if (isNaN(amount) || amount <= 0) {
    return toRepresentation({ view: 'invalid-amount', prefix });
  }

  if (!walletDb) {
    return toRepresentation({ view: 'no-wallet-db' });
  }

  if (!mnemonic) {
    return toRepresentation({ view: 'no-mnemonic' });
  }

  if (!mintUrl) {
    return toRepresentation({ view: 'no-mint', prefix });
  }

  const wallet = new CashuWallet({ mnemonic, mintUrl });
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { token, fee } = await wallet.sendToken(amount);

      log.info(`Sent ${amount} sats in mint ${mintUrl}.`);

      logWalletOperation(walletDb, {
        ts: null,
        mint_url: mintUrl,
        operation: 'out',
        amount,
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

      return toRepresentation({ view: 'token', token });
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
        message: `Failed to send: ${msg}`,
      });
    }
  }

  return toRepresentation({
    view: 'failure',
    message: `Failed to send after ${maxRetries} retries.`,
  });
}
