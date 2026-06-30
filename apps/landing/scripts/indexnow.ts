#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SITE_ORIGIN = 'https://getappweaver.com';
const HOST = 'getappweaver.com';
const INDEXNOW_KEY = '77f3fee592df4c7b9ddde83a62c293e1';
const LANDING_ROOT = resolve(import.meta.dirname, '..');
const SITEMAP_PATH = join(LANDING_ROOT, 'public', 'sitemap.xml');

function extractUrls(sitemap: string): string[] {
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

async function submitIndexNow(urls: string[]): Promise<void> {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `IndexNow failed with ${response.status}: ${await response.text()}`,
    );
  }
}

async function main(): Promise<void> {
  const sitemap = await readFile(SITEMAP_PATH, 'utf8');
  const urls = extractUrls(sitemap);

  if (urls.length === 0) {
    throw new Error(`No URLs found in ${SITEMAP_PATH}`);
  }

  await submitIndexNow(urls);
  console.log(`Submitted ${urls.length} URL(s) to IndexNow.`);
}

main().catch((err) => {
  if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error(String(err));
  }

  process.exit(1);
});
