import type { TextRenderContext } from '@src/system/render-context';
import { assertUnreachable } from '@src/utils';

import { renderAiModelCli } from './model/renderers/cli';
import type { AiModelRepresentation } from './model/representation';
import { renderAiModelsCli } from './models/renderers/cli';
import type { AiModelsRepresentation } from './models/representation';

export type AiCliRepresentation =
  AiModelRepresentation | AiModelsRepresentation;

export function renderAiCli(
  representation: AiCliRepresentation,
  context: TextRenderContext,
): string {
  switch (representation.kind) {
    case 'ai.model':
      return renderAiModelCli(representation, context);
    case 'ai.models':
      return renderAiModelsCli(representation, context);
    default:
      return assertUnreachable(representation);
  }
}
