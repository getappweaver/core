import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBunkerAddSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'add',
    summary: 'Connect and save a bunker signer.',
    aliases: [],
    arguments: [
      {
        name: 'name',
        summary: 'Connection name',
        kind: 'string',
        required: true,
        variadic: false,
      },
      {
        name: 'url',
        summary: 'bunker:// URL',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}bunker add mysigner bunker://...`],
  };
}
