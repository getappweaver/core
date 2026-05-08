// ---------------------------------------------------------------------------
// src/commands/ai/definition.ts — CommandDefinition for ai
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

import { getAiAgentDeleteSubcommandDefinition } from './agent/delete/definition';
import { getAiAgentEditSubcommandDefinition } from './agent/edit/definition';
import { getAiAgentModalSubcommandDefinition } from './agent/modal/definition';
import { getAiAgentNewSubcommandDefinition } from './agent/new/definition';
import { getAiAgentRestoreSubcommandDefinition } from './agent/restore/definition';
import { getAiAgentSaveSubcommandDefinition } from './agent/save/definition';
import { getAiAgentSetSubcommandDefinition } from './agent/set/definition';
import { getAiAgentUpsertJsonSubcommandDefinition } from './agent/upsert-json/definition';
import { getAiBackendSubcommandDefinition } from './backend/definition';
import { getAiModeSubcommandDefinition } from './mode/definition';
import { getAiModelSubcommandDefinition } from './model/definition';
import { getAiModelsSubcommandDefinition } from './models/definition';
import { getAiProviderSubcommandDefinition } from './provider/definition';
import { getAiRootModelSubcommandDefinition } from './root-model/definition';

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
        topicArgSummary:
          'Optional: mode, backend, model, models, provider, agents.',
        exampleTopics: ['mode', 'backend', 'model', 'agents', 'provider'],
      }),
      getAiModeSubcommandDefinition(p),
      getAiBackendSubcommandDefinition(p),
      getAiModelSubcommandDefinition(p),
      getAiModelsSubcommandDefinition(p),
      getAiAgentModalSubcommandDefinition(p),
      getAiAgentNewSubcommandDefinition(p),
      getAiAgentEditSubcommandDefinition(p),
      getAiAgentDeleteSubcommandDefinition(p),
      getAiAgentUpsertJsonSubcommandDefinition(p),
      getAiAgentSaveSubcommandDefinition(p),
      getAiAgentSetSubcommandDefinition(p),
      getAiAgentRestoreSubcommandDefinition(p),
      getAiRootModelSubcommandDefinition(p),
      getAiProviderSubcommandDefinition(p),
    ],
  };
}
