#!/usr/bin/env bun

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { OfficialApp } from '../src/landing-data';
import { officialApps } from '../src/landing-data';

const LANDING_ROOT = resolve(import.meta.dirname, '..');
const PUBLIC_ROOT = join(LANDING_ROOT, 'public');
const DIST_ROOT = join(LANDING_ROOT, 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');

// Routes to generate static files for
const PLUGIN_ROUTES: OfficialApp[] = officialApps;

async function generatePluginPages() {
  // Check if dist/index.html exists
  let baseHtml: string;
  try {
    baseHtml = await readFile(INDEX_PATH, 'utf-8');
  } catch {
    console.error('dist/index.html not found. Run "bun run build" first.');
    process.exit(1);
  }

  for (const app of PLUGIN_ROUTES) {
    const route = app.href.slice(1); // apps/todo
    const routeDir = join(DIST_ROOT, route);

    await mkdir(routeDir, { recursive: true });

    // Generate meta tags for this plugin page
    const metaTags = `
    <meta name="description" content="${app.description}">
    <meta property="og:title" content="${app.displayName} for AppWeaver">
    <meta property="og:description" content="${app.description}">
    <link rel="canonical" href="https://getappweaver.com${app.href}">
    `;

    // Inject meta tags into the HTML
    const html = baseHtml
      .replace(
        '<title>AppWeaver</title>',
        `<title>${app.displayName} for AppWeaver | AppWeaver</title>`,
      )
      .replace(
        '</head>',
        `${metaTags}\n  </head>`,
      );

    await writeFile(join(routeDir, 'index.html'), html);
    console.log(`✓ Generated ${app.href}/index.html`);
  }

  console.log('\nAll static plugin pages generated!');
}

generatePluginPages().catch((err) => {
  console.error('Failed to generate plugin pages:', err);
  process.exit(1);
});