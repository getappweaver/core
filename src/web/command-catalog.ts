// ---------------------------------------------------------------------------
// src/web/command-catalog.ts — builtin command metadata for HTTP discovery
// ---------------------------------------------------------------------------

import {
  BUILTIN_ROOT_NAMES,
  getBuiltinDefinitionsMap,
  getBuiltinCommandDefinition,
  isBuiltinRootName,
} from '@src/commands/definitions-registry';
import { buildSubcommandUsage } from '@src/commands/help/build';
import type { BotPlugin } from '@src/core/plugin';
import { getPluginByAlias, listRegisteredPlugins } from '@src/core/registry';
import type {
  CommandArgumentDefinition,
  CommandDefinition,
  CommandOptionDefinition,
  SubcommandDefinition,
  WebHeaderWidget,
} from '@src/system/command-definition';

export type InferredWebExecutionMode =
  | 'requires_input'
  | 'runnable_default'
  | 'runnable_customizable';

export type InferredWebSupport = {
  generated: true;
  executionMode: InferredWebExecutionMode;
};

export type WebCommandArgument = CommandArgumentDefinition;
export type WebCommandOption = CommandOptionDefinition;

export type WebSubcommandDetail = {
  name: string;
  summary: string;
  usage: string;
  aliases: string[];
  arguments: WebCommandArgument[];
  options: WebCommandOption[];
  examples: string[];
  inferredWeb: InferredWebSupport;
  webHeaderWidget?: WebHeaderWidget;
};

export type WebCommandDetail = {
  name: string;
  summary: string;
  aliases: string[];
  subcommands: WebSubcommandDetail[];
};

export type WebCommandListEntry = {
  name: string;
  summary: string;
  aliases: string[];
  source: 'builtin' | 'plugin';
};

/** Full command + subcommands (same shape as GET /api/commands/:name) for bulk list. */
export type WebCommandListItem = WebCommandDetail & {
  source: 'builtin' | 'plugin';
};

function hasRequiredInputs(subcommand: SubcommandDefinition): boolean {
  return (
    subcommand.arguments.some((arg) => arg.required === true) ||
    subcommand.options.some((opt) => opt.required === true)
  );
}

function hasAnyInputs(subcommand: SubcommandDefinition): boolean {
  return subcommand.arguments.length > 0 || subcommand.options.length > 0;
}

export function inferWebExecutionMode(
  subcommand: SubcommandDefinition,
): InferredWebExecutionMode {
  if (hasRequiredInputs(subcommand)) {
    return 'requires_input';
  }

  if (!hasAnyInputs(subcommand)) {
    return 'runnable_default';
  }

  return 'runnable_customizable';
}

function serializeSubcommandForWeb(
  subcommand: SubcommandDefinition,
): WebSubcommandDetail {
  const base: WebSubcommandDetail = {
    name: subcommand.name,
    summary: subcommand.summary,
    usage: buildSubcommandUsage(subcommand),
    aliases: subcommand.aliases,
    arguments: subcommand.arguments,
    options: subcommand.options,
    examples: subcommand.examples,
    inferredWeb: {
      generated: true,
      executionMode: inferWebExecutionMode(subcommand),
    },
  };

  if (subcommand.webHeaderWidget !== undefined) {
    return { ...base, webHeaderWidget: subcommand.webHeaderWidget };
  }

  return base;
}

function serializeCommandForWeb(def: CommandDefinition): WebCommandDetail {
  return {
    name: def.name,
    summary: def.summary,
    aliases: def.aliases,
    subcommands: def.subcommands.map(serializeSubcommandForWeb),
  };
}

function resolvePluginCommandDefinition(
  plugin: BotPlugin,
  prefix: string,
): CommandDefinition | null {
  if (!plugin.commandDefinition) {
    return null;
  }

  return typeof plugin.commandDefinition === 'function'
    ? plugin.commandDefinition(prefix, plugin.identity.alias)
    : plugin.commandDefinition;
}

export function listCommandsForWeb(prefix: string): WebCommandListEntry[] {
  const map = getBuiltinDefinitionsMap({ prefix });

  const builtins = BUILTIN_ROOT_NAMES.map((root) => {
    const def = map[root];

    return {
      name: def.name,
      summary: def.summary,
      aliases: def.aliases,
      source: 'builtin' as const,
    };
  });

  const plugins = listRegisteredPlugins()
    .map((plugin) => ({
      definition: resolvePluginCommandDefinition(plugin, prefix),
    }))
    .filter(
      (item): item is { definition: CommandDefinition } =>
        item.definition !== null,
    )
    .map(({ definition }) => ({
      name: definition.name,
      summary: definition.summary,
      aliases: definition.aliases,
      source: 'plugin' as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...builtins, ...plugins];
}

/**
 * All commands with subcommand metadata in one array (for GET /api/commands).
 */
export function listAllCommandsDetailForWeb(
  prefix: string,
): WebCommandListItem[] {
  const map = getBuiltinDefinitionsMap({ prefix });

  const builtins = BUILTIN_ROOT_NAMES.map((root) => {
    const def = map[root];

    return {
      ...serializeCommandForWeb(def),
      source: 'builtin' as const,
    };
  });

  const plugins = listRegisteredPlugins()
    .map((plugin) => ({
      definition: resolvePluginCommandDefinition(plugin, prefix),
    }))
    .filter(
      (item): item is { definition: CommandDefinition } =>
        item.definition !== null,
    )
    .map(({ definition }) => ({
      ...serializeCommandForWeb(definition),
      source: 'plugin' as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...builtins, ...plugins];
}

function matchesCommandNameInsensitive(
  definition: CommandDefinition,
  token: string,
): boolean {
  const t = token.toLowerCase();

  const aliases = definition.aliases;

  return (
    definition.name.toLowerCase() === t ||
    aliases.some((a) => a.toLowerCase() === t)
  );
}

/** Resolve by primary name or alias (case-insensitive). */
export function getCommandDetailForWeb(
  prefix: string,
  nameParam: string,
): WebCommandDetail | null {
  const map = getBuiltinDefinitionsMap({ prefix });

  for (const root of BUILTIN_ROOT_NAMES) {
    const def = map[root];

    if (matchesCommandNameInsensitive(def, nameParam)) {
      return serializeCommandForWeb(def);
    }
  }

  for (const plugin of listRegisteredPlugins()) {
    const def = resolvePluginCommandDefinition(plugin, prefix);

    if (def && matchesCommandNameInsensitive(def, nameParam)) {
      return serializeCommandForWeb(def);
    }
  }

  return null;
}

export function getCommandDefinitionForWeb(
  prefix: string,
  nameParam: string,
): CommandDefinition | null {
  const normalized = nameParam.toLowerCase();

  if (isBuiltinRootName(normalized)) {
    return getBuiltinCommandDefinition({ root: normalized, prefix });
  }

  const map = getBuiltinDefinitionsMap({ prefix });

  for (const root of BUILTIN_ROOT_NAMES) {
    const def = map[root];

    if (matchesCommandNameInsensitive(def, nameParam)) {
      return def;
    }
  }

  const plugin = getPluginByAlias(nameParam);

  if (plugin) {
    const definition = resolvePluginCommandDefinition(plugin, prefix);

    if (definition) {
      return definition;
    }
  }

  for (const candidate of listRegisteredPlugins()) {
    const def = resolvePluginCommandDefinition(candidate, prefix);

    if (def && matchesCommandNameInsensitive(def, nameParam)) {
      return def;
    }
  }

  return null;
}
