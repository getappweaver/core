// ---------------------------------------------------------------------------
// web-dist.ts — Serve Vite production build (PWA / SPA) from web/dist
// ---------------------------------------------------------------------------

import { existsSync, statSync } from 'fs';
import { join, resolve, sep } from 'path';

function isPathInside(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);

  return c === p || c.startsWith(p + sep);
}

function mimeTypeForPath(filePath: string): string {
  const i = filePath.lastIndexOf('.');
  const ext = i >= 0 ? filePath.slice(i + 1).toLowerCase() : '';

  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    mjs: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    webmanifest: 'application/manifest+json',
    png: 'image/png',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    map: 'application/json',
    txt: 'text/plain; charset=utf-8',
    woff2: 'font/woff2',
    woff: 'font/woff',
  };

  return map[ext] ?? 'application/octet-stream';
}

function resolveDistFile(webDist: string, pathname: string): string | null {
  const rel = pathname.replace(/^\/+/, '');

  if (rel.includes('..')) {
    return null;
  }

  if (rel === '') {
    return join(webDist, 'index.html');
  }

  const full = join(webDist, rel);

  if (!isPathInside(webDist, full)) {
    return null;
  }

  return full;
}

function lastPathSegmentHasExtension(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';

  return last.includes('.');
}

type ServeWebDistGetProps = {
  dmBotRoot: string;
  pathname: string;
};

/**
 * Serve a GET from `web/dist` or SPA index.html. Returns null if dist is missing
 * or nothing matches (caller should 404).
 */
export function serveWebDistGet(props: ServeWebDistGetProps): Response | null {
  const webDist = resolve(join(props.dmBotRoot, 'web', 'dist'));
  const indexHtml = join(webDist, 'index.html');

  if (!existsSync(indexHtml)) {
    return null;
  }

  const { pathname } = props;
  const candidate = resolveDistFile(webDist, pathname);

  if (candidate !== null && existsSync(candidate)) {
    try {
      if (statSync(candidate).isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    return new Response(Bun.file(candidate), {
      headers: { 'Content-Type': mimeTypeForPath(candidate) },
    });
  }

  if (!lastPathSegmentHasExtension(pathname)) {
    return new Response(Bun.file(indexHtml), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return null;
}
