import type { TextRenderContext } from '@src/system/render-context';
import { assertUnreachable } from '@src/utils';

import { renderBunkerAddCli } from './add/renderers/cli';
import type { BunkerAddRepresentation } from './add/representation';
import { renderBunkerListCli } from './list/renderers/cli';
import type { BunkerListRepresentation } from './list/representation';
import { renderBunkerUsageCli } from './usage/renderers/cli';
import type { BunkerUsageRepresentation } from './usage/representation';

export type BunkerCliRepresentation =
  | BunkerUsageRepresentation
  | BunkerListRepresentation
  | BunkerAddRepresentation;

export function renderBunkerCli(
  representation: BunkerCliRepresentation,
  context: TextRenderContext,
): string {
  switch (representation.kind) {
    case 'bunker.usage':
      return renderBunkerUsageCli(representation, context);
    case 'bunker.list':
      return renderBunkerListCli(representation, context);
    case 'bunker.add':
      return renderBunkerAddCli(representation, context);
    default:
      return assertUnreachable(representation);
  }
}
