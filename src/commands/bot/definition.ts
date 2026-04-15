// ---------------------------------------------------------------------------
// src/commands/bot/definition.ts — CommandDefinition for bot (shell / workspace / lifecycle)
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getBotBrowserSubcommandDefinition } from './browser/definition';
import { getBotIdentitySubcommandDefinition } from './identity/definition';
import { getBotLintSubcommandDefinition } from './lint/definition';
import { getBotLogSubcommandDefinition } from './log/definition';
import { getBotPingSubcommandDefinition } from './ping/definition';
import { getBotPushSubcommandDefinition } from './push/definition';
import { getBotReadySubcommandDefinition } from './ready/definition';
import { getBotRestartSubcommandDefinition } from './restart/definition';
import { getBotStatusSubcommandDefinition } from './status/definition';
import { getBotVersionSubcommandDefinition } from './version/definition';
import { getBotWorkspaceSubcommandDefinition } from './workspace/definition';

type GetBotCommandDefinitionProps = {
  prefix: string;
};

export function getBotCommandDefinition({
  prefix,
}: GetBotCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'bot',
    summary:
      'Bot status, browser demo automation, identity, workspace, lint, logging, ready DM, Web Push test, and watch restart.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'bot', {
        topicArgSummary:
          'Optional subcommand: status, browser, workspace, lint, log, ready, restart, …',
        exampleTopics: ['browser', 'workspace', 'lint'],
      }),
      getBotStatusSubcommandDefinition(p),
      getBotBrowserSubcommandDefinition(p),
      getBotVersionSubcommandDefinition(p),
      getBotPingSubcommandDefinition(p),
      getBotIdentitySubcommandDefinition(p),
      getBotWorkspaceSubcommandDefinition(p),
      getBotLintSubcommandDefinition(p),
      getBotLogSubcommandDefinition(p),
      getBotReadySubcommandDefinition(p),
      getBotPushSubcommandDefinition(p),
      getBotRestartSubcommandDefinition(p),
    ],
  };
}
