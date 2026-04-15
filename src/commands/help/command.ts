import type {
  CommandDefinition,
  SubcommandDefinition,
} from '../../system/command-definition';
import type { ParsedCliInvocation } from '../../system/parser-cli';

import { buildCommandHelp } from './build';
import {
  createHelpRepresentation,
  type HelpRepresentation,
} from './representation';

function parseOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export type CreateHelpSubcommandDefinitionHints = {
  topicArgSummary: string;
  exampleTopics: string[];
};

export function createHelpSubcommandDefinition(
  prefix: string,
  alias: string,
  hints: CreateHelpSubcommandDefinitionHints | null,
): SubcommandDefinition {
  const topicArgSummary =
    hints !== null
      ? hints.topicArgSummary
      : 'Optional subcommand name such as list or start.';

  const exampleTopics =
    hints !== null ? hints.exampleTopics : ['list', 'start'];

  return {
    name: 'help',
    summary: `Show command help for ${alias} or one of its subcommands.`,
    aliases: [],
    arguments: [
      {
        name: 'topic',
        summary: topicArgSummary,
        kind: 'string',
        required: false,
        variadic: false,
      },
    ],
    options: [],
    examples: [
      `${prefix}${alias} help`,
      ...exampleTopics.map((t) => `${prefix}${alias} help ${t}`),
    ],
  };
}

export type BuildHelpSubcommandRepresentationResult =
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'success';
      representation: HelpRepresentation;
    };

export function buildHelpSubcommandRepresentation(params: {
  prefix: string;
  alias: string;
  command: CommandDefinition;
  parsed: ParsedCliInvocation;
}): BuildHelpSubcommandRepresentationResult {
  const result = buildCommandHelp({
    prefix: params.prefix,
    command: params.command,
    topic:
      parseOptionalString(params.parsed.arguments.topic)?.toLowerCase() ?? null,
  });

  if (result.type === 'error') {
    return result;
  }

  return {
    type: 'success',
    representation: createHelpRepresentation({
      command: params.alias,
      subcommand: 'help',
      data: result.data,
    }),
  };
}
