#!/usr/bin/env bun
// Ensures PWA icon files exist in web/public without overwriting real assets.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const dmBotRoot = join(import.meta.dir, '..');
const publicDir = join(dmBotRoot, 'web', 'public');
const docsDir = join(dmBotRoot, 'docs');

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

mkdirSync(publicDir, { recursive: true });

const iconSources = [
  {
    target: join(publicDir, 'appweaver-pwa-192.png'),
    preferredSource: join(docsDir, 'appweaver-logo192x192.png'),
  },
  {
    target: join(publicDir, 'appweaver-pwa-512.png'),
    preferredSource: join(docsDir, 'appweaver-logo512x512.png'),
  },
];

for (const icon of iconSources) {
  if (existsSync(icon.target)) {
    console.log(`Keeping existing ${icon.target}`);
    continue;
  }

  if (existsSync(icon.preferredSource)) {
    copyFileSync(icon.preferredSource, icon.target);
    console.log(`Copied ${icon.preferredSource} -> ${icon.target}`);
    continue;
  }

  writeFileSync(icon.target, png1x1);
  console.log(`Wrote placeholder ${icon.target}`);
}
