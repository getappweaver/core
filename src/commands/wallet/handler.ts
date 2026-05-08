// ---------------------------------------------------------------------------
// src/commands/wallet/handler.ts — wallet <subcommand> DM builtin root
// ---------------------------------------------------------------------------

import { getWalletDefaultMintUrl } from '@src/db';
import {
  hydrateDeterministicWalletStateWithDecrypt,
  resolveDeterministicWalletStateRelays,
} from '@src/wallet/nostr-state';

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

  const getWalletStateWriteRelays = async () => {
    const relays = await resolveDeterministicWalletStateRelays({
      pool: input.pool,
      ownerPubkey: input.config.masterPubkey,
      fallbackRelays: input.botRelayUrls,
    });

    return relays.writeRelays;
  };

  const hydrateWalletStateIfAvailable = async () => {
    if (input.source === 'web' || !input.walletDb || !mnemonic) {
      return;
    }

    if (!input.decryptSelfContent) {
      return;
    }

    const relays = await resolveDeterministicWalletStateRelays({
      pool: input.pool,
      ownerPubkey: input.config.masterPubkey,
      fallbackRelays: input.botRelayUrls,
    });

    await hydrateDeterministicWalletStateWithDecrypt({
      pool: input.pool,
      readRelays: relays.readRelays,
      ownerPubkey: input.config.masterPubkey,
      walletDb: input.walletDb,
      mnemonic,
      decryptSelfContent: input.decryptSelfContent,
    });
  };

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

  const mint = getWalletDefaultMintUrl(input.seenDb, defaultMintUrl);

  if (subcmd === 'mints') {
    return handleError(
      async () =>
        render(
          handleWalletMints({
            walletDb: input.walletDb,
            defaultMintUrl: mint,
          }),
        ),
      'Failed to list mints',
    );
  }

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
      return handleError(async () => {
        await hydrateWalletStateIfAvailable();

        return render(
          await handleWalletReceive({
            mnemonic,
            walletDb: input.walletDb,
            mintUrl: mint,
            token: args[1],
            prefix: p,
            botKeyHex: input.config.botKeyHex,
            signerPubkey: input.botPubkey,
            ownerPubkey: input.config.masterPubkey,
            walletStateWriteRelays: await getWalletStateWriteRelays(),
            signEncryptedSelfEvent:
              input.source === 'web'
                ? null
                : (input.signEncryptedSelfEvent ?? null),
          }),
        );
      }, 'Failed to receive token');

    case 'send':
      return handleError(async () => {
        await hydrateWalletStateIfAvailable();

        return render(
          await handleWalletSend({
            mnemonic,
            walletDb: input.walletDb,
            mintUrl: mint,
            amountArg: args[1],
            prefix: p,
            botKeyHex: input.config.botKeyHex,
            signerPubkey: input.botPubkey,
            ownerPubkey: input.config.masterPubkey,
            walletStateWriteRelays: await getWalletStateWriteRelays(),
            signEncryptedSelfEvent:
              input.source === 'web'
                ? null
                : (input.signEncryptedSelfEvent ?? null),
          }),
        );
      }, 'Failed to send token');

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
