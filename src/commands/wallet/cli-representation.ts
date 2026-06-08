import type { TextRenderContext } from '@src/system/render-context';
import { assertUnreachable } from '@src/utils';

import { renderWalletBalanceCli } from './balance/renderers/cli';
import type { WalletBalanceRepresentation } from './balance/representation';
import { renderWalletDecodeCli } from './decode/renderers/cli';
import type { WalletDecodeRepresentation } from './decode/representation';
import { renderWalletHistoryCli } from './history/renderers/cli';
import type { WalletHistoryRepresentation } from './history/representation';
import { renderWalletMeltCli } from './melt/renderers/cli';
import type { WalletMeltRepresentation } from './melt/representation';
import { renderWalletMintCli } from './mint/renderers/cli';
import type { WalletMintRepresentation } from './mint/representation';
import { renderWalletMintsCli } from './mints/renderers/cli';
import type { WalletMintsRepresentation } from './mints/representation';
import { renderWalletPayCli } from './pay/renderers/cli';
import type { WalletPayRepresentation } from './pay/representation';
import { renderWalletReceiveCli } from './receive/renderers/cli';
import type { WalletReceiveRepresentation } from './receive/representation';
import { renderWalletSendCli } from './send/renderers/cli';
import type { WalletSendRepresentation } from './send/representation';
import { renderWalletUsageCli } from './usage/renderers/cli';
import type { WalletUsageRepresentation } from './usage/representation';

export type WalletCliRepresentation =
  | WalletUsageRepresentation
  | WalletMintRepresentation
  | WalletMeltRepresentation
  | WalletPayRepresentation
  | WalletMintsRepresentation
  | WalletBalanceRepresentation
  | WalletDecodeRepresentation
  | WalletReceiveRepresentation
  | WalletSendRepresentation
  | WalletHistoryRepresentation;

export function renderWalletCli(
  representation: WalletCliRepresentation,
  context: TextRenderContext,
): string {
  switch (representation.kind) {
    case 'wallet.usage':
      return renderWalletUsageCli(representation, context);
    case 'wallet.mint':
      return renderWalletMintCli(representation, context);
    case 'wallet.melt':
      return renderWalletMeltCli(representation, context);
    case 'wallet.pay':
      return renderWalletPayCli(representation, context);
    case 'wallet.mints':
      return renderWalletMintsCli(representation, context);
    case 'wallet.balance':
      return renderWalletBalanceCli(representation, context);
    case 'wallet.decode':
      return renderWalletDecodeCli(representation, context);
    case 'wallet.receive':
      return renderWalletReceiveCli(representation, context);
    case 'wallet.send':
      return renderWalletSendCli(representation, context);
    case 'wallet.history':
      return renderWalletHistoryCli(representation, context);
    default:
      return assertUnreachable(representation);
  }
}
