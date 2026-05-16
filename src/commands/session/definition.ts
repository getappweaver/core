// ---------------------------------------------------------------------------
// src/commands/session/definition.ts — CommandDefinition for session
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getSessionAdoptSubcommandDefinition } from './adopt/definition';
import { getSessionAttachSubcommandDefinition } from './attach/definition';
import { getSessionListSubcommandDefinition } from './list/definition';
import { getSessionListNativeSubcommandDefinition } from './list-native/definition';
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
    summary:
      'Agent sessions: new, attach, adopt, resume, list, and inspect messages.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'session', {
        topicArgSummary:
          'Optional subcommand name such as new, attach, adopt, list, list-native, resume, or messages.',
        exampleTopics: [
          'new',
          'attach',
          'adopt',
          'list',
          'list-native',
          'resume',
          'messages',
        ],
      }),
      getSessionNewSubcommandDefinition(p),
      getSessionAttachSubcommandDefinition(p),
      getSessionAdoptSubcommandDefinition(p),
      getSessionResumeLastSubcommandDefinition(p),
      getSessionResumeSubcommandDefinition(p),
      getSessionListSubcommandDefinition(p),
      getSessionListNativeSubcommandDefinition(p),
      getSessionMessagesSubcommandDefinition(p),
    ],
  };
}
