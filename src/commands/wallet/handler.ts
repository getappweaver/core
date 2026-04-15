// ---------------------------------------------------------------------------
// src/commands/wallet/handler.ts — wallet <subcommand> DM builtin root
// ---------------------------------------------------------------------------

import { getWalletDefaultMintUrl } from '@src/db';

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { handleWalletBalance } from './balance/handler';
import { renderWalletCli } from './cli-representation';
import { handleWalletDecode } from './decode/handler';
import { handleWalletHistory } from './history/handler';
import { handleWalletMint } from './mint/handler';
import { handleWalletMints } from './mints/handler';
import { handleWalletReceive } from './receive/handler';
import { handleWalletSend } from './send/handler';
import { buildWalletUsageRepresentation } from './usage/representation';

export const handleWalletRoot: BuiltinHandler = (ctx) => {
  const input = ctx;
  const p = input.prefix;
  const mnemonic = input.config.cashuMnemonic;
  const defaultMintUrl = input.config.cashuDefaultMintUrl;
  const args = input.args;
  const subcmd = args[0]?.toLowerCase();

  const render = (rep: Parameters<typeof renderWalletCli>[0]) =>
    renderWalletCli(rep, { prefix: p });

  if (subcmd === 'help') {
    const topic = args[1]?.toLowerCase() ?? null;

    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: p,
        root: 'wallet',
        topic,
      }),
    );
  }

  if (subcmd === 'mint') {
    const url = args[1];

    return handleError(
      async () =>
        render(
          handleWalletMint({
            seenDb: input.seenDb,
            defaultMintUrl,
            url,
            prefix: p,
          }),
        ),
      'Failed to set mint',
    );
  }

  if (subcmd === 'mints') {
    return handleError(
      async () => render(handleWalletMints({ walletDb: input.walletDb })),
      'Failed to list mints',
    );
  }

  const mint = getWalletDefaultMintUrl(input.seenDb, defaultMintUrl);

  switch (subcmd) {
    case 'balance':
      return handleError(
        async () =>
          render(
            await handleWalletBalance({
              walletDb: input.walletDb,
              mintUrl: mint,
              prefix: p,
            }),
          ),
        'Failed to get balance',
      );

    case 'decode':
      return handleError(
        async () =>
          render(
            handleWalletDecode({
              token: args[1],
              prefix: p,
            }),
          ),
        'Failed to decode token',
      );

    case 'receive':
      return handleError(
        async () =>
          render(
            await handleWalletReceive({
              mnemonic,
              walletDb: input.walletDb,
              mintUrl: mint,
              token: args[1],
              prefix: p,
            }),
          ),
        'Failed to receive token',
      );

    case 'send':
      return handleError(
        async () =>
          render(
            await handleWalletSend({
              mnemonic,
              walletDb: input.walletDb,
              mintUrl: mint,
              amountArg: args[1],
              prefix: p,
            }),
          ),
        'Failed to send token',
      );

    case 'history':
      return handleError(
        async () =>
          render(
            handleWalletHistory({
              walletDb: input.walletDb,
              showToken: args[1] === '--token',
            }),
          ),
        'Failed to get history',
      );

    default:
      return Promise.resolve(
        render(buildWalletUsageRepresentation({ prefix: p })),
      );
  }
};
