import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';

import GithubSlugger from 'github-slugger';
import { Marked } from 'marked';

import { officialApps } from '../src/generated/plugin-content';
import { LANDING_ROOT, pluginSources, WORKSPACE_ROOT } from './plugin-sources';

const OUTPUT_ROOT = resolve(LANDING_ROOT, 'public/docs');
const SITE_ORIGIN = 'https://getappweaver.com';

type DocPage = {
  source: string;
  route: string;
  title: string;
  group: string;
  body: string;
};

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function markdownFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = resolve(root, entry.name);

    if (entry.isDirectory()) {
      return markdownFiles(path);
    }

    return entry.isFile() && /\.md$/i.test(entry.name) ? [path] : [];
  });
}

/** Discover owned module docs without walking dependencies, profiles, or upstream vendors. */
function pluginDocuments(root: string): string[] {
  const skip = new Set(['.git', 'node_modules', 'dist', 'profile', '.logs']);

  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = resolve(root, entry.name);

    if (entry.isDirectory()) {
      if (skip.has(entry.name)) {
        return [];
      }

      if (entry.name === 'vendor') {
        const readme = resolve(path, 'README.md');

        return existsSync(readme) ? [readme] : [];
      }

      return entry.name === 'docs' ? markdownFiles(path) : pluginDocuments(path);
    }

    return entry.isFile() && /^(?:README|ARCHITECTURE)\.md$/i.test(entry.name) ? [path] : [];
  });
}

function documentRoute(source: string): string {
  const path = relative(WORKSPACE_ROOT, source).split(sep).join('/');
  const plugin = /^plugins\/([^/]+)\/(?:docs\/)?(.+)$/i.exec(path);
  const slug = (value: string) => value.replace(/\.md$/i, '').split('/').map((part) => part.toLowerCase().replaceAll('_', '-')).join('/');

  if (plugin) {
    return `/docs/plugins/${plugin[1]}/${slug(plugin[2])}/`;
  }

  return `/docs/core/${slug(path.replace(/^docs\//, ''))}/`;
}

type RenderPageProps = {
  title: string;
  route: string;
  body: string;
};

