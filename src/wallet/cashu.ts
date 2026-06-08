import type { OperationCounters } from '@cashu/cashu-ts';
import {
  getDecodedToken,
  getEncodedToken,
  getTokenMetadata,
  Wallet,
} from '@cashu/cashu-ts';
import * as bip39 from '@scure/bip39';

import { debug, log } from '../logger';

import type { WalletDb } from './db';
import {
  loadProofs,
  saveProofs,
  deleteProofs,
  totalBalance,
  openWalletDb,
  loadCounters,
  persistCounter,
} from './db';
import { normalizeMintUrl } from './mint-url';
import { InsufficientFundsError } from './types';

export function decodeToken(encodedToken: string): string {
  const decoded = getDecodedToken(encodedToken);

  if (!decoded) {
    throw new Error('Invalid token: no token data');
  }

  return `Decoded token: ${JSON.stringify(decoded, null, 2)}`;
}

export function decodeTokenMintUrl(encodedToken: string): string {
  const metadata = getTokenMetadata(encodedToken);

  if (!metadata.mint) {
    throw new Error('Invalid token: no mint URL');
  }

  return metadata.mint;
}

export type CreateCashuWalletProps = {
  mnemonic: string;
  mintUrl: string;
};

export class CashuWallet {
  readonly mnemonic: string;
  readonly mintUrl: string;
  readonly db: WalletDb;
  readonly seed: Uint8Array;

  constructor({ mnemonic, mintUrl }: CreateCashuWalletProps) {
    this.mnemonic = mnemonic;
    this.mintUrl = mintUrl;
    this.db = openWalletDb(mnemonic);
    this.seed = bip39.mnemonicToSeedSync(mnemonic);
  }

  async getWallet(): Promise<Wallet> {
    const counters = loadCounters(this.db, this.mintUrl);

    const wallet = new Wallet(this.mintUrl, {
      unit: 'sat',
      bip39seed: this.seed,
      counterInit: counters,
    });

    await wallet.loadMint();

    return wallet;
  }

  async createMintQuoteBolt11(amountSats: number): Promise<{
    quote: string;
    request: string;
    amount: number;
  }> {
    const wallet = await this.getWallet();

    return wallet.mint.createMintQuoteBolt11({
      amount: amountSats,
      unit: 'sat',
    });
  }

  async claimMintQuoteBolt11(quote: string): Promise<{
    actuallyReceived: number;
    fee: number;
    token: string;
  }> {
    const wallet = await this.getWallet();
    const quoteResponse = await wallet.mint.checkMintQuoteBolt11(quote);

    if (quoteResponse.state !== 'PAID') {
      throw new Error('Invoice not paid yet');
    }

    wallet.on.countersReserved((op: OperationCounters) => {
      log.info(`countersReserved event fired:`);

      persistCounter({ db: this.db, mintUrl: this.mintUrl, op });
    });

    const proofs = await wallet.ops
      .mintBolt11(quoteResponse.amount, quoteResponse)
      .asDeterministic()
      .run();

    const actuallyReceived = totalBalance(proofs);

    saveProofs(this.db, this.mintUrl, proofs);

    const token = getEncodedToken({
      mint: this.mintUrl,
      proofs,
      unit: 'sat',
    });

    return {
      actuallyReceived,
      fee: Math.max(0, quoteResponse.amount - actuallyReceived),
      token,
    };
  }

