import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type {
  CommandDefinition,
  SubcommandDefinition,
} from '@src/system/command-definition';

type GetRoutstrCommandDefinitionProps = {
  prefix: string;
};

function noArgsSubcommand(params: {
  name: string;
  summary: string;
  example: string;
}): SubcommandDefinition {
  return {
    name: params.name,
    summary: params.summary,
    aliases: [],
    arguments: [],
    options: [],
    examples: [params.example],
    webExecutionMode: 'runnable_default',
  };
}

export function getRoutstrCommandDefinition({
  prefix,
}: GetRoutstrCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'routstr',
    summary: 'Routstr deposits, balances, budgets, and model catalog.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'routstr', {
        topicArgSummary: 'Optional: status, deposit, balance, models, …',
        exampleTopics: ['status', 'deposit', 'models'],
      }),
      noArgsSubcommand({
        name: 'status',
        summary: 'Show Routstr provider status.',
        example: `${p}routstr status`,
      }),
      noArgsSubcommand({
        name: 'balance',
        summary: 'Show Routstr account balance.',
        example: `${p}routstr balance`,
      }),
      {
        name: 'deposit',
        summary: 'Deposit Cashu sats into Routstr.',
        aliases: [],
        arguments: [
          {
            name: 'sats',
            summary: 'Sats to deposit.',
            kind: 'integer',
            required: true,
            variadic: false,
          },
        ],
        options: [
          {
            name: 'new',
            summary: 'Create a new Routstr session instead of topping up.',
            flag: '--new',
            shortFlag: null,
            kind: 'boolean',
            required: false,
          },
          {
            name: 'mint',
            summary:
              'Wallet mint URL to deposit from. Defaults to selected wallet mint.',
            flag: '--mint',
            shortFlag: null,
            kind: 'string',
            required: false,
          },
        ],
        examples: [`${p}routstr deposit 100`, `${p}routstr deposit 100 --new`],
      },
      noArgsSubcommand({
        name: 'refund',
        summary: 'Refund remaining Routstr session funds.',
        example: `${p}routstr refund`,
      }),
      {
        name: 'budget',
        summary: 'Set per-request Routstr budget in millisats.',
        aliases: [],
        arguments: [
          {
            name: 'msats',
            summary: 'Budget in millisats.',
            kind: 'integer',
            required: true,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${p}routstr budget 100000`],
      },
      {
        name: 'models',
        summary: 'List cached Routstr models, optionally filtered.',
        aliases: [],
        arguments: [
          {
            name: 'filter',
            summary: 'Optional model id/name filter.',
            kind: 'string',
            required: false,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${p}routstr models`, `${p}routstr models kimi`],
        webExecutionMode: 'runnable_customizable',
      },
      noArgsSubcommand({
        name: 'sync-models',
        summary: 'Refresh the Routstr model catalog cache.',
        example: `${p}routstr sync-models`,
      }),
      {
        name: 'add-model',
        summary: 'Add a cached Routstr model to opencode.json.',
        aliases: [],
        arguments: [
          {
            name: 'model-id',
            summary: 'Routstr model id from the cached catalog.',
            kind: 'string',
            required: true,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${p}routstr add-model openai/gpt-4.1-mini`],
      },
    ],
  };
}
