// ---------------------------------------------------------------------------
// src/commands/builtin/definitions/wot.ts
// ---------------------------------------------------------------------------

import { createHelpSubcommandDefinition } from '@src/commands/help/command';
import type { CommandDefinition } from '@src/system/command-definition';

type GetWotCommandDefinitionProps = {
  prefix: string;
};

export function getWotCommandDefinition({
  prefix,
}: GetWotCommandDefinitionProps): CommandDefinition {
  const p = prefix;

  return {
    name: 'wot',
    summary: 'Web of Trust: crawl, score, and stats.',
    aliases: [],
    subcommands: [
      createHelpSubcommandDefinition(prefix, 'wot', {
        topicArgSummary: 'Optional: crawl, score, stats.',
        exampleTopics: ['crawl', 'score', 'stats'],
      }),
      {
        name: 'crawl',
        summary: 'Crawl a root-relative WoT graph.',
        aliases: [],
        arguments: [
          {
            name: 'args',
            summary: 'Optional --pubkey, --depth',
            kind: 'string',
            required: false,
            variadic: true,
          },
        ],
        options: [],
        examples: [`${p}wot crawl`, `${p}wot crawl --depth 3`],
      },
      {
        name: 'score',
        summary: 'Inspect WoT score for a pubkey.',
        aliases: [],
        arguments: [
          {
            name: 'args',
            summary: 'pubkey/npub and optional of <pubkey>',
            kind: 'string',
            required: false,
            variadic: true,
          },
        ],
        options: [],
        examples: [`${p}wot score <npub>`],
      },
      {
        name: 'stats',
        summary: 'Show stored WoT graph stats for a root.',
        aliases: [],
        arguments: [
          {
            name: 'pubkey',
            summary: 'Optional root pubkey/npub',
            kind: 'string',
            required: false,
            variadic: false,
          },
        ],
        options: [],
        examples: [`${p}wot stats`, `${p}wot stats <npub>`],
      },
    ],
  };
}
