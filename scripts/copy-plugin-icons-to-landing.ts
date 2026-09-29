import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, join, resolve } from 'path';

const ROOT = join(import.meta.dir, '..');

export function copyPluginIconsToLanding(targetRoot: string): void {
  const registry = JSON.parse(
    readFileSync(join(ROOT, 'plugins.json'), 'utf8'),
  ) as {
    plugins: { alias: string }[];
  };

  for (const { alias } of registry.plugins) {
    const pluginDir = join(ROOT, 'plugins', alias);
    const manifestPath = join(pluginDir, 'package.json');

    if (!existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      appweaver?: { icon?: string };
    };

    const icon = manifest.appweaver?.icon;

    if (!icon) {
      continue;
    }

    const source = resolve(pluginDir, icon);

    if (!source.startsWith(`${pluginDir}/`) || !source.endsWith('.svg')) {
      throw new Error(`Invalid appweaver.icon for ${alias}: ${icon}`);
    }

    const targetDir = join(targetRoot, 'plugin-icons', alias);
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(source, join(targetDir, basename(icon)));
  }
}

if (import.meta.main) {
  copyPluginIconsToLanding(join(ROOT, 'apps', 'landing', 'public'));
  console.log('[copy-plugin-icons-to-landing] Copied plugin manifest icons.');
}
