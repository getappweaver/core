// ---------------------------------------------------------------------------
// src/flow/auto-flow-refund.ts — Refund Routstr after auto-flow
// ---------------------------------------------------------------------------

import type { CoreDb } from '../db';
import { getRoutstrSkKey } from '../db';
import { log } from '../logger';
import type { ProviderDb } from '../providers/db';
import { refundRoutstr } from '../providers/routstr';
import type { WalletDb } from '../wallet/db';

export type FinalizeAutoFlowRefundProps = {
  isAutoFlow: boolean;
  walletDb: WalletDb | null;
  seenDb: CoreDb;
  cashuDefaultMintUrl: string | null;
  cashuMnemonic: string | null;
  providerDb: ProviderDb | null;
  sendReply: (message: string) => Promise<void>;
};

export async function finalizeAutoFlowRefund({
  isAutoFlow,
  walletDb,
  seenDb,
  cashuMnemonic,
  providerDb,
  sendReply,
}: FinalizeAutoFlowRefundProps): Promise<void> {
  if (!isAutoFlow) {
    return;
  }

  if (!walletDb) {
    await sendReply(
      "Wallet not available. Auto-flow won't run. `bun run wallet:setup` to configure your wallet.",
    );

    return;
  }

  const skKey = getRoutstrSkKey(seenDb);

  if (!skKey) {
    await sendReply(
      'No Routstr session key. Use !provider deposit <sats> first.',
    );

    return;
  }

  if (!cashuMnemonic) {
    await sendReply(
      'No mnemonic configured. Run `bun run wallet:setup` to configure your wallet.',
    );

    return;
  }

  if (!providerDb) {
    return;
  }

  const recovered = await refundRoutstr({
    mnemonic: cashuMnemonic,
    providerDb,
    seenDb,
    skKey,
  });

  if (recovered > 0) {
    log.warn(`Auto-flow: recovered ${recovered} sats`);
  }
}
