import type { TextRenderContext } from '@src/system/render-context';

import {
  getBuiltinCommandDefinition,
  type BuiltinRootName,
} from '../../definitions-registry';

import {
  buildCommandHelp,
  formatHelpArgumentUsage,
  formatHelpOptionUsage,
} from '../build';
import {
  createHelpRepresentation,
  type HelpRepresentation,
} from '../representation';

function indentLines(lines: string[]): string[] {
  return lines.map((line) => `  ${line}`);
}

function indentBlock(first: string, continuation: string): string[] {
  return [`  ${first}`, `     ${continuation}`];
}

export function renderHelpText(
  representation: HelpRepresentation,
  context: TextRenderContext,
): string {
  if (representation.data.view === 'command') {
    return [
      `${representation.data.command.name} - ${representation.data.command.summary}`,
      '',
      'USAGE',
      `  ${context.prefix}${representation.data.command.name} help [<topic>]`,
      '',
      'SUBCOMMANDS',
      ...representation.data.subcommands.flatMap((subcommand) =>
        indentBlock(
          `${subcommand.name} - ${subcommand.summary}`,
          `${context.prefix}${representation.data.command.name} ${subcommand.usage}`,
        ),
      ),
      '',
      'EXAMPLES',
      ...indentLines(representation.data.examples),
    ].join('\n');
  }

  const subcommand = representation.data.subcommand;

  const usage = [
    `${context.prefix}${representation.data.command.name}`,
    subcommand.name,
    ...subcommand.arguments.map(formatHelpArgumentUsage),
    ...subcommand.options.map(formatHelpOptionUsage),
  ].join(' ');

  const lines = [
    `${representation.data.command.name} ${subcommand.name} - ${subcommand.summary}`,
    '',
    'USAGE',
    `  ${usage}`,
  ];

  if (subcommand.aliases.length > 0) {
    lines.push('', 'ALIASES', ...indentLines(subcommand.aliases));
  }

  if (subcommand.arguments.length > 0) {
    lines.push(
      '',
      'ARGUMENTS',
      ...indentLines(
        subcommand.arguments.map(
          (argument) =>
            `${formatHelpArgumentUsage(argument)} (${argument.kind}) - ${argument.summary}`,
        ),
      ),
    );
  }

  if (subcommand.options.length > 0) {
    lines.push(
      '',
      'OPTIONS',
      ...indentLines(
        subcommand.options.map(
          (option) =>
            `${formatHelpOptionUsage(option)} (${option.kind}) - ${option.summary}`,
        ),
      ),
    );
  }

  if ((subcommand.details?.length ?? 0) > 0) {
    lines.push('', 'DETAILS', ...indentLines(subcommand.details ?? []));
  }

  if (subcommand.examples.length > 0) {
    lines.push('', 'EXAMPLES', ...indentLines(subcommand.examples));
  }

  return lines.join('\n');
}

type RenderBuiltinHelpTextProps = {
  prefix: string;
  root: BuiltinRootName;
  topic: string | null;
};

export function renderBuiltinHelpText({
  prefix,
  root,
  topic,
}: RenderBuiltinHelpTextProps): string {
  const command = getBuiltinCommandDefinition({ root, prefix });

  const result = buildCommandHelp({
    prefix,
    command,
    topic,
  });

  if (result.type === 'error') {
    return result.message;
  }

  const representation = createHelpRepresentation({
    command: root,
    subcommand: 'help',
    data: result.data,
  });

  return renderHelpText(representation, { prefix });
}
