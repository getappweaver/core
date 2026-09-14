import type {
  BuiltinHandler,
  RouteCommandContext,
} from '@src/commands/dispatch';
import { renderBuiltinHelpText } from '@src/commands/help/renderers/text';
import { getWalletDefaultMintUrl } from '@src/db';
import { NwcClient } from '@src/nwc/client';
import { parseNwcConnectionUri } from '@src/nwc/connection';
import { getStoredNwcConnection, listNwcConnections } from '@src/nwc/state';
import { getCashuMints } from '@src/wallet/db';

import {
  renderWalletOverviewText,
  renderWalletOverviewWeb,
  type WalletOverviewNwc,
} from './renderers';

async function inspectNwcConnection(
  ctx: RouteCommandContext,
  id: string,
): Promise<WalletOverviewNwc> {
  const summary = listNwcConnections(ctx.seenDb).find(
    (connection) => connection.id === id,
  );

  const stored = getStoredNwcConnection(ctx.seenDb, id);

  if (!summary || !stored) {
    throw new Error('NWC connection not found.');
  }

  try {
    const client = new NwcClient({
      transport: ctx.pool,
      connection: parseNwcConnectionUri(stored.connectionUri),
      infoTimeoutMs: 5_000,
      publishTimeoutMs: 5_000,
      replyTimeoutMs: 10_000,
    });

    const service = await client.getWalletServiceInfo();

    if (!service.methods.includes('get_balance')) {
      return { summary, availability: 'available', balance: null };
    }

    const balance = await client.getBalance();

    return {
      summary,
      availability: 'available',
      balance: balance.toSatoshiFloor().toString(),
    };
  } catch {
    return { summary, availability: 'unavailable', balance: null };
  }
}

export const handleWalletRoot: BuiltinHandler = async (ctx) => {
  const subcommand = ctx.args[0]?.toLowerCase() ?? 'list';

  if (subcommand === 'help') {
    return renderBuiltinHelpText({
      prefix: ctx.prefix,
      root: 'wallet',
      topic: ctx.args[1]?.toLowerCase() ?? null,
    });
  }

  if (subcommand !== 'list') {
    return `Unknown wallet subcommand: ${subcommand}. Cashu commands now use ${ctx.prefix}cashu.`;
  }

  const nwcSummaries = listNwcConnections(ctx.seenDb);

  const nwc = await Promise.all(
    nwcSummaries.map((connection) => inspectNwcConnection(ctx, connection.id)),
  );

  const defaultMintUrl = getWalletDefaultMintUrl(
    ctx.seenDb,
    ctx.config.cashuDefaultMintUrl,
  );

  const cashuMints = ctx.walletDb ? getCashuMints(ctx.walletDb) : null;

  const cashu = cashuMints
    ? [
        ...cashuMints,
        ...(defaultMintUrl &&
        !cashuMints.some((mint) => mint.mint === defaultMintUrl)
          ? [{ mint: defaultMintUrl, total_amount: 0 }]
          : []),
      ]
        .map((mint) => ({
          mintUrl: mint.mint,
          balance: mint.total_amount,
          isDefault: mint.mint === defaultMintUrl,
        }))
        .sort((left, right) =>
          left.isDefault === right.isDefault
            ? left.mintUrl.localeCompare(right.mintUrl)
            : left.isDefault
              ? -1
              : 1,
        )
    : null;

  const overview = { nwc, cashu };

  return ctx.source === 'web'
    ? renderWalletOverviewWeb(overview)
    : renderWalletOverviewText(overview, ctx.prefix);
};
