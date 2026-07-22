import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, extname, join } from 'path';

import {
  BUILTIN_ROOT_NAMES,
  getBuiltinDefinitionsMap,
} from '@src/commands/definitions-registry';
import { listRegisteredPlugins } from '@src/core/registry';
import { log } from '@src/logger';
import { dmBotRoot } from '@src/paths';
import type { CommandDefinition } from '@src/system/command-definition';

import {
  localWidgetIconSourceReference,
  publishedWidgetIconPath,
} from './widget-icon-path';

const ALLOWED_ICON_EXTS = new Set(['.svg', '.png', '.webp']);

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

  const pluginAlias = params.pluginAlias ?? null;
  const rootedIcon = localWidgetIconSourceReference({ icon, pluginAlias });

  if (!rootedIcon) {
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

  const targetRel = publishedWidgetIconPath({ icon, pluginAlias });

  if (!targetRel) {
    return;
  }

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
  rmSync(join(dmBotRoot, 'web', 'public', 'plugin-icons'), {
    recursive: true,
    force: true,
  });

  rmSync(join(dmBotRoot, 'web', 'public', 'builtin-icons'), {
    recursive: true,
    force: true,
  });

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
