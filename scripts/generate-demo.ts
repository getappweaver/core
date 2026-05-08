import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
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

type PluginEntry = {
  alias: string;
  name: string;
  repo: string;
  version: string;
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
const DEMO_DIR = join(ROOT, 'apps', 'landing', 'public', 'demo');
const LANDING_PUBLIC_DIR = join(ROOT, 'apps', 'landing', 'public');
const DEMO_BOOTSTRAP_JSON = join(DEMO_DIR, 'bootstrap.json');
const DEMO_COMMANDS_JSON = join(DEMO_DIR, 'commands.json');
const DEMO_COMMAND_STORIES_JSON = join(DEMO_DIR, 'command-stories.json');
const DEMO_STORIES_JSON = join(DEMO_DIR, 'stories.json');
const DEMO_PREFIX = '/';
const ALLOWED_ICON_EXTS = new Set(['.svg', '.png', '.webp']);

function readPluginsJson(): PluginsJson {
  return JSON.parse(readFileSync(PLUGINS_JSON, 'utf8')) as PluginsJson;
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

function flattenIconPath(value: string): string {
  return value.replace(/[\\/]/g, '__');
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

type DemoCommandDetail = ReturnType<typeof serializeCommand>;

function publishWidgetIcon(params: {
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

  const sourcePath = join(ROOT, rootedIcon.slice(1));
  const ext = extname(sourcePath).toLowerCase();

  if (!ALLOWED_ICON_EXTS.has(ext) || !existsSync(sourcePath)) {
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

  const targetPath = join(LANDING_PUBLIC_DIR, targetRel);
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

  const lower = icon.toLowerCase();

  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:')
  ) {
    return icon;
  }

  const rootedIcon = icon.startsWith('/')
    ? icon
    : params.pluginAlias
      ? `/plugins/${params.pluginAlias}/${icon}`
      : icon;

  if (!rootedIcon.startsWith('/')) {
    return undefined;
  }

  if (rootedIcon.startsWith('/plugins/')) {
    const rel = rootedIcon.slice('/plugins/'.length);
    const slashIdx = rel.indexOf('/');

    if (slashIdx <= 0) {
      return params.pluginAlias
        ? `/plugin-icons/${params.pluginAlias}/${flattenIconPath(rel)}`
        : undefined;
    }

    const alias = rel.slice(0, slashIdx);
    const iconRel = rel.slice(slashIdx + 1);

    return `/plugin-icons/${alias}/${flattenIconPath(iconRel)}`;
  }

  return `/builtin-icons/${flattenIconPath(rootedIcon.slice(1))}`;
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
    plugins: [],
  };

  mkdirSync(DEMO_DIR, { recursive: true });
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
      version: entry.version,
      commandStoryCount: pluginStoryData.stories.length,
      aiStoryCount: aiData.stories.length,
    });
  }

  pluginCommands.sort((a, b) => a.name.localeCompare(b.name));

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
