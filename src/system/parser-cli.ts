import { z } from 'zod';

import {
  type CommandDefinition,
  type CommandArgumentDefinition,
  type CommandOptionDefinition,
  type CommandValueKind,
  getSubcommandDefinition,
} from './command-definition';

const ParsedCliScalarValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
]);

const ParsedCliValueSchema = z.union([
  ParsedCliScalarValueSchema,
  z.array(ParsedCliScalarValueSchema),
]);

export const ParsedCliInvocationSchema = z.object({
  command: z.string().min(1),
  subcommand: z.string().min(1),
  arguments: z.record(z.string(), ParsedCliValueSchema),
  options: z.record(z.string(), ParsedCliValueSchema),
  raw: z.object({
    input: z.string(),
    tokens: z.array(z.string()),
  }),
});

export type ParsedCliInvocation = z.infer<typeof ParsedCliInvocationSchema>;
type ParsedCliValue = z.infer<typeof ParsedCliValueSchema>;

type ParseCliInputProps = {
  command: CommandDefinition;
  tokens: string[];
  rawInput?: string;
};

type ParseStructuredInputProps = {
  command: CommandDefinition;
  subcommand: string;
  arguments: Record<string, unknown>;
  options: Record<string, unknown>;
  rawInput?: string;
};

function parseValue(
  kind: CommandValueKind,
  raw: string,
): string | number | boolean {
  switch (kind) {
    case 'string':
      return raw;
    case 'integer': {
      const parsed = parseInt(raw, 10);

      if (Number.isNaN(parsed)) {
        throw new Error(`Expected integer but got: ${raw}`);
      }

      return parsed;
    }

    case 'boolean': {
      if (raw === 'true') {
        return true;
      }

      if (raw === 'false') {
        return false;
      }

      throw new Error(`Expected boolean but got: ${raw}`);
    }
  }
}

function parseStructuredValue(
  kind: CommandValueKind,
  value: unknown,
): string | number | boolean {
  switch (kind) {
    case 'string':
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return String(value);
      }

      throw new Error(`Expected string but got: ${String(value)}`);
    case 'integer': {
      if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
      }

      if (typeof value === 'string') {
        return parseValue(kind, value);
      }

      throw new Error(`Expected integer but got: ${String(value)}`);
    }

    case 'boolean': {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        return parseValue(kind, value);
      }

      throw new Error(`Expected boolean but got: ${String(value)}`);
    }
  }
}

function consumeOptionValue(
  option: CommandOptionDefinition,
  tokens: string[],
  index: number,
): { value: string | number | boolean; nextIndex: number } {
  if (option.kind === 'boolean') {
    return { value: true, nextIndex: index };
  }

  const raw = tokens[index + 1];

  if (raw === undefined) {
    const label =
      option.shortFlag !== null
        ? `${option.flag} (${option.shortFlag})`
        : option.flag;

    throw new Error(`Missing value for option ${label}`);
  }

  return {
    value: parseValue(option.kind, raw),
    nextIndex: index + 1,
  };
}

function assignPositionalArgument(
  definition: CommandArgumentDefinition,
  values: string[],
): string | number | boolean | Array<string | number | boolean> {
  if (definition.variadic === true) {
    return values.map((value) => parseValue(definition.kind, value));
  }

  return parseValue(definition.kind, values[0]!);
}

function matchesOptionToken(
  option: CommandOptionDefinition,
  token: string,
): boolean {
  return (
    option.flag === token ||
    (option.shortFlag !== null && option.shortFlag === token)
  );
}

function assignOptionValue(
  parsedOptions: Record<string, ParsedCliValue>,
  option: CommandOptionDefinition,
  value: string | number | boolean,
): void {
  if (option.multiple !== true) {
    parsedOptions[option.name] = value;

    return;
  }

  const existing = parsedOptions[option.name];

  if (existing === undefined) {
    parsedOptions[option.name] = [value];

    return;
  }

  parsedOptions[option.name] = Array.isArray(existing)
    ? [...existing, value]
    : [existing, value];
}

function assignStructuredArgument(
  definition: CommandArgumentDefinition,
  value: unknown,
): ParsedCliValue {
  if (definition.variadic === true) {
    const values = Array.isArray(value) ? value : [value];

    return values.map((item) => parseStructuredValue(definition.kind, item));
  }

  return parseStructuredValue(definition.kind, value);
}

function assignStructuredOption(
  definition: CommandOptionDefinition,
  value: unknown,
): ParsedCliValue {
  if (definition.multiple === true) {
    const values = Array.isArray(value) ? value : [value];

    return values.map((item) => parseStructuredValue(definition.kind, item));
  }

  return parseStructuredValue(definition.kind, value);
}

function assertKnownKeys(props: {
  kind: 'argument' | 'option';
  commandName: string;
  subcommandName: string;
  values: Record<string, unknown>;
  knownNames: Set<string>;
}): void {
  for (const key of Object.keys(props.values)) {
    if (!props.knownNames.has(key)) {
      throw new Error(
        `Unknown ${props.kind} for ${props.commandName} ${props.subcommandName}: ${key}`,
      );
    }
  }
}

function shouldSkipStructuredValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function parseStructuredInput({
  command,
  subcommand: subcommandName,
  arguments: inputArguments,
  options: inputOptions,
  rawInput,
}: ParseStructuredInputProps): ParsedCliInvocation {
  const subcommand = getSubcommandDefinition(command, subcommandName);

  if (!subcommand) {
    throw new Error(
      `Unknown subcommand for ${command.name}: ${subcommandName}`,
    );
  }

  assertKnownKeys({
    kind: 'argument',
    commandName: command.name,
    subcommandName: subcommand.name,
    values: inputArguments,
    knownNames: new Set(subcommand.arguments.map((argument) => argument.name)),
  });

  assertKnownKeys({
    kind: 'option',
    commandName: command.name,
    subcommandName: subcommand.name,
    values: inputOptions,
    knownNames: new Set(subcommand.options.map((option) => option.name)),
  });

  const parsedArguments: Record<string, ParsedCliValue> = {};

  for (const argument of subcommand.arguments) {
    const value = inputArguments[argument.name];

    if (shouldSkipStructuredValue(value)) {
      if (argument.required === true) {
        throw new Error(`Missing required argument: ${argument.name}`);
      }

      continue;
    }

    parsedArguments[argument.name] = assignStructuredArgument(argument, value);
  }

  const parsedOptions: Record<string, ParsedCliValue> = {};

  for (const option of subcommand.options) {
    const value = inputOptions[option.name];

    if (option.kind === 'boolean') {
      if (value === true || value === 'true' || value === '1') {
        parsedOptions[option.name] = true;
        continue;
      }

      if (option.required === true) {
        throw new Error(`Missing required option: ${option.flag}`);
      }

      continue;
    }

    if (shouldSkipStructuredValue(value)) {
      if (option.required === true) {
        throw new Error(`Missing required option: ${option.flag}`);
      }

      continue;
    }

    parsedOptions[option.name] = assignStructuredOption(option, value);
  }

  return ParsedCliInvocationSchema.parse({
    command: command.name,
    subcommand: subcommand.name,
    arguments: parsedArguments,
    options: parsedOptions,
    raw: {
      input: rawInput ?? `${command.name} ${subcommand.name} (structured)`,
      tokens: [command.name, subcommand.name],
    },
  });
}

export function parseCliInput({
  command,
  tokens: inputTokens,
  rawInput,
}: ParseCliInputProps): ParsedCliInvocation {
  const subcommandToken = inputTokens[0];

  if (!subcommandToken) {
    throw new Error(`Missing subcommand for command: ${command.name}`);
  }

  const subcommand = getSubcommandDefinition(command, subcommandToken);

  if (!subcommand) {
    throw new Error(
      `Unknown subcommand for ${command.name}: ${subcommandToken}`,
    );
  }

  const parsedOptions: Record<string, ParsedCliValue> = {};
  const positionalTokens: string[] = [];
  const subcommandTokens = inputTokens.slice(1);

  for (let index = 0; index < subcommandTokens.length; index++) {
    const token = subcommandTokens[index]!;

    if (token === '--') {
      positionalTokens.push(...subcommandTokens.slice(index + 1));
      break;
    }

    if (token.startsWith('-')) {
      const option = subcommand.options.find((item) =>
        matchesOptionToken(item, token),
      );

      if (!option) {
        throw new Error(
          `Unknown option for ${command.name} ${subcommand.name}: ${token}`,
        );
      }

      const { value, nextIndex } = consumeOptionValue(
        option,
        subcommandTokens,
        index,
      );

      assignOptionValue(parsedOptions, option, value);
      index = nextIndex;
      continue;
    }

    positionalTokens.push(token);
  }

  const parsedArguments: Record<string, ParsedCliValue> = {};
  let positionalIndex = 0;

  for (const argument of subcommand.arguments) {
    if (argument.variadic === true) {
      const rest = positionalTokens.slice(positionalIndex);

      if (argument.required === true && rest.length === 0) {
        throw new Error(`Missing required argument: ${argument.name}`);
      }

      if (rest.length > 0) {
        parsedArguments[argument.name] = assignPositionalArgument(
          argument,
          rest,
        );
      }

      positionalIndex = positionalTokens.length;
      continue;
    }

    const raw = positionalTokens[positionalIndex];

    if (raw === undefined) {
      if (argument.required === true) {
        throw new Error(`Missing required argument: ${argument.name}`);
      }

      continue;
    }

    try {
      parsedArguments[argument.name] = assignPositionalArgument(argument, [
        raw,
      ]);

      positionalIndex++;
    } catch (err) {
      if (argument.required === true) {
        throw err;
      }
    }
  }

  if (positionalIndex < positionalTokens.length) {
    throw new Error(
      `Too many arguments for ${command.name} ${subcommand.name}: ${positionalTokens.slice(positionalIndex).join(' ')}`,
    );
  }

  for (const option of subcommand.options) {
    if (option.required === true && parsedOptions[option.name] === undefined) {
      const label =
        option.shortFlag !== null
          ? `${option.flag} (${option.shortFlag})`
          : option.flag;

      throw new Error(`Missing required option: ${label}`);
    }
  }

  return ParsedCliInvocationSchema.parse({
    command: command.name,
    subcommand: subcommand.name,
    arguments: parsedArguments,
    options: parsedOptions,
    raw: {
      input: rawInput ?? [command.name, ...inputTokens].join(' '),
      tokens: [command.name, ...inputTokens],
    },
  });
}
