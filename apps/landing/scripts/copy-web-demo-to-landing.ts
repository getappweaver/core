import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';

import { copyPluginIconsToLanding } from './generate-content';

const ROOT = join(import.meta.dir, '../../..');
const WEB_DIST = join(ROOT, 'web', 'dist');
const WEB_PUBLIC = join(ROOT, 'web', 'public');
const LANDING_PUBLIC = join(ROOT, 'apps', 'landing', 'public');
const LANDING_DIST = join(ROOT, 'apps', 'landing', 'dist');

function copyDir(from: string, to: string): void {
  if (!existsSync(from)) {
    return;
  }

  mkdirSync(to, { recursive: true });

  for (const entry of readdirSync(from)) {
    const source = join(from, entry);
    const target = join(to, entry);

    if (statSync(source).isDirectory()) {
      copyDir(source, target);
    } else {
      copyFileSync(source, target);
    }
  }
}

function replaceDir(from: string, to: string): void {
  if (!existsSync(from)) {
    throw new Error(`Missing source directory: ${from}`);
  }

  rmSync(to, { force: true, recursive: true });
  copyDir(from, to);
}

function mirrorStaticDemoAssets(targetRoot: string): void {
  copyDir(join(WEB_PUBLIC, 'demo'), join(targetRoot, 'demo'));
  copyDir(join(WEB_PUBLIC, 'plugin-icons'), join(targetRoot, 'plugin-icons'));
  copyDir(join(WEB_PUBLIC, 'builtin-icons'), join(targetRoot, 'builtin-icons'));
  copyPluginIconsToLanding(targetRoot);
}

if (existsSync(WEB_DIST)) {
  const index = readFileSync(join(WEB_DIST, 'index.html'), 'utf8');

  if (!index.includes('/demo/app/assets/')) {
    throw new Error(
      'web/dist is not an embedded demo build. Run `bun run web:demo:build` before copying it to landing.',
    );
  }
}

mirrorStaticDemoAssets(LANDING_PUBLIC);

if (existsSync(WEB_DIST)) {
  replaceDir(WEB_DIST, join(LANDING_PUBLIC, 'demo', 'app'));
}

if (existsSync(LANDING_DIST)) {
  mirrorStaticDemoAssets(LANDING_DIST);
  replaceDir(WEB_DIST, join(LANDING_DIST, 'demo', 'app'));
  mirrorStaticDemoAssets(join(LANDING_DIST, 'demo', 'app'));
}

console.log('[copy-web-demo-to-landing] Mirrored web demo assets to landing.');
