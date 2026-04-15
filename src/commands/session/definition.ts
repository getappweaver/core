// ---------------------------------------------------------------------------
// src/commands/session/definition.ts — CommandDefinition for session
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getSessionAttachSubcommandDefinition } from './attach/definition';
import { getSessionListSubcommandDefinition } from './list/definition';
import { getSessionMessagesSubcommandDefinition } from './messages/definition';
import { getSessionNewSubcommandDefinition } from './new/definition';
import { getSessionResumeSubcommandDefinition } from './resume/definition';
import { getSessionResumeLastSubcommandDefinition } from './resume-last/definition';

type GetSessionCommandDefinitionProps = {
  prefix: string;
};

export function getSessionCommandDefinition({
  prefix,
}: GetSessionCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'session',
    summary: 'Agent sessions: new, attach, resume, list, and inspect messages.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'session', {
        topicArgSummary:
          'Optional subcommand name such as new, attach, list, resume, or messages.',
        exampleTopics: ['new', 'attach', 'list', 'resume', 'messages'],
      }),
      getSessionNewSubcommandDefinition(p),
      getSessionAttachSubcommandDefinition(p),
      getSessionResumeLastSubcommandDefinition(p),
      getSessionResumeSubcommandDefinition(p),
      getSessionListSubcommandDefinition(p),
      getSessionMessagesSubcommandDefinition(p),
    ],
  };
}