function renderPage({ title, route, body }: RenderPageProps): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} | AppWeaver Docs</title><meta name="description" content="${escapeHtml(title)} — AppWeaver documentation"><link rel="canonical" href="${SITE_ORIGIN}${route}"><link rel="stylesheet" href="/docs/docs.css"></head><body class="blog-static-page"><main class="shell"><nav class="top"><a href="/">AppWeaver</a> / <a href="/docs/">Documentation</a></nav><article class="content">${body}</article></main></body></html>`;
}

function writePage(route: string, html: string): void {
  const target = resolve(LANDING_ROOT, 'public', route.slice(1), 'index.html');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

function generateDocs(): void {
  const queue: string[] = [];
  const sources = new Set<string>();
  const routes = new Map<string, string>();
  const pages: DocPage[] = [];
  const plugins = pluginSources();
  const groups = new Map(plugins.map((plugin) => [plugin.alias, officialApps.find((app) => app.alias === plugin.alias)?.name ?? plugin.alias]));

  const enqueue = (source: string) => {
    const path = resolve(source);

    if (sources.has(path)) {
      return;
    }

    const route = documentRoute(path);
    const owner = routes.get(route);

    if (owner && owner !== path) {
      throw new Error(`Duplicate documentation route ${route}: ${owner} and ${path}`);
    }

    routes.set(route, path);
    sources.add(path);
    queue.push(path);
  };

  for (const path of markdownFiles(resolve(WORKSPACE_ROOT, 'docs'))) {
    if (!relative(resolve(WORKSPACE_ROOT, 'docs'), path).startsWith(`blog${sep}`)) {
      enqueue(path);
    }
  }

  for (const plugin of plugins) {
    for (const path of pluginDocuments(plugin.root)) {
      enqueue(path);
    }
  }

  // Remove stale pages only from this dedicated, ignored generated subtree.
  rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  copyFileSync(resolve(LANDING_ROOT, 'src/blog.css'), resolve(OUTPUT_ROOT, 'docs.css'));

  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    const markdown = readFileSync(source, 'utf8');
    const slugger = new GithubSlugger();
    const parser = new Marked();
    parser.use({
      renderer: {
        heading({ tokens, depth }) {
          const content = this.parser.parseInline(tokens);
          const text = content.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'");

          return `<h${depth} id="${escapeHtml(slugger.slug(text))}">${content}</h${depth}>\n`;
        },
      },
    });

    const resolveLink = (href: string): string => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) {
        return href;
      }

      const match = /^([^?#]+)(.*)$/.exec(href);

      if (!match) {
        return href;
      }

      const target = resolve(dirname(source), decodeURIComponent(match[1]));

      if (!existsSync(target)) {
        throw new Error(`Broken documentation link in ${relative(WORKSPACE_ROOT, source)}: ${href}`);
      }

      if (!realpathSync(target).startsWith(`${realpathSync(WORKSPACE_ROOT)}${sep}`)) {
        throw new Error(`Documentation link leaves the workspace: ${href}`);
      }

      if (/\.md$/i.test(target)) {
        enqueue(target);

        return documentRoute(target) + match[2];
      }

      if (!/\.(?:png|jpe?g|gif|svg|webp|avif|pdf|txt|ts|tsx|json|css|sh)$/i.test(extname(target))) {
        throw new Error(`Unsupported documentation asset in ${relative(WORKSPACE_ROOT, source)}: ${href}`);
      }

      const assetPath = relative(WORKSPACE_ROOT, target).split(sep).join('/');
      const destination = resolve(OUTPUT_ROOT, 'assets', assetPath);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(target, destination);

      return `/docs/assets/${assetPath.split('/').map(encodeURIComponent).join('/')}${match[2]}`;
    };

    const tokens = parser.lexer(markdown);
    const heading = tokens.find((token) => token.type === 'heading');
    const title = heading && 'text' in heading && typeof heading.text === 'string'
      ? heading.text
      : relative(WORKSPACE_ROOT, source);
    parser.walkTokens(tokens, (token) => {
      if (token.type === 'link' || token.type === 'image') {
        token.href = resolveLink(token.href);
      }
    });
    const body = parser.parser(tokens);
    const route = documentRoute(source);
    const pluginAlias = /^plugins\/([^/]+)\//.exec(relative(WORKSPACE_ROOT, source).split(sep).join('/'))?.[1] ?? null;
    pages.push({ source, title, route, body, group: pluginAlias ?? 'core' });
    writePage(route, renderPage({ title, route, body }));
  }

  const list = (items: DocPage[]) => `<ul>${items.map((page) => `<li><a href="${page.route}">${escapeHtml(page.title)}</a></li>`).join('')}</ul>`;
  let indexBody = `<h1>AppWeaver documentation</h1><h2>Core</h2>${list(pages.filter((page) => page.group === 'core'))}`;

  for (const [alias, name] of groups) {
    const entries = pages.filter((page) => page.group === alias);
    const route = `/docs/plugins/${alias}/`;
    const body = `<h1>${escapeHtml(name)} documentation</h1><p><a href="${officialApps.find((app) => app.alias === alias)!.href}">App page</a></p>${list(entries)}`;
    writePage(route, renderPage({ title: `${name} documentation`, route, body }));
    indexBody += `<h2><a href="${route}">${escapeHtml(name)}</a></h2>${list(entries)}`;
  }

  writePage('/docs/', renderPage({ title: 'Documentation', route: '/docs/', body: indexBody }));
  const sitemapPath = resolve(LANDING_ROOT, 'public/sitemap.xml');

  if (existsSync(sitemapPath)) {
    const sitemap = readFileSync(sitemapPath, 'utf8').replace(/\s*<url>\s*<loc>https:\/\/getappweaver\.com\/docs\/[\s\S]*?<\/url>/g, '');
    const docRoutes = ['/docs/', ...groups.keys().map((alias) => `/docs/plugins/${alias}/`), ...pages.map((page) => page.route)];
    const urls = docRoutes.map((route) => `  <url><loc>${SITE_ORIGIN}${route}</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`).join('\n');
    writeFileSync(sitemapPath, sitemap.replace('</urlset>', `${urls}\n</urlset>`));
  }

  console.log(`Generated ${pages.length} documentation pages plus core/plugin indexes.`);
}

generateDocs();
