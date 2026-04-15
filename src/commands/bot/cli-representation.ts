import type { TextRenderContext } from '@src/system/render-context';
import { assertUnreachable } from '@src/utils';

import { renderBotIdentityCli } from './identity/renderers/cli';
import type { BotIdentityRepresentation } from './identity/representation';
import { renderBotLintCli } from './lint/renderers/cli';
import type { BotLintRepresentation } from './lint/representation';
import { renderBotLogCli } from './log/renderers/cli';
import type { BotLogRepresentation } from './log/representation';
import { renderBotPingCli } from './ping/renderers/cli';
import type { BotPingRepresentation } from './ping/representation';
import { renderBotReadyCli } from './ready/renderers/cli';
import type { BotReadyRepresentation } from './ready/representation';
import { renderBotStatusText } from './status/renderers/text';
import type { BotStatusRepresentation } from './status/representation';
import { renderBotVersionCli } from './version/renderers/cli';
import type { BotVersionRepresentation } from './version/representation';
import { renderBotWorkspaceCli } from './workspace/renderers/cli';
import type { BotWorkspaceRepresentation } from './workspace/representation';

export type BotCliRepresentation =
  | BotStatusRepresentation
  | BotVersionRepresentation
  | BotPingRepresentation
  | BotIdentityRepresentation
  | BotWorkspaceRepresentation
  | BotLintRepresentation
  | BotLogRepresentation
  | BotReadyRepresentation;

export function renderBotCli(
  representation: BotCliRepresentation,
  context: TextRenderContext,
): string {
  switch (representation.kind) {
    case 'bot.status':
      return renderBotStatusText(representation, context);
    case 'bot.version':
      return renderBotVersionCli(representation, context);
    case 'bot.ping':
      return renderBotPingCli(representation, context);
    case 'bot.identity':
      return renderBotIdentityCli(representation, context);
    case 'bot.workspace':
      return renderBotWorkspaceCli(representation, context);
    case 'bot.lint':
      return renderBotLintCli(representation, context);
    case 'bot.log':
      return renderBotLogCli(representation, context);
    case 'bot.ready':
      return renderBotReadyCli(representation, context);
    default:
      return assertUnreachable(representation);
  }
}
