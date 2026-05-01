import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, extname, join } from 'path';

import {
  BUILTIN_ROOT_NAMES,
  getBuiltinDefinitionsMap,
} from '@src/commands/definitions-registry';
import { listRegisteredPlugins } from '@src/core/registry';
import { log } from '@src/logger';
import { dmBotRoot } from '@src/paths';
import type { CommandDefinition } from '@src/system/command-definition';

const ALLOWED_ICON_EXTS = new Set(['.svg', '.png', '.webp']);

const flattenIconPath = (value: string): string =>
  value.replace(/[\\/]/g, '__');

function resolvePluginDefinition(
  plugin: ReturnType<typeof listRegisteredPlugins>[number],
  prefix: string,
): CommandDefinition | null {
  if (!plugin.commandDefinition) {
    return null;
  }

  return typeof plugin.commandDefinition === 'function'
    ? plugin.commandDefinition(prefix, plugin.identity.alias)
    : plugin.commandDefinition;
}

function copyIconIfPresent(params: {
  icon: string | undefined;
  pluginAlias?: string;
}): void {
  const icon = params.icon?.trim();

  if (
    !icon ||
    icon.startsWith('http://') ||
    icon.startsWith('https://') ||
    icon.startsWith('data:')
  ) {
    return;
  }

  const rootedIcon = icon.startsWith('/')
    ? icon
    : params.pluginAlias
      ? `/plugins/${params.pluginAlias}/${icon}`
      : icon;

  if (!rootedIcon.startsWith('/')) {
    return;
  }

  const sourcePath = join(dmBotRoot, rootedIcon.slice(1));
  const ext = extname(sourcePath).toLowerCase();

  if (!ALLOWED_ICON_EXTS.has(ext)) {
    log.warn(`Widget icon skipped (unsupported extension): ${rootedIcon}`);

    return;
  }

  if (!existsSync(sourcePath)) {
    log.warn(`Widget icon source not found: ${sourcePath}`);

    return;
  }

  const targetRel = rootedIcon.startsWith('/plugins/')
    ? (() => {
        const rel = rootedIcon.slice('/plugins/'.length);
        const slashIdx = rel.indexOf('/');

        if (slashIdx <= 0) {
          return `plugin-icons/${flattenIconPath(rel)}`;
        }

        const alias = rel.slice(0, slashIdx);
        const iconRel = rel.slice(slashIdx + 1);

        return `plugin-icons/${alias}/${flattenIconPath(iconRel)}`;
      })()
    : `builtin-icons/${flattenIconPath(rootedIcon.slice(1))}`;

  const targetPath = join(dmBotRoot, 'web', 'public', targetRel);
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
}

function publishDefinitionIcons(params: {
  definition: CommandDefinition;
  pluginAlias?: string;
}): void {
  for (const sub of params.definition.subcommands) {
    copyIconIfPresent({
      icon: sub.webWidget?.icon,
      pluginAlias: params.pluginAlias,
    });
  }
}

export function publishWidgetIcons(prefix: string): void {
  const builtins = getBuiltinDefinitionsMap({ prefix });
  for (const root of BUILTIN_ROOT_NAMES) {
    publishDefinitionIcons({ definition: builtins[root] });
  }

  for (const plugin of listRegisteredPlugins()) {
    const definition = resolvePluginDefinition(plugin, prefix);

    if (!definition) {
      continue;
    }

    publishDefinitionIcons({
      definition,
      pluginAlias: plugin.identity.alias,
    });
  }
}
