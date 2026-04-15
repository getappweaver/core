// ---------------------------------------------------------------------------
// src/commands/help/handlers.ts — global help and plugin drill-down
// ---------------------------------------------------------------------------

import {
  getPluginByAlias,
  getRegisteredPluginAliases,
} from '@src/core/registry';

import {
  getBuiltinCommandDefinition,
  isBuiltinRootName,
  type BuiltinRootName,
} from '../definitions-registry';
import type { BuiltinHandler } from '../dispatch';

import { buildCommandHelp } from './build';
import { renderHelpText } from './renderers/text';
import { renderBuiltinHelpText } from './renderers/text';
import { createHelpRepresentation } from './representation';

function resolvePluginHelpDefinition(params: {
  prefix: string;
  alias: string;
}) {
  const plugin = getPluginByAlias(params.alias);

  if (!plugin?.commandDefinition) {
    return null;
  }

  return typeof plugin.commandDefinition === 'function'
    ? plugin.commandDefinition(params.prefix, params.alias)
    : plugin.commandDefinition;
}

function getPluginHelpIndexLines(prefix: string): string | null {
  const aliases = getRegisteredPluginAliases();

  if (aliases.length === 0) {
    return null;
  }

  return aliases
    .map((alias) => {
      const plugin = getPluginByAlias(alias);

      if (!plugin) {
        return `${prefix}${alias}`;
      }

      const desc = plugin.identity.description ?? 'Plugin';

      return `${prefix}${alias} — ${desc}`;
    })
    .join('\n');
}

function renderGlobalHelpIndex(prefix: string): string {
  const lines: string[] = [];

  lines.push(
    `Use ${prefix}help <command> for detailed usage and subcommands (e.g. ${prefix}help session). Same info: ${prefix}<command> help [topic] (e.g. ${prefix}session help new).`,
    '',
  );

  const builtins: BuiltinRootName[] = [
    'help',
    'session',
    'bot',
    'ai',
    'wallet',
    'bunker',
    'wot',
  ];

  for (const root of builtins) {
    const def = getBuiltinCommandDefinition({ root, prefix });

    lines.push(`${prefix}${root} — ${def.summary}`);
  }

  const pluginSection = getPluginHelpIndexLines(prefix);

  if (pluginSection) {
    lines.push('', 'Plugins:', '', pluginSection);
  }

  return lines.join('\n');
}

export const handleHelpRoot: BuiltinHandler = async (ctx) => {
  const p = ctx.prefix;
  const args = ctx.args;

  if (args.length === 0) {
    return renderGlobalHelpIndex(p);
  }

  const first = args[0].toLowerCase();

  if (isBuiltinRootName(first)) {
    const root = first;

    const topic =
      args.length >= 2 ? (args[args.length - 1]?.toLowerCase() ?? null) : null;

    return renderBuiltinHelpText({
      prefix: p,
      root,
      topic,
    });
  }

  const plugin = getPluginByAlias(first);

  if (plugin) {
    const pluginDefinition = resolvePluginHelpDefinition({
      prefix: p,
      alias: first,
    });

    if (args.length === 1) {
      if (pluginDefinition) {
        const result = buildCommandHelp({
          prefix: p,
          command: pluginDefinition,
          topic: null,
        });

        if (result.type === 'success') {
          const representation = createHelpRepresentation({
            command: first,
            subcommand: 'help',
            data: result.data,
          });

          return renderHelpText(representation, { prefix: p });
        }
      }

      return plugin.helpText(first, p).join('\n');
    }

    const topic =
      args.length >= 2 ? (args[args.length - 1]?.toLowerCase() ?? null) : null;

    if (pluginDefinition && topic !== null) {
      const result = buildCommandHelp({
        prefix: p,
        command: pluginDefinition,
        topic,
      });

      if (result.type === 'success') {
        const representation = createHelpRepresentation({
          command: first,
          subcommand: 'help',
          data: result.data,
        });

        return renderHelpText(representation, { prefix: p });
      }

      if (result.type === 'error') {
        return result.message;
      }
    }

    const topicPath = args.slice(1).join(' ');

    return `${plugin.identity.name} (${first}) — topic: ${topicPath}\n\nUse ${p}${first} help ${topicPath} or ${p}help ${first} ${topicPath}.`;
  }

  return `Unknown help topic: ${first}. Try ${p}help alone for an index.`;
};
