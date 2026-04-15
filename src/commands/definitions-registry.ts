// ---------------------------------------------------------------------------
// src/commands/definitions-registry.ts — registry of builtin CommandDefinitions
// ---------------------------------------------------------------------------

import type { CommandDefinition } from '@src/system/command-definition';

import { getAiCommandDefinition } from './ai/definition';
import { getBotCommandDefinition } from './bot/definition';
import { getBunkerCommandDefinition } from './bunker/definition';
import { getSessionCommandDefinition } from './session/definition';
import { getWalletCommandDefinition } from './wallet/definition';
import { getWotCommandDefinition } from './wot/definition';

export const BUILTIN_ROOT_NAMES = [
  'help',
  'session',
  'bot',
  'ai',
  'wallet',
  'bunker',
  'wot',
] as const;

export type BuiltinRootName = (typeof BUILTIN_ROOT_NAMES)[number];

export function isBuiltinRootName(value: string): value is BuiltinRootName {
  return (BUILTIN_ROOT_NAMES as readonly string[]).includes(value);
}

function getHelpMetaCommandDefinition({
  prefix,
}: {
  prefix: string;
}): CommandDefinition {
  return {
    name: 'help',
    summary: `List commands and drill into usage. 
    
Examples: 

${prefix}help session [<subcommand>]
${prefix}session help [<subcommand>]

are all valid.\n`,
    aliases: [],
    subcommands: [
      {
        name: 'topic',
        summary: 'Command name and optional subcommand.',
        aliases: [],
        arguments: [
          {
            name: 'path',
            summary: 'e.g. session, session new, ai provider',
            kind: 'string',
            required: false,
            variadic: true,
          },
        ],
        options: [],
        examples: [
          `${prefix}help`,
          `${prefix}help bot`,
          `${prefix}help ai provider`,
        ],
      },
    ],
  };
}

type GetBuiltinCommandDefinitionProps = {
  root: BuiltinRootName;
  prefix: string;
};

export function getBuiltinCommandDefinition({
  root,
  prefix,
}: GetBuiltinCommandDefinitionProps): CommandDefinition {
  switch (root) {
    case 'help':
      return getHelpMetaCommandDefinition({ prefix });
    case 'session':
      return getSessionCommandDefinition({ prefix });
    case 'bot':
      return getBotCommandDefinition({ prefix });
    case 'ai':
      return getAiCommandDefinition({ prefix });
    case 'wallet':
      return getWalletCommandDefinition({ prefix });
    case 'bunker':
      return getBunkerCommandDefinition({ prefix });
    case 'wot':
      return getWotCommandDefinition({ prefix });
    default: {
      const _exhaustive: never = root;

      return _exhaustive;
    }
  }
}

export function getBuiltinDefinitionsMap({
  prefix,
}: {
  prefix: string;
}): Record<BuiltinRootName, CommandDefinition> {
  return {
    help: getHelpMetaCommandDefinition({ prefix }),
    session: getSessionCommandDefinition({ prefix }),
    bot: getBotCommandDefinition({ prefix }),
    ai: getAiCommandDefinition({ prefix }),
    wallet: getWalletCommandDefinition({ prefix }),
    bunker: getBunkerCommandDefinition({ prefix }),
    wot: getWotCommandDefinition({ prefix }),
  };
}
