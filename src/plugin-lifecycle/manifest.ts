import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type PluginManifestEntry = {
  alias: string;
  name: string | null;
  repo: string;
  version: string | null;
};

type PluginsManifest = {
  plugins: PluginManifestEntry[];
};

function isPluginManifestEntry(value: unknown): value is PluginManifestEntry {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const entry = value as Record<string, unknown>;

  return (
    typeof entry.alias === 'string' &&
    (typeof entry.name === 'string' || entry.name == null) &&
    typeof entry.repo === 'string' &&
    (typeof entry.version === 'string' || entry.version == null)
  );
}

export function localPluginRepo(alias: string): string {
  return `local://plugins/${alias}`;
}

export function isLocalPluginRepo(repo: string): boolean {
  return repo.startsWith('local://');
}

export function readPluginManifest(dmBotRoot: string): PluginsManifest {
  const filePath = join(dmBotRoot, 'plugins.json');

  if (!existsSync(filePath)) {
    return { plugins: [] };
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as {
    plugins?: unknown;
  };

  return {
    plugins: Array.isArray(parsed.plugins)
      ? parsed.plugins.filter(isPluginManifestEntry).map((entry) => ({
          alias: entry.alias,
          name: entry.name ?? null,
          repo: entry.repo,
          version: entry.version ?? null,
        }))
      : [],
  };
}

export function writePluginManifest(
  dmBotRoot: string,
  manifest: PluginsManifest,
): void {
  writeFileSync(
    join(dmBotRoot, 'plugins.json'),
    `${JSON.stringify(
      {
        plugins: manifest.plugins.map((entry) => ({
          alias: entry.alias,
          ...(entry.name ? { name: entry.name } : {}),
          repo: entry.repo,
          ...(entry.version ? { version: entry.version } : {}),
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

type AddLocalPluginManifestEntryProps = {
  dmBotRoot: string;
  alias: string;
  packageName: string;
};

export function addLocalPluginManifestEntry({
  dmBotRoot,
  alias,
  packageName,
}: AddLocalPluginManifestEntryProps): PluginManifestEntry {
  const manifest = readPluginManifest(dmBotRoot);

  if (manifest.plugins.some((entry) => entry.alias === alias)) {
    throw new Error(`Plugin alias is already registered: ${alias}`);
  }

  const entry: PluginManifestEntry = {
    alias,
    name: packageName,
    repo: localPluginRepo(alias),
    version: null,
  };

  manifest.plugins.push(entry);
  writePluginManifest(dmBotRoot, manifest);

  return entry;
}

type SetPluginRepositoryProps = {
  dmBotRoot: string;
  alias: string;
  repo: string;
};

export function setPluginRepository({
  dmBotRoot,
  alias,
  repo,
}: SetPluginRepositoryProps): void {
  const manifest = readPluginManifest(dmBotRoot);
  const entry = manifest.plugins.find((plugin) => plugin.alias === alias);

  if (!entry) {
    throw new Error(`Plugin alias is not registered: ${alias}`);
  }

  entry.repo = repo;
  writePluginManifest(dmBotRoot, manifest);
}
