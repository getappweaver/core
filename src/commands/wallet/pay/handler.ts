import type { VerifiedEvent } from 'nostr-tools';

import { log } from '@src/logger';
import { CashuWallet } from '@src/wallet/cashu';
import type { WalletDb } from '@src/wallet/db';
import { bumpCounters, logWalletOperation } from '@src/wallet/db';
import { publishCurrentDeterministicWalletState } from '@src/wallet/nostr-state';
import { publishCurrentDeterministicWalletStateWithSigner } from '@src/wallet/nostr-state';
import { invoiceToQrDataUri } from '@src/wallet/qr';

import type { WalletPayRepresentation } from './representation';

type HandleWalletPayProps = {
  mnemonic: string | null | undefined;
  walletDb: WalletDb | null;
  mintUrl: string | null;
  amountArg: string | undefined;
  quoteArg: string | undefined;
  claim: boolean;
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
  data: WalletPayRepresentation['data'],
): WalletPayRepresentation {
  return {
    kind: 'wallet.pay',
    version: 1,
    meta: { command: 'wallet', subcommand: 'pay' },
    data,
  };
}

export async function handleWalletPay(
  props: HandleWalletPayProps,
): Promise<WalletPayRepresentation> {
  const {
    mnemonic,
    walletDb,
    mintUrl,
    amountArg,
    quoteArg,
    claim,
    prefix,
    botKeyHex,
    signerPubkey,
    ownerPubkey,
    walletStateWriteRelays,
    signEncryptedSelfEvent,
  } = props;

  const amount = Number.parseInt(amountArg ?? '', 10);

  if (!claim && (Number.isNaN(amount) || amount <= 0)) {
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

  if (claim) {
    if (!quoteArg) {
      return toRepresentation({
        view: 'failure',
        message: 'Missing quote for claim.',
      });
    }

    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const { actuallyReceived, fee, token } =
          await wallet.claimMintQuoteBolt11(quoteArg);

        log.info(`Minted ${actuallyReceived} sats in mint ${mintUrl}.`);

        logWalletOperation(walletDb, {
          ts: null,
          mint_url: mintUrl,
          operation: 'in',
          kind: 'mint',
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

        return toRepresentation({
          view: 'success',
          mintUrl,
          receivedSats: actuallyReceived,
          feeSats: fee,
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
          message: `Failed to mint: ${msg}`,
        });
      }
    }

    return toRepresentation({
      view: 'failure',
      message: 'Failed to mint after 3 retries.',
    });
  }

  const quote = await wallet.createMintQuoteBolt11(amount);
  const qrDataUri = await invoiceToQrDataUri(quote.request);

  log.info(
    `Created mint quote ${quote.quote} for ${amount} sats at ${mintUrl}.`,
  );

  return toRepresentation({
    view: 'quote',
    mintUrl,
    amountSats: amount,
    quote: quote.quote,
    invoice: quote.request,
    qrDataUri,
    message: null,
  });
}
