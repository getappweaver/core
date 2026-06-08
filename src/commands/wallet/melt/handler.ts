import type { VerifiedEvent } from 'nostr-tools';

import { log } from '@src/logger';
import { CashuWallet } from '@src/wallet/cashu';
import type { WalletDb } from '@src/wallet/db';
import { bumpCounters, logWalletOperation } from '@src/wallet/db';
import { publishCurrentDeterministicWalletState } from '@src/wallet/nostr-state';
import { publishCurrentDeterministicWalletStateWithSigner } from '@src/wallet/nostr-state';

import type { WalletMeltRepresentation } from './representation';

type HandleWalletMeltProps = {
  mnemonic: string | null | undefined;
  walletDb: WalletDb | null;
  mintUrl: string | null;
  amountArg: string | undefined;
  invoiceArg: string | undefined;
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
  data: WalletMeltRepresentation['data'],
): WalletMeltRepresentation {
  return {
    kind: 'wallet.melt',
    version: 1,
    meta: { command: 'wallet', subcommand: 'melt' },
    data,
  };
}

export async function handleWalletMelt(
  props: HandleWalletMeltProps,
): Promise<WalletMeltRepresentation> {
  const {
    mnemonic,
    walletDb,
    mintUrl,
    amountArg,
    invoiceArg,
    prefix,
    botKeyHex,
    signerPubkey,
    ownerPubkey,
    walletStateWriteRelays,
    signEncryptedSelfEvent,
  } = props;

  const amount = Number.parseInt(amountArg ?? '', 10);

  if (Number.isNaN(amount) || amount <= 0) {
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

  if (!invoiceArg) {
    return toRepresentation({
      view: 'invoice-form',
      mintUrl,
      amountSats: amount,
      prefix,
    });
  }

  const wallet = new CashuWallet({ mnemonic, mintUrl });
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const { paidSats, fee, quote, paymentPreimage } =
        await wallet.meltInvoiceBolt11(invoiceArg, amount);

      log.info(`Melted ${paidSats} sats from mint ${mintUrl}.`);

      logWalletOperation(walletDb, {
        ts: null,
        mint_url: mintUrl,
        operation: 'out',
        kind: 'melt',
        amount: paidSats,
        fee,
        token: invoiceArg,
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

      return toRepresentation({
        view: 'success',
        mintUrl,
        paidSats,
        feeSats: fee,
        quote,
        paymentPreimage,
      });
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
        message: `Failed to melt: ${msg}`,
      });
    }
  }

  return toRepresentation({
    view: 'failure',
    message: `Failed to melt after ${maxRetries} retries.`,
  });
}
