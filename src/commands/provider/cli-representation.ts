import type { TextRenderContext } from '@src/system/render-context';
import { assertUnreachable } from '@src/utils';

import { renderProviderAddModelCli } from './add-model/renderers/cli';
import type { ProviderAddModelRepresentation } from './add-model/representation';
import { renderProviderBalanceCli } from './balance/renderers/cli';
import type { ProviderBalanceRepresentation } from './balance/representation';
import { renderProviderBudgetCli } from './budget/renderers/cli';
import type { ProviderBudgetRepresentation } from './budget/representation';
import { renderProviderDepositCli } from './deposit/renderers/cli';
import type { ProviderDepositRepresentation } from './deposit/representation';
import { renderProviderModelsCli } from './models/renderers/cli';
import type { ProviderModelsRepresentation } from './models/representation';
import { renderProviderRefundCli } from './refund/renderers/cli';
import type { ProviderRefundRepresentation } from './refund/representation';
import { renderProviderSetCli } from './set/renderers/cli';
import type { ProviderSetRepresentation } from './set/representation';
import { renderProviderStatusCli } from './status/renderers/cli';
import type { ProviderStatusRepresentation } from './status/representation';
import { renderProviderSyncModelsCli } from './sync-models/renderers/cli';
import type { ProviderSyncModelsRepresentation } from './sync-models/representation';
import { renderProviderUsageCli } from './usage/renderers/cli';
import type { ProviderUsageRepresentation } from './usage/representation';

export type ProviderCliRepresentation =
  | ProviderUsageRepresentation
  | ProviderSetRepresentation
  | ProviderDepositRepresentation
  | ProviderRefundRepresentation
  | ProviderBalanceRepresentation
  | ProviderBudgetRepresentation
  | ProviderStatusRepresentation
  | ProviderModelsRepresentation
  | ProviderSyncModelsRepresentation
  | ProviderAddModelRepresentation;

export function renderProviderCli(
  representation: ProviderCliRepresentation,
  context: TextRenderContext,
): string {
  switch (representation.kind) {
    case 'provider.usage':
      return renderProviderUsageCli(representation, context);
    case 'provider.set':
      return renderProviderSetCli(representation, context);
    case 'provider.deposit':
      return renderProviderDepositCli(representation, context);
    case 'provider.refund':
      return renderProviderRefundCli(representation, context);
    case 'provider.balance':
      return renderProviderBalanceCli(representation, context);
    case 'provider.budget':
      return renderProviderBudgetCli(representation, context);
    case 'provider.status':
      return renderProviderStatusCli(representation, context);
    case 'provider.models':
      return renderProviderModelsCli(representation, context);
    case 'provider.sync-models':
      return renderProviderSyncModelsCli(representation, context);
    case 'provider.add-model':
      return renderProviderAddModelCli(representation, context);
    default:
      return assertUnreachable(representation);
  }
}
