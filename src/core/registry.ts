// ---------------------------------------------------------------------------
// src/core/registry.ts — Plugin registry
// ---------------------------------------------------------------------------

import { join } from 'path';

import type { PluginCapabilityRelations } from '@src/capabilities/relations';
import type { CapabilityProviderSource } from '@src/capabilities/types';
import { log } from '@src/logger';
import { dmBotRoot } from '@src/paths';
import type { WebHandlerResult } from '@src/web/ui-schema';
import {
  isRemoteWidgetIcon,
  publishedWidgetIconPath,
} from '@src/web/widget-icon-path';

import {
  capabilityRegistry,
  createCapabilityClient,
} from './capabilities/registry';
import { monitoring } from './monitoring';
import type {
  BotPlugin,
  PluginContext,
  PluginHostContext,
  PluginInvocationContext,
  PluginPackageJson,
} from './plugin';
import { parsePluginPackageJson } from './plugin';

const byAlias = new Map<string, BotPlugin>();
const capabilityRelationsByAlias = new Map<string, PluginCapabilityRelations>();

type RegisterPluginProps = {
  alias: string;
  plugin: BotPlugin;
  ctx: PluginHostContext;
};

type CreatePluginScopedContextProps = {
  plugin: BotPlugin;
  ctx: PluginHostContext;
};

function createPluginScopedContext({
  plugin,
  ctx,
}: CreatePluginScopedContextProps): PluginContext {
  const capabilities = createCapabilityClient({
    registry: capabilityRegistry,
    caller: {
      type: 'plugin',
      pluginName: plugin.identity.name,
      alias: plugin.identity.alias,
    },
  });

  const scoped = { capabilities, monitoring } as PluginContext;
  const source = ctx as unknown as Record<string, unknown>;
  const target = scoped as unknown as Record<string, unknown>;

  for (const key of Object.keys(ctx)) {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: false,
      get: () => source[key],
      set: (value: unknown) => {
        source[key] = value;
      },
    });
  }

  return scoped;
}

function providerIconUrl(icon: string | null, alias: string): string | null {
  if (!icon) {
    return null;
  }

  if (isRemoteWidgetIcon(icon)) {
    return icon;
  }

  const path = publishedWidgetIconPath({ icon, pluginAlias: alias });

  return path ? `/${path}` : null;
}

function capabilityProviderSource(
  installedAlias: string,
  pkg: PluginPackageJson,
): CapabilityProviderSource {
  return {
    type: 'plugin',
    pluginName: pkg.name,
    alias: installedAlias,
    version: pkg.version,
    title: pkg.title,
    description: pkg.description,
    iconUrl: providerIconUrl(pkg.icon, installedAlias),
  };
}

export function registerPlugin({ alias, plugin, ctx }: RegisterPluginProps) {
  if (plugin.identity.alias !== alias) {
    throw new Error(
      `Plugin alias mismatch: installed as "${alias}" but claimed "${plugin.identity.alias}"`,
    );
  }

  if (byAlias.has(alias)) {
    throw new Error(`Plugin alias collision: "${alias}" already registered`);
  }

  const databasePath = join(dmBotRoot, 'plugins', alias, 'db.sqlite');

  log.info(`Registering plugin: ${alias} creating database at ${databasePath}`);

  const scopedContext = createPluginScopedContext({ plugin, ctx });
  const providers = plugin.capabilityProviders ?? [];

  const pkg = parsePluginPackageJson({
    pluginDir: join(dmBotRoot, 'plugins', alias),
  });

  if (!pkg) {
    throw new Error(`Cannot register ${alias}: invalid package metadata.`);
  }

  if (
    pkg.name !== plugin.identity.name ||
    pkg.version !== plugin.identity.version
  ) {
    throw new Error(
      `Cannot register ${alias}: package identity does not match runtime identity.`,
    );
  }

  const source =
    providers.length > 0 ? capabilityProviderSource(alias, pkg) : null;

  if (source) {
    capabilityRegistry.validateProviders({ source, providers });
  }

  plugin.onInit(scopedContext);

  if (source) {
    capabilityRegistry.registerProviders({
      source,
      providers,
    });
  }

  byAlias.set(alias, plugin);
  capabilityRelationsByAlias.set(alias, pkg.capabilities);
}

export function finalizePluginRegistration(): void {
  capabilityRegistry.finalize();

  for (const [alias, relations] of capabilityRelationsByAlias) {
    for (const required of relations.requires) {
      if (capabilityRegistry.listProviders(required).length === 0) {
        log.warn(
          `Plugin ${alias} requires missing capability ${required.name}:v${required.version}`,
        );
      }
    }
  }
}

export function getPluginByAlias(alias: string): BotPlugin | undefined {
  return byAlias.get(alias);
}

export function listRegisteredPlugins(): BotPlugin[] {
  return [...byAlias.values()].sort((a, b) =>
    a.identity.alias.localeCompare(b.identity.alias),
  );
}

export function getRegisteredPluginAliases(): string[] {
  return [...byAlias.keys()].sort();
}

export async function dispatchPluginCommand(
  cmd: string,
  args: string[],
  context: PluginInvocationContext,
): Promise<WebHandlerResult | null> {
  const plugin = byAlias.get(cmd);

  if (!plugin) {
    return null;
  }

  return plugin.handler(args, context);
}

export function getPluginHelpTexts(prefix: string): string | null {
  if (byAlias.size === 0) {
    return null;
  }

  const sections = [...byAlias.entries()].map(([alias, plugin]) => {
    const { name, version, description } = plugin.identity;
    const header = ` ▸ ${alias} (${name}) v${version}`;
    const descLine = description ? `\n   ${description}` : '';
    const helpLines = plugin.helpText(alias, prefix).join('\n');

    return `\n${header}${descLine}\n\n${helpLines}\n`;
  });

  if (sections.length === 0) {
    return 'No plugins registered to help text';
  }

  return `\n---------------\nPlugin Commands\n---------------${sections.join('')}`;
}
