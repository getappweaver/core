import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBunkerDeleteSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  const p = prefix;

  return {
    name: 'delete',
    summary: 'Delete a saved bunker signer connection.',
    aliases: ['remove', 'rm'],
    arguments: [
      {
        name: 'name',
        summary: 'Connection name',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [`${p}bunker delete mysigner`],
  };
}
