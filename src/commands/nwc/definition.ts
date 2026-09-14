import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type {
  CommandDefinition,
  SubcommandDefinition,
} from '@src/system/command-definition';

function selectorSubcommand(
  prefix: string,
  name: 'info' | 'balance' | 'remove',
  summary: string,
): SubcommandDefinition {
  return {
    name,
    summary,
    aliases: name === 'info' ? ['test'] : name === 'remove' ? ['delete'] : [],
    arguments: [
      {
        name: 'connection',
        summary: 'Connection ID or label. Optional when exactly one exists.',
        kind: 'string',
        choices: null,
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${prefix}nwc ${name}`, `${prefix}nwc ${name} personal`],
  };
}

export function getNwcCommandDefinition({
  prefix,
}: {
  prefix: string;
}): CommandDefinition {
  return {
    name: 'nwc',
    summary: 'Manage Nostr Wallet Connect connections.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'nwc', {
        topicArgSummary:
          'Optional: list, add, info, balance, pay, rename, or remove.',
        exampleTopics: ['list', 'info', 'balance', 'pay'],
      }),
      {
        name: 'list',
        summary: 'List and manage NWC connections.',
        aliases: [],
        arguments: [],
        options: [],
        examples: [`${prefix}nwc list`],
        webExecutionMode: 'runnable_default',
      },
      {
        name: 'add',
        summary: 'Open the secure web form for adding an NWC connection.',
        aliases: [],
        arguments: [],
        options: [],
        examples: [`${prefix}nwc add`],
        webExecutionMode: 'runnable_default',
      },
      {
        name: 'save',
        summary: 'Save an NWC connection submitted by the core web form.',
        textHidden: true,
        aliases: [],
        arguments: [],
        options: [],
        examples: [],
        webExecutionMode: 'runnable_default',
      },
      selectorSubcommand(
        prefix,
        'info',
        'Connect and show wallet identity and supported methods.',
      ),
      selectorSubcommand(prefix, 'balance', 'Show an NWC wallet balance.'),
      {
        name: 'pay',
        summary: 'Pay a BOLT-11 invoice through core confirmation.',
        aliases: [],
        arguments: [
          {
            name: 'invoice',
            summary: 'BOLT-11 invoice to pay.',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${prefix}nwc pay <bolt11-invoice>`],
      },
      {
        name: 'rename',
        summary: 'Rename a saved NWC connection.',
        aliases: [],
        arguments: [
          {
            name: 'connection',
            summary: 'Connection ID or current label.',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
          },
          {
            name: 'label',
            summary: 'New connection label.',
            kind: 'string',
            choices: null,
            required: true,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${prefix}nwc rename personal spending`],
      },
      selectorSubcommand(prefix, 'remove', 'Remove an NWC connection.'),
    ],
  };
}
