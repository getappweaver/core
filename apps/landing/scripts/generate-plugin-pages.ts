#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { OfficialApp } from '../src/landing-data';
import { officialApps } from '../src/landing-data';

const LANDING_ROOT = resolve(import.meta.dirname, '..');
const DIST_ROOT = join(LANDING_ROOT, 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');
const SITE_ORIGIN = 'https://getappweaver.com';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function appImageUrl(app: OfficialApp): string {
  const slug = app.href.split('/').at(-1);

  return `${SITE_ORIGIN}/plugin-install/${slug === 'todo' ? 'todo-app' : slug}.png`;
}

function renderStructuredData(app: OfficialApp): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: app.displayName,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    url: `${SITE_ORIGIN}${app.href}`,
    image: appImageUrl(app),
    description: app.description,
    isPartOf: {
      '@type': 'SoftwareApplication',
      name: 'AppWeaver',
      url: `${SITE_ORIGIN}/`,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  }).replaceAll('<', '\\u003c');
}

function renderFallback(app: OfficialApp): string {
  const otherApps = officialApps.filter((entry) => entry.href !== app.href);

  return `<main id="static-seo-fallback" style="padding: 2rem; font-family: system-ui, sans-serif; color: #f5f5f5; background: #0a0d14; min-height: 100vh;">
      <article>
        <p><a href="/" style="color: inherit;">AppWeaver</a> / Official Apps</p>
        <h1>${escapeHtml(app.displayName)} for your AppWeaver workspace</h1>
        <p>${escapeHtml(app.description)}</p>
        <h2>Features</h2>
        <ul>
          ${app.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('\n          ')}
        </ul>
        <h2>Install ${escapeHtml(app.displayName)}</h2>
        <p>Install AppWeaver, open the Plugin Manager, and choose ${escapeHtml(app.displayName)} from the official AppWeaver app catalog.</p>
        <p>Package: <code>${escapeHtml(app.packageName)}</code></p>
        <h2>More official AppWeaver apps</h2>
        <ul>
          ${otherApps.map((entry) => `<li><a href="${escapeAttribute(entry.href)}" style="color: inherit;">${escapeHtml(entry.displayName)}</a>: ${escapeHtml(entry.description)}</li>`).join('\n          ')}
        </ul>
      </article>
    </main>`;
}

function renderPluginPage(baseHtml: string, app: OfficialApp): string {
  const title = `${app.displayName} for AppWeaver | AppWeaver`;
  const canonicalUrl = `${SITE_ORIGIN}${app.href}`;
  const imageUrl = appImageUrl(app);
  const fallback = renderFallback(app);

  return baseHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeAttribute(app.description)}" />`,
    )
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
      `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />`,
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${escapeAttribute(title)}" />`,
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${escapeAttribute(app.description)}" />`,
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />`,
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${escapeAttribute(imageUrl)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:card"\s+content="[^"]*"\s*\/?>/,
      '<meta name="twitter:card" content="summary_large_image" />',
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:title" content="${escapeAttribute(title)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:description" content="${escapeAttribute(app.description)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${escapeAttribute(imageUrl)}" />`,
    )
    .replace(
      /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${renderStructuredData(app)}</script>`,
    )
    .replace(/<main id="static-seo-fallback"[\s\S]*?<\/main>/, fallback);
}

async function generatePluginPages(): Promise<void> {
  let baseHtml: string;

  try {
    baseHtml = await readFile(INDEX_PATH, 'utf8');
  } catch {
    throw new Error('dist/index.html not found. Run "bun run build" first.');
  }

  await Promise.all(
    officialApps.map(async (app) => {
      const routeDir = join(DIST_ROOT, app.href.slice(1));

      await mkdir(routeDir, { recursive: true });
      await writeFile(join(routeDir, 'index.html'), renderPluginPage(baseHtml, app));
      console.log(`Generated ${app.href}/index.html`);
    }),
  );

  console.log(`Generated ${officialApps.length} static app pages.`);
}

generatePluginPages().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
