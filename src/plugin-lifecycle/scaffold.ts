import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

import { addLocalPluginManifestEntry, readPluginManifest } from './manifest';

const ALIAS_REGEX = /^[a-z][a-z0-9_-]*$/;

export function isPluginAlias(value: string): boolean {
  return ALIAS_REGEX.test(value.trim());
}

export type CreatePluginScaffoldProps = {
  dmBotRoot: string;
  alias: string;
  title: string;
  description: string;
  coreApiVersion: string;
  createDraftCommands?: boolean;
  runGenerator: boolean;
};

export type CreatePluginScaffoldResult = {
  alias: string;
  packageName: string;
  pluginDir: string;
  repo: string;
  generated: boolean;
};

export function aliasToPascal(alias: string): string {
  return alias
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function defaultCoreApiVersion(dmBotRoot: string): string {
  const pkg = JSON.parse(
    readFileSync(join(dmBotRoot, 'package.json'), 'utf8'),
  ) as { version?: unknown };

  const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  const major = version.split('.')[0] || '0';

  return `^${major}.0.0`;
}

function processConditionalBlocks(
  content: string,
  flags: Record<string, boolean>,
): string {
  let result = content;

  for (const [key, enabled] of Object.entries(flags)) {
    const ifRegex = new RegExp(
      `^[ \\t]*\\{\\{#IF ${key}\\}\\}[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*\\{\\{/IF ${key}\\}\\}[ \\t]*(?:\\r?\\n)?`,
      'gm',
    );

    result = result.replace(ifRegex, (_, body: string) =>
      enabled ? body : '',
    );

    const unlessRegex = new RegExp(
      `^[ \\t]*\\{\\{#UNLESS ${key}\\}\\}[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*\\{\\{/UNLESS ${key}\\}\\}[ \\t]*(?:\\r?\\n)?`,
      'gm',
    );

    result = result.replace(unlessRegex, (_, body: string) =>
      enabled ? '' : body,
    );

    const ifInline = new RegExp(
      `\\{\\{#IF ${key}\\}\\}([\\s\\S]*?)\\{\\{/IF ${key}\\}\\}`,
      'g',
    );

    result = result.replace(ifInline, (_, body: string) =>
      enabled ? body : '',
    );

    const unlessInline = new RegExp(
      `\\{\\{#UNLESS ${key}\\}\\}([\\s\\S]*?)\\{\\{/UNLESS ${key}\\}\\}`,
      'g',
    );

    result = result.replace(unlessInline, (_, body: string) =>
      enabled ? '' : body,
    );
  }

  return result;
}

function expandTemplate(
  content: string,
  variables: Record<string, string>,
  flags: Record<string, boolean>,
): string {
  const processed = processConditionalBlocks(content, flags);

  return processed.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => variables[key] ?? `{{${key}}}`,
  );
}

type CopyTemplateProps = {
  templateDir: string;
  outputDir: string;
  variables: Record<string, string>;
  flags: Record<string, boolean>;
  relativeDir: string;
  createDraftCommands: boolean;
};

const DRAFT_DIRECTORIES = new Set(['drafts', 'accept', 'revise', 'decline']);

function copyTemplate({
  templateDir,
  outputDir,
  variables,
  flags,
  relativeDir,
  createDraftCommands,
}: CopyTemplateProps): void {
  const sourceDir = join(templateDir, relativeDir);

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (
      !createDraftCommands &&
      entry.isDirectory() &&
      DRAFT_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const relativePath = relativeDir
      ? join(relativeDir, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      mkdirSync(join(outputDir, relativePath), { recursive: true });

      copyTemplate({
        templateDir,
        outputDir,
        variables,
        flags,
        relativeDir: relativePath,
        createDraftCommands,
      });

      continue;
    }

    if (!entry.isFile() || entry.name.endsWith('.sqlite')) {
      continue;
    }

    const outputName = entry.name.endsWith('.template')
      ? entry.name.slice(0, -'.template'.length)
      : entry.name;

    const destinationDir = join(outputDir, relativeDir);
    const source = readFileSync(join(templateDir, relativePath), 'utf8');

    const fileVariables =
      relativePath === 'package.json'
        ? Object.fromEntries(
            Object.entries(variables).map(([key, value]) => [
              key,
              JSON.stringify(value).slice(1, -1),
            ]),
          )
        : variables;

    mkdirSync(destinationDir, { recursive: true });

    writeFileSync(
      join(destinationDir, outputName),
      expandTemplate(source, fileVariables, flags),
      'utf8',
    );
  }
}

