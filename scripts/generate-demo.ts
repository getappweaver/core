import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, extname, join } from 'path';

import {
  BUILTIN_ROOT_NAMES,
  getBuiltinDefinitionsMap,
} from '@src/commands/definitions-registry';
import { buildSubcommandUsage } from '@src/commands/help/build';
import type { BotPlugin } from '@src/core/plugin';
import type {
  CommandDefinition,
  SubcommandDefinition,
} from '@src/system/command-definition';
import type { StoryDefinition } from '@src/system/story-definition';
import { inferWebExecutionMode } from '@src/web/command-catalog';
import {
  isRemoteWidgetIcon,
  localWidgetIconSourceReference,
  publishedWidgetIconPath,
} from '@src/web/widget-icon-path';

type PluginEntry = {
  alias: string;
  name: string;
  repo: string;
};

type PluginsJson = {
  plugins: PluginEntry[];
};

type DemoCommandStoryEntry = {
  pluginAlias: string;
  pluginName: string;
  sourceType: 'command' | 'ai';
  sourceName: string;
  summary: string;
  examples: string[];
  storyIds: string[];
};

type DemoStoryEntry = {
  pluginAlias: string;
  pluginName: string;
  sourceType: 'command' | 'ai';
  sourceName: string;
  iconUrl?: string;
  story: StoryDefinition<unknown>;
};

type DemoBootstrap = {
  generatedAt: string;
  prefix: string;
  widgets: Array<{
    command: string;
    subcommand: string;
  }>;
  plugins: Array<{
    alias: string;
    name: string;
    repo: string;
    version: string;
    commandStoryCount: number;
    aiStoryCount: number;
  }>;
};

const ROOT = join(import.meta.dir, '..');
const PLUGINS_JSON = join(ROOT, 'plugins.json');
const WEB_PUBLIC_DIR = join(ROOT, 'web', 'public');
const DEMO_DIR = join(WEB_PUBLIC_DIR, 'demo');
const DEMO_BOOTSTRAP_JSON = join(DEMO_DIR, 'bootstrap.json');
const DEMO_COMMANDS_JSON = join(DEMO_DIR, 'commands.json');
const DEMO_COMMAND_STORIES_JSON = join(DEMO_DIR, 'command-stories.json');
const DEMO_STORIES_JSON = join(DEMO_DIR, 'stories.json');
const DEMO_PREFIX = '/';
const ALLOWED_ICON_EXTS = new Set(['.svg', '.png', '.webp']);

function readPluginsJson(): PluginsJson {
  return JSON.parse(readFileSync(PLUGINS_JSON, 'utf8')) as PluginsJson;
}

function readPluginVersion(alias: string): string {
  const pkg = JSON.parse(
    readFileSync(join(ROOT, 'plugins', alias, 'package.json'), 'utf8'),
  ) as { version?: unknown };

  return typeof pkg.version === 'string' ? pkg.version : 'unknown';
}

function resolveBotPlugin(mod: Record<string, unknown>): BotPlugin {
  for (const value of Object.values(mod)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const candidate = value as Partial<BotPlugin>;

    if (
      candidate.identity &&
      typeof candidate.handler === 'function' &&
      typeof candidate.onInit === 'function' &&
      typeof candidate.helpText === 'function' &&
      candidate.commandDefinition
    ) {
      return candidate as BotPlugin;
    }
  }

  throw new Error('Failed to resolve BotPlugin export from plugin init module');
}

function resolveCommandDefinition(
  plugin: BotPlugin,
  alias: string,
): CommandDefinition {
  return typeof plugin.commandDefinition === 'function'
    ? plugin.commandDefinition(DEMO_PREFIX, alias)
    : plugin.commandDefinition;
}

function serializeSubcommand(subcommand: SubcommandDefinition) {
  return {
    name: subcommand.name,
    summary: subcommand.summary,
    usage: buildSubcommandUsage(subcommand),
    aliases: subcommand.aliases,
    arguments: subcommand.arguments,
    options: subcommand.options,
    examples: subcommand.examples,
    inferredWeb: {
      generated: true as const,
      executionMode: inferWebExecutionMode(subcommand),
    },
    ...(subcommand.webWidget ? { webWidget: subcommand.webWidget } : {}),
  };
}

function serializeCommand(params: {
  definition: CommandDefinition;
  source: 'builtin' | 'plugin';
  pluginAlias?: string;
}) {
  return {
    name: params.definition.name,
    summary: params.definition.summary,
    aliases: params.definition.aliases,
    source: params.source,
    ...(params.pluginAlias ? { pluginAlias: params.pluginAlias } : {}),
    subcommands: params.definition.subcommands.map(serializeSubcommand),
  };
}

