import type { SubcommandDefinition } from '@src/system/command-definition';

function modelAction(name: 'favorite' | 'unfavorite'): SubcommandDefinition {
  return {
    name,
    summary: `${name === 'favorite' ? 'Add' : 'Remove'} a model ${name === 'favorite' ? 'to' : 'from'} favourites.`,
    aliases: [],
    arguments: [
      {
        name: 'model',
        summary: 'Model id',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [],
  };
}

export function getAiFavoriteSubcommandDefinition(): SubcommandDefinition {
  return modelAction('favorite');
}

export function getAiUnfavoriteSubcommandDefinition(): SubcommandDefinition {
  return modelAction('unfavorite');
}

export function getAiRecentLimitSubcommandDefinition(): SubcommandDefinition {
  return {
    name: 'recent-limit',
    summary: 'Set the recent successful-model limit.',
    aliases: [],
    arguments: [
      {
        name: 'limit',
        summary: 'Integer from 1 to 50',
        kind: 'string',
        required: true,
        variadic: false,
      },
    ],
    options: [],
    examples: [],
  };
}