  async meltInvoiceBolt11(
    invoice: string,
    amountSats: number,
  ): Promise<{
    paidSats: number;
    fee: number;
    quote: string;
    paymentPreimage: string | null;
  }> {
    const wallet = await this.getWallet();

    const quote = await (async () => {
      try {
        return await wallet.createMeltQuoteBolt11(invoice, amountSats * 1000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (!msg.includes('invoice already contains an amount')) {
          throw err;
        }

        return wallet.createMeltQuoteBolt11(invoice);
      }
    })();

    if (quote.amount !== amountSats) {
      throw new Error(
        `Invoice amount ${quote.amount} sats does not match requested ${amountSats} sats`,
      );
    }

    const proofs = loadProofs(this.db, this.mintUrl);
    const amountNeeded = quote.amount + quote.fee_reserve;
    const balance = totalBalance(proofs);

    if (balance < amountNeeded) {
      throw new InsufficientFundsError(balance, amountNeeded);
    }

    const { send } = wallet.selectProofsToSend(
      proofs,
      amountNeeded,
      false,
      false,
    );

    const selectedTotal = totalBalance(send);

    const result = await wallet.ops
      .meltBolt11(quote, send)
      .asDeterministic()
      .onCountersReserved((op: OperationCounters) => {
        log.info(`countersReserved event fired:`);

        persistCounter({ db: this.db, mintUrl: this.mintUrl, op });
      })
      .run();

    if (result.quote.state !== 'PAID') {
      throw new Error(`Melt quote is ${result.quote.state.toLowerCase()}`);
    }

    deleteProofs(this.db, send);

    if (result.change.length > 0) {
      saveProofs(this.db, this.mintUrl, result.change);
    }

    const changeTotal = totalBalance(result.change);
    const spent = selectedTotal - changeTotal;

    return {
      paidSats: result.quote.amount,
      fee: Math.max(0, spent - result.quote.amount),
      quote: result.quote.quote,
      paymentPreimage: result.quote.payment_preimage,
    };
  }

  async sendToken(amountSats: number): Promise<{ token: string; fee: number }> {
    const proofs = loadProofs(this.db, this.mintUrl);
    const balance = totalBalance(proofs);

    if (balance < amountSats) {
      throw new InsufficientFundsError(balance, amountSats);
    }

    log.info(`Sending ${amountSats} sats from ${balance} sats balance`);

    const wallet = await this.getWallet();

    wallet.on.countersReserved((op: OperationCounters) => {
      log.info(`countersReserved event fired:`);

      persistCounter({ db: this.db, mintUrl: this.mintUrl, op });
    });

    const { keep, send } = await wallet.ops
      .send(amountSats, proofs)
      .asDeterministic()
      .run();

    log.info(`keep: ${keep.length}, send: ${send.length}`);

    log.info(
      `keep total: ${totalBalance(keep)} sats, send total: ${totalBalance(send)} sats`,
    );

    deleteProofs(this.db, proofs);

    if (keep.length > 0) {
      saveProofs(this.db, this.mintUrl, keep);
    }

    const encoded = getEncodedToken({
      mint: this.mintUrl,
      proofs: send,
      unit: 'sat',
    });

    return { token: encoded, fee: totalBalance(send) - amountSats };
  }

  async receiveToken(
    encodedToken: string,
  ): Promise<{ actuallyReceived: number; fee: number }> {
    const tokenMintUrl = decodeTokenMintUrl(encodedToken);

    if (normalizeMintUrl(tokenMintUrl) !== normalizeMintUrl(this.mintUrl)) {
      debug('Invalid token: mint URL mismatch', tokenMintUrl, this.mintUrl);

      throw new Error('Invalid token: mint URL mismatch');
    }

    const wallet = await this.getWallet();
    const decodedWithFullKeysets = wallet.decodeToken(encodedToken);

    if (decodedWithFullKeysets.unit !== 'sat') {
      throw new Error('Invalid token: unit is not sat');
    }

    if (decodedWithFullKeysets.proofs.length === 0) {
      throw new Error('Invalid token: no proofs');
    }

    wallet.on.countersReserved((op: OperationCounters) => {
      log.info(`countersReserved event fired:`);

      persistCounter({ db: this.db, mintUrl: this.mintUrl, op });
    });

    const wouldReceive = totalBalance(decodedWithFullKeysets.proofs);

    const newProofs = await wallet.ops
      .receive(decodedWithFullKeysets)
      .asDeterministic()
      .run();

    const actuallyReceived = totalBalance(newProofs);

    log.info(`newProofs: ${newProofs.length}`);

    saveProofs(this.db, this.mintUrl, newProofs);

    return { actuallyReceived, fee: wouldReceive - actuallyReceived };
  }
}