function collectBootstrapWidgets(params: {
  stories: DemoStoryEntry[];
}): DemoBootstrap['widgets'] {
  const seen = new Set<string>();
  const widgets: DemoBootstrap['widgets'] = [];

  for (const entry of params.stories) {
    for (const step of entry.story.steps) {
      if (
        step.type !== 'focus_target' ||
        step.target.type !== 'header_widget'
      ) {
        continue;
      }

      const key = `${step.target.command}:${step.target.subcommand}`;

      if (seen.has(key) || key === 'file:tree') {
        continue;
      }

      seen.add(key);

      widgets.push({
        command: step.target.command,
        subcommand: step.target.subcommand,
      });
    }
  }

  return widgets;
}

type DemoCommandDetail = ReturnType<typeof serializeCommand>;

function publishWidgetIcon(params: {
  icon: string | undefined;
  pluginAlias?: string;
}): void {
  const icon = params.icon?.trim();

  if (!icon || isRemoteWidgetIcon(icon)) {
    return;
  }

  const pluginAlias = params.pluginAlias ?? null;
  const rootedIcon = localWidgetIconSourceReference({ icon, pluginAlias });

  if (!rootedIcon) {
    return;
  }

  const sourcePath = join(ROOT, rootedIcon.slice(1));
  const ext = extname(sourcePath).toLowerCase();

  if (!ALLOWED_ICON_EXTS.has(ext) || !existsSync(sourcePath)) {
    return;
  }

  const targetRel = publishedWidgetIconPath({ icon, pluginAlias });

  if (!targetRel) {
    return;
  }

  const targetPath = join(WEB_PUBLIC_DIR, targetRel);
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
}

function publishedWidgetIconUrl(params: {
  icon: string | undefined;
  pluginAlias?: string;
}): string | undefined {
  const icon = params.icon?.trim();

  if (!icon) {
    return undefined;
  }

  if (isRemoteWidgetIcon(icon)) {
    return icon;
  }

  const path = publishedWidgetIconPath({
    icon,
    pluginAlias: params.pluginAlias ?? null,
  });

  return path ? `/${path}` : undefined;
}

function storyWidgetIconUrl(params: {
  story: StoryDefinition<unknown>;
  definition: CommandDefinition;
  pluginAlias: string;
}): string | undefined {
  const target = params.story.steps.find(
    (step) =>
      step.type === 'focus_target' && step.target.type === 'header_widget',
  );

  if (
    !target ||
    target.type !== 'focus_target' ||
    target.target.type !== 'header_widget'
  ) {
    return undefined;
  }

  const storyTarget = target.target;

  const subcommand = params.definition.subcommands.find(
    (item) => item.name === storyTarget.subcommand,
  );

  return publishedWidgetIconUrl({
    icon: subcommand?.webWidget?.icon,
    pluginAlias: params.pluginAlias,
  });
}

function publishDefinitionIcons(params: {
  definition: CommandDefinition;
  pluginAlias?: string;
}): void {
  for (const subcommand of params.definition.subcommands) {
    publishWidgetIcon({
      icon: subcommand.webWidget?.icon,
      pluginAlias: params.pluginAlias,
    });
  }
}

function resolvePluginStories(
  plugin: BotPlugin,
  prefix: string,
  alias: string,
): StoryDefinition<unknown>[] {
  if (!plugin.stories) {
    return [];
  }

  return typeof plugin.stories === 'function'
    ? plugin.stories(prefix, alias)
    : plugin.stories;
}

function collectPluginStories(params: {
  pluginAlias: string;
  pluginName: string;
  plugin: BotPlugin;
  definition: CommandDefinition;
}): { commands: DemoCommandStoryEntry[]; stories: DemoStoryEntry[] } {
  const pluginStories = resolvePluginStories(
    params.plugin,
    DEMO_PREFIX,
    params.pluginAlias,
  );

  if (pluginStories.length === 0) {
    return { commands: [], stories: [] };
  }

  return {
    commands: [
      {
        pluginAlias: params.pluginAlias,
        pluginName: params.pluginName,
        sourceType: 'command',
        sourceName: 'stories',
        summary: `${params.pluginName} walkthroughs`,
        examples: [],
        storyIds: pluginStories.map((story) => story.id),
      },
    ],
    stories: pluginStories.map((story) => ({
      pluginAlias: params.pluginAlias,
      pluginName: params.pluginName,
      sourceType: 'command' as const,
      sourceName: 'stories',
      iconUrl: storyWidgetIconUrl({
        story,
        definition: params.definition,
        pluginAlias: params.pluginAlias,
      }),
      story,
    })),
  };
}

