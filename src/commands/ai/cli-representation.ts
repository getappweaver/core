import type { TextRenderContext } from '@src/system/render-context';
import { assertUnreachable } from '@src/utils';

import { renderAiBackendCli } from './backend/renderers/cli';
import type { AiBackendRepresentation } from './backend/representation';
import { renderAiModeCli } from './mode/renderers/cli';
import type { AiModeRepresentation } from './mode/representation';
import { renderAiModelCli } from './model/renderers/cli';
import type { AiModelRepresentation } from './model/representation';
import { renderAiModelsCli } from './models/renderers/cli';
import type { AiModelsRepresentation } from './models/representation';

export type AiCliRepresentation =
  | AiModeRepresentation
  | AiBackendRepresentation
  | AiModelRepresentation
  | AiModelsRepresentation;

export function renderAiCli(
  representation: AiCliRepresentation,
  context: TextRenderContext,
): string {
  switch (representation.kind) {
    case 'ai.mode':
      return renderAiModeCli(representation, context);
    case 'ai.backend':
      return renderAiBackendCli(representation, context);
    case 'ai.model':
      return renderAiModelCli(representation, context);
    case 'ai.models':
      return renderAiModelsCli(representation, context);
    default:
      return assertUnreachable(representation);
  }
}
