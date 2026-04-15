#!/usr/bin/env bun
// Writes minimal valid PNGs into web/public for PWA manifest (replace with real art later).
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const dmBotRoot = join(import.meta.dir, '..');
const publicDir = join(dmBotRoot, 'web', 'public');

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

mkdirSync(publicDir, { recursive: true });
writeFileSync(join(publicDir, 'pwa-192.png'), png1x1);
writeFileSync(join(publicDir, 'pwa-512.png'), png1x1);

console.log('Wrote web/public/pwa-192.png and pwa-512.png (1x1 placeholders).');
