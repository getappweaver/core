// ---------------------------------------------------------------------------
// src/commands/ai/definition.ts — CommandDefinition for ai
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getAiModelSubcommandDefinition } from './model/definition';
import {
  getAiFavoriteSubcommandDefinition,
  getAiRecentLimitSubcommandDefinition,
  getAiUnfavoriteSubcommandDefinition,
} from './model-source-definitions';
import { getAiModelsSubcommandDefinition } from './models/definition';

type GetAiCommandDefinitionProps = {
  prefix: string;
};

export function getAiCommandDefinition({
  prefix,
}: GetAiCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'ai',
    summary: 'Select and inspect models from the active model source.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'ai', {
        topicArgSummary:
          'Optional: source, model, models, favorite, unfavorite, recent-limit.',
        exampleTopics: ['source', 'model', 'models'],
      }),
      {
        name: 'source',
        summary:
          'Show installed model sources or activate one for this workspace.',
        aliases: [],
        arguments: [
          {
            name: 'source',
            summary: 'Model source alias (core, ppq) or provider ID',
            kind: 'string',
            required: false,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${p}ai source`, `${p}ai source ppq`, `${p}ai source core`],
      },
      getAiModelSubcommandDefinition(p),
      getAiModelsSubcommandDefinition(p),
      getAiFavoriteSubcommandDefinition(),
      getAiUnfavoriteSubcommandDefinition(),
      getAiRecentLimitSubcommandDefinition(),
      {
        name: 'runtime',
        summary:
          'Inspect or recover a managed OpenCode configuration transition.',
        aliases: [],
        arguments: [
          {
            name: 'action',
            summary: 'status, cancel, retry, or force-restart',
            kind: 'string',
            required: false,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${p}ai runtime status`, `${p}ai runtime retry`],
      },
    ],
  };
}