function runRequired({
  command,
  cwd,
  label,
}: {
  command: string[];
  cwd: string;
  label: string;
}): void {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `${label}: ${result.stderr.toString().trim() || result.stdout.toString().trim()}`,
    );
  }
}

export function createPluginScaffold({
  dmBotRoot,
  alias,
  title,
  description,
  coreApiVersion,
  createDraftCommands = true,
  runGenerator,
}: CreatePluginScaffoldProps): CreatePluginScaffoldResult {
  const normalizedAlias = alias.trim();

  if (!isPluginAlias(normalizedAlias)) {
    throw new Error(
      'Alias must start with a lowercase letter and contain only lowercase letters, numbers, hyphens, or underscores.',
    );
  }

  const pascalAlias = aliasToPascal(normalizedAlias);

  const identifierAlias =
    pascalAlias.charAt(0).toLowerCase() + pascalAlias.slice(1);

  const sqlAlias = normalizedAlias.replace(/[^a-z0-9_]/g, '_');
  const normalizedTitle = title.trim() || `${pascalAlias} app`;

  const normalizedDescription =
    description.trim() || `${pascalAlias} plugin for AppWeaver`;

  const normalizedCoreApiVersion =
    coreApiVersion.trim() || defaultCoreApiVersion(dmBotRoot);

  const packageName = `appweaver-${normalizedAlias}-plugin`;
  const pluginDir = join(dmBotRoot, 'plugins', normalizedAlias);

  if (existsSync(pluginDir)) {
    throw new Error(
      `Plugin directory already exists: plugins/${normalizedAlias}`,
    );
  }

  if (
    readPluginManifest(dmBotRoot).plugins.some(
      (entry) => entry.alias === normalizedAlias,
    )
  ) {
    throw new Error(`Plugin alias is already registered: ${normalizedAlias}`);
  }

  copyTemplate({
    templateDir: join(dmBotRoot, 'scripts', 'plugin-template'),
    outputDir: pluginDir,
    variables: {
      ALIAS: normalizedAlias,
      IDENTIFIER_ALIAS: identifierAlias,
      SQL_ALIAS: sqlAlias,
      PASCAL_ALIAS: pascalAlias,
      TITLE: normalizedTitle,
      PACKAGE_NAME: packageName,
      DESCRIPTION: normalizedDescription,
      CORE_API_VERSION: normalizedCoreApiVersion,
    },
    flags: {
      DRAFTS: createDraftCommands,
    },
    relativeDir: '',
    createDraftCommands,
  });

  runRequired({
    command: ['git', 'init', '-b', 'main'],
    cwd: pluginDir,
    label: 'Failed to initialize plugin repository',
  });

  runRequired({
    command: ['git', 'config', 'core.hooksPath', '../../scripts'],
    cwd: pluginDir,
    label: 'Failed to configure plugin Git hooks',
  });

  const manifestEntry = addLocalPluginManifestEntry({
    dmBotRoot,
    alias: normalizedAlias,
    packageName,
  });

  if (runGenerator) {
    runRequired({
      command: ['bun', 'run', 'plugin:generate'],
      cwd: dmBotRoot,
      label: 'Plugin created, but generated registrations could not be updated',
    });
  }

  return {
    alias: normalizedAlias,
    packageName,
    pluginDir,
    repo: manifestEntry.repo,
    generated: runGenerator,
  };
}
