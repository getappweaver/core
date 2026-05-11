// ---------------------------------------------------------------------------
// src/commands/shared/with-status.ts — append status block after command output
// ---------------------------------------------------------------------------

import type { WebHandlerResult } from '@src/web/ui-schema';
import { row, stack, textBlock, textNode } from '@src/web/widgets';

import { renderBotStatusText } from '../bot/status/renderers/text';
import { createBotStatusRepresentation } from '../bot/status/representation';
import type { RouteCommandContext } from '../dispatch';

export function statusPropsFromContext(ctx: RouteCommandContext) {
  return {
    botRelayUrls: ctx.botRelayUrls,
    seenDb: ctx.seenDb,
    version: ctx.version,
    dmBotRoot: ctx.dmBotRoot,
    parentOfBotRoot: ctx.parentOfBotRoot,
    attachUrl: ctx.attachUrl,
  };
}

export async function appendStatusBlock(
  ctx: RouteCommandContext,
  body: string,
): Promise<WebHandlerResult> {
  if (ctx.source === 'web') {
    return {
      kind: 'ui',
      version: 1,
      meta: {
        command: ctx.cmd,
        subcommand: ctx.args[0] ?? 'status',
      },
      tree: stack(
        [
          textBlock(body),
          row(
            [
              textNode('Click '),
              {
                type: 'element',
                tag: 'button',
                props: {
                  label: 'here',
                  className: 'web-button--link',
                  action: {
                    type: 'command',
                    command: 'bot',
                    subcommand: 'status',
                    arguments: {},
                    options: {},
                    surface: 'modal',
                    modalTitle: 'Bot Status',
                  },
                },
              },
              textNode(' to see bot status information.'),
            ],
            'xs',
          ),
        ],
        'sm',
      ),
    };
  }

  const rep = createBotStatusRepresentation(statusPropsFromContext(ctx));
  const status = renderBotStatusText(rep, { prefix: ctx.prefix });

  return `${body}\n\n${status}`;
}
