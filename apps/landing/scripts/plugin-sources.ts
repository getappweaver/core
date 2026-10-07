import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

export const LANDING_ROOT = resolve(import.meta.dirname, '..');
export const WORKSPACE_ROOT = resolve(LANDING_ROOT, '../..');

const registrySchema = z.object({
  plugins: z.array(z.object({
    alias: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string(),
    repo: z.string(),
  })),
});

const manifestSchema = z.object({
  name: z.string(),
  appweaver: z.object({ icon: z.string().nullable().optional() }).optional(),
});

export function pluginSources() {
  const registry = registrySchema.parse(JSON.parse(readFileSync(resolve(WORKSPACE_ROOT, 'plugins.json'), 'utf8')));
  const aliases = new Set<string>();

  return registry.plugins.map((entry) => {
    if (aliases.has(entry.alias)) {
      throw new Error(`Duplicate plugin alias: ${entry.alias}`);
    }

    aliases.add(entry.alias);
    const root = resolve(WORKSPACE_ROOT, 'plugins', entry.alias);

    if (!existsSync(root)) {
      throw new Error(`Missing local plugin ${entry.alias}: ${root}`);
    }

    const manifest = manifestSchema.parse(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')));

    return { ...entry, root, packageName: manifest.name, icon: manifest.appweaver?.icon ?? null };
  });
}
