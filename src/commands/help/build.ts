import type {
  CommandArgumentDefinition,
  CommandDefinition,
  CommandOptionDefinition,
  CommandValueKind,
  SubcommandDefinition,
} from '../../system/command-definition';

export type HelpArgument = {
  name: string;
  summary: string;
  kind: CommandValueKind;
  required: boolean;
  variadic: boolean;
};

export type HelpOption = {
  name: string;
  summary: string;
  flag: string;
  shortFlag: string | null;
  kind: CommandValueKind;
  required: boolean;
};

export type HelpSubcommandSummary = {
  name: string;
  summary: string;
  usage: string;
};

export type HelpCommandInfo = {
  name: string;
  summary: string;
};

export type HelpSubcommandDetail = {
  name: string;
  summary: string;
  details: string[];
  aliases: string[];
  arguments: HelpArgument[];
  options: HelpOption[];
  examples: string[];
};

export type CommandHelpOverview = {
  command: HelpCommandInfo;
  subcommands: HelpSubcommandSummary[];
  examples: string[];
};

export type SubcommandHelpView = {
  command: HelpCommandInfo;
  subcommand: HelpSubcommandDetail;
};

export type BuildCommandHelpResult =
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'success';
      data:
        | ({ view: 'command' } & CommandHelpOverview)
        | ({ view: 'subcommand' } & SubcommandHelpView);
    };

export function formatHelpArgumentUsage(
  argument: Pick<CommandArgumentDefinition, 'name' | 'required' | 'variadic'>,
): string {
  const variadic = argument.variadic === true;
  const required = argument.required === true;

  const value = variadic ? `<${argument.name}...>` : `<${argument.name}>`;

  return required ? value : `[${value}]`;
}

export function formatHelpOptionUsage(
  option: Pick<
    CommandOptionDefinition,
    'flag' | 'shortFlag' | 'name' | 'kind' | 'required'
  >,
): string {
  const hasShortFlag =
    typeof option.shortFlag === 'string' && option.shortFlag.length > 0;

  const labels = hasShortFlag
    ? `${option.flag}, ${option.shortFlag}`
    : option.flag;

  const value =
    option.kind === 'boolean' ? labels : `${labels} <${option.name}>`;

  return option.required ? value : `[${value}]`;
}

export function buildSubcommandUsage(subcommand: SubcommandDefinition): string {
  return [
    subcommand.name,
    ...subcommand.arguments.map(formatHelpArgumentUsage),
    ...subcommand.options.map(formatHelpOptionUsage),
  ].join(' ');
}

export function buildHelpArgument(
  argument: CommandArgumentDefinition,
): HelpArgument {
  return {
    name: argument.name,
    summary: argument.summary,
    kind: argument.kind,
    required: argument.required ?? false,
    variadic: argument.variadic ?? false,
  };
}

export function buildHelpOption(option: CommandOptionDefinition): HelpOption {
  return {
    name: option.name,
    summary: option.summary,
    flag: option.flag,
    shortFlag: option.shortFlag ?? null,
    kind: option.kind,
    required: option.required ?? false,
  };
}

export function buildHelpSubcommandSummary(
  subcommand: SubcommandDefinition,
): HelpSubcommandSummary {
  return {
    name: subcommand.name,
    summary: subcommand.summary,
    usage: buildSubcommandUsage(subcommand),
  };
}

export function buildHelpSubcommandDetail(
  subcommand: SubcommandDefinition,
): HelpSubcommandDetail {
  return {
    name: subcommand.name,
    summary: subcommand.summary,
    details: subcommand.details ?? [],
    aliases: subcommand.aliases,
    arguments: subcommand.arguments.map(buildHelpArgument),
    options: subcommand.options.map(buildHelpOption),
    examples: subcommand.examples,
  };
}

export function buildCommandHelpOverview(params: {
  prefix: string;
  command: CommandDefinition;
  examples?: string[];
}): CommandHelpOverview {
  const defaultExamples = (): string[] => {
    const lines = [`${params.prefix}${params.command.name} help`];

    const firstNonHelp = params.command.subcommands.find(
      (s) => s.name !== 'help',
    );

    if (firstNonHelp) {
      lines.push(
        `${params.prefix}${params.command.name} help ${firstNonHelp.name}`,
      );
    }

    return lines;
  };

  return {
    command: {
      name: params.command.name,
      summary: params.command.summary,
    },
    subcommands: params.command.subcommands
      .filter((subcommand) => subcommand.textHidden !== true)
      .map(buildHelpSubcommandSummary),
    examples: params.examples ?? defaultExamples(),
  };
}

export function buildSubcommandHelpView(params: {
  command: CommandDefinition;
  subcommand: SubcommandDefinition;
}): SubcommandHelpView {
  return {
    command: {
      name: params.command.name,
      summary: params.command.summary,
    },
    subcommand: buildHelpSubcommandDetail(params.subcommand),
  };
}

export function buildCommandHelp(params: {
  prefix: string;
  command: CommandDefinition;
  topic: string | null;
}): BuildCommandHelpResult {
  const topic = params.topic;

  if (topic === null) {
    return {
      type: 'success',
      data: {
        view: 'command',
        ...buildCommandHelpOverview({
          prefix: params.prefix,
          command: params.command,
        }),
      },
    };
  }

  const subcommand =
    params.command.subcommands.find(
      (candidate) =>
        candidate.name === topic || candidate.aliases.includes(topic),
    ) ?? null;

  if (!subcommand) {
    return {
      type: 'error',
      message: `No help topic found for: ${topic}`,
    };
  }

  return {
    type: 'success',
    data: {
      view: 'subcommand',
      ...buildSubcommandHelpView({
        command: params.command,
        subcommand,
      }),
    },
  };
}
