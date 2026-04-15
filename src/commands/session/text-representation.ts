import type { TextRenderContext } from '@src/system/render-context';
import { assertUnreachable } from '@src/utils';

import { renderSessionAttachText } from './attach/renderers/text';
import type { SessionAttachRepresentation } from './attach/representation';
import { renderSessionListText } from './list/renderers/text';
import type { SessionListRepresentation } from './list/representation';
import { renderSessionMessagesText } from './messages/renderers/text';
import type { SessionMessagesRepresentation } from './messages/representation';
import { renderSessionNewText } from './new/renderers/text';
import type { SessionNewRepresentation } from './new/representation';
import { renderSessionResumeText } from './resume/renderers/text';
import type { SessionResumeRepresentation } from './resume/representation';
import { renderSessionResumeLastText } from './resume-last/renderers/text';
import type { SessionResumeLastRepresentation } from './resume-last/representation';
import { renderSessionUsageText } from './usage/renderers/text';
import type { SessionUsageRepresentation } from './usage/representation';

export type SessionTextRepresentation =
  | SessionUsageRepresentation
  | SessionAttachRepresentation
  | SessionNewRepresentation
  | SessionResumeLastRepresentation
  | SessionResumeRepresentation
  | SessionListRepresentation
  | SessionMessagesRepresentation;

export function renderSessionText(
  representation: SessionTextRepresentation,
  context: TextRenderContext,
): string {
  switch (representation.kind) {
    case 'session.usage':
      return renderSessionUsageText(representation, context);
    case 'session.attach':
      return renderSessionAttachText(representation, context);
    case 'session.new':
      return renderSessionNewText(representation, context);
    case 'session.resume-last':
      return renderSessionResumeLastText(representation, context);
    case 'session.resume':
      return renderSessionResumeText(representation, context);
    case 'session.list':
      return renderSessionListText(representation, context);
    case 'session.messages':
      return renderSessionMessagesText(representation, context);
    default:
      return assertUnreachable(representation);
  }
}