function collectAiStories(params: {
  pluginAlias: string;
  pluginName: string;
  plugin: BotPlugin;
}): { commands: DemoCommandStoryEntry[]; stories: DemoStoryEntry[] } {
  const aiDef = params.plugin.aiDefinition;

  if (!aiDef?.demoStories || aiDef.demoStories.length === 0) {
    return { commands: [], stories: [] };
  }

  const command: DemoCommandStoryEntry = {
    pluginAlias: params.pluginAlias,
    pluginName: params.pluginName,
    sourceType: 'ai',
    sourceName: 'ai',
    summary: aiDef.skillDescription,
    examples: [],
    storyIds: aiDef.demoStories.map((story) => story.id),
  };

  const stories = aiDef.demoStories.map((story) => ({
    pluginAlias: params.pluginAlias,
    pluginName: params.pluginName,
    sourceType: 'ai' as const,
    sourceName: 'ai',
    story: story as StoryDefinition<unknown>,
  }));

  return { commands: [command], stories };
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}
`,
    'utf8',
  );
}

async function main(): Promise<void> {
  const pluginsJson = readPluginsJson();
  const commandEntries: DemoCommandStoryEntry[] = [];
  const storyEntries: DemoStoryEntry[] = [];

  const bootstrap: DemoBootstrap = {
    generatedAt: new Date().toISOString(),
    prefix: DEMO_PREFIX,
    widgets: [],
    plugins: [],
  };

  mkdirSync(DEMO_DIR, { recursive: true });

  rmSync(join(WEB_PUBLIC_DIR, 'plugin-icons'), {
    recursive: true,
    force: true,
  });

  rmSync(join(WEB_PUBLIC_DIR, 'builtin-icons'), {
    recursive: true,
    force: true,
  });

  const builtinDefinitions = getBuiltinDefinitionsMap({ prefix: DEMO_PREFIX });

  const builtinCommands = BUILTIN_ROOT_NAMES.map((root) => {
    const definition = builtinDefinitions[root];
    publishDefinitionIcons({ definition });

    return serializeCommand({ definition, source: 'builtin' as const });
  });

  const pluginCommands: DemoCommandDetail[] = [];

  for (const entry of pluginsJson.plugins) {
    const mod = (await import(
      join(ROOT, 'plugins', entry.alias, 'init.ts')
    )) as Record<string, unknown>;

    const plugin = resolveBotPlugin(mod);
    const command = resolveCommandDefinition(plugin, entry.alias);
    publishDefinitionIcons({ definition: command, pluginAlias: entry.alias });

    pluginCommands.push(
      serializeCommand({
        definition: command,
        source: 'plugin' as const,
        pluginAlias: entry.alias,
      }),
    );

    const pluginStoryData = collectPluginStories({
      pluginAlias: entry.alias,
      pluginName: plugin.identity.name,
      plugin,
      definition: command,
    });

    const aiData = collectAiStories({
      pluginAlias: entry.alias,
      pluginName: plugin.identity.name,
      plugin,
    });

    commandEntries.push(...pluginStoryData.commands, ...aiData.commands);
    storyEntries.push(...pluginStoryData.stories, ...aiData.stories);

    bootstrap.plugins.push({
      alias: entry.alias,
      name: plugin.identity.name,
      repo: entry.repo,
      version: readPluginVersion(entry.alias),
      commandStoryCount: pluginStoryData.stories.length,
      aiStoryCount: aiData.stories.length,
    });
  }

  pluginCommands.sort((a, b) => a.name.localeCompare(b.name));
  bootstrap.widgets = collectBootstrapWidgets({ stories: storyEntries });

  writeJson(DEMO_BOOTSTRAP_JSON, bootstrap);
  writeJson(DEMO_COMMANDS_JSON, [...builtinCommands, ...pluginCommands]);
  writeJson(DEMO_COMMAND_STORIES_JSON, commandEntries);
  writeJson(DEMO_STORIES_JSON, storyEntries);

  console.log(`[generate-demo] Wrote ${DEMO_BOOTSTRAP_JSON}`);
  console.log(`[generate-demo] Wrote ${DEMO_COMMANDS_JSON}`);
  console.log(`[generate-demo] Wrote ${DEMO_COMMAND_STORIES_JSON}`);
  console.log(`[generate-demo] Wrote ${DEMO_STORIES_JSON}`);
}

await main();
