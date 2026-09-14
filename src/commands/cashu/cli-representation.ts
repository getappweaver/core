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
    case 'cashu.usage':
      return renderWalletUsageCli(representation, context);
    case 'cashu.mint':
      return renderWalletMintCli(representation, context);
    case 'cashu.melt':
      return renderWalletMeltCli(representation, context);
    case 'cashu.pay':
      return renderWalletPayCli(representation, context);
    case 'cashu.mints':
      return renderWalletMintsCli(representation, context);
    case 'cashu.balance':
      return renderWalletBalanceCli(representation, context);
    case 'cashu.decode':
      return renderWalletDecodeCli(representation, context);
    case 'cashu.receive':
      return renderWalletReceiveCli(representation, context);
    case 'cashu.send':
      return renderWalletSendCli(representation, context);
    case 'cashu.history':
      return renderWalletHistoryCli(representation, context);
    default:
      return assertUnreachable(representation);
  }
}
