import type { SubcommandDefinition } from '@src/system/command-definition';

export function getPluginsPublishSubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'publish',
    summary:
      'Publish the local plugin package version to the Nostr plugin catalog.',
    aliases: [],
    arguments: [
      {
        name: 'alias',
        summary: 'Installed plugin alias from plugins.json.',
        kind: 'string',
        required: true,
        variadic: false,
        choices: null,
      },
    ],
    options: [
      {
        name: 'signer',
        summary: 'Saved bunker connection used for a first publication.',
        flag: '--signer',
        shortFlag: null,
        kind: 'string',
        required: false,
      },
      {
        name: 'confirm',
        summary: 'Confirm the reviewed publication plan.',
        flag: '--confirm',
        shortFlag: null,
        kind: 'boolean',
        required: false,
      },
    ],
    examples: [
      `${prefix}plugins publish bm`,
      `${prefix}plugins publish translate --signer appweaver`,
    ],
  };
}
