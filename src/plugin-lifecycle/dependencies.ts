import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Install in the plugin's package scope without changing its manifest or lockfile. */
export function installPluginDependencies(pluginDir: string): void {
  if (!existsSync(join(pluginDir, 'package.json'))) {
    throw new Error(`Plugin package.json is missing: ${pluginDir}`);
  }

  const result = Bun.spawnSync(['bun', 'install', '--no-save'], {
    cwd: pluginDir,
    env: {
      ...process.env,
      BUN_INSTALL_CACHE_DIR: join(
        pluginDir,
        'node_modules',
        '.cache',
        'bun-install',
      ),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Plugin dependency installation failed in ${pluginDir}:\n${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
}
