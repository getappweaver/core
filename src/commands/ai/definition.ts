// ---------------------------------------------------------------------------
// src/commands/ai/definition.ts — CommandDefinition for ai
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getAiBackendSubcommandDefinition } from './backend/definition';
import { getAiModeSubcommandDefinition } from './mode/definition';
import { getAiModelSubcommandDefinition } from './model/definition';
import { getAiModelsSubcommandDefinition } from './models/definition';
import { getAiProviderSubcommandDefinition } from './provider/definition';

type GetAiCommandDefinitionProps = {
  prefix: string;
};

export function getAiCommandDefinition({
  prefix,
}: GetAiCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'ai',
    summary: 'Agent mode, backend, models, and payment provider (Routstr).',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'ai', {
        topicArgSummary: 'Optional: mode, backend, model, models, provider.',
        exampleTopics: ['mode', 'backend', 'model', 'provider'],
      }),
      getAiModeSubcommandDefinition(p),
      getAiBackendSubcommandDefinition(p),
      getAiModelSubcommandDefinition(p),
      getAiModelsSubcommandDefinition(p),
      getAiProviderSubcommandDefinition(p),
    ],
  };
}
