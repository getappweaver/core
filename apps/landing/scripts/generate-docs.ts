import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';

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
  breadcrumbHtml: string;
};

function renderPage({ title, route, body, breadcrumbHtml }: RenderPageProps): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} | AppWeaver Docs</title><meta name="description" content="${escapeHtml(title)} — AppWeaver documentation"><link rel="canonical" href="${SITE_ORIGIN}${route}"><link rel="stylesheet" href="/docs/docs.css"></head><body class="blog-static-page"><main class="shell"><nav class="top"><a class="brand" href="/">AppWeaver</a><div class="doc-breadcrumb">${breadcrumbHtml}</div><div class="nav"><a href="/docs/">Documentation</a></div></nav><article class="content">${body}</article></main></body></html>`;
}

function writePage(route: string, html: string): void {
  const target = resolve(LANDING_ROOT, 'public', route.slice(1), 'index.html');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

export function generateDocs(): string[] {
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
  }

  type BreadcrumbItem = {
    label: string;
    href: string | null;
  };

  type BuildBreadcrumbProps = {
    parts: string[];
    isFolderPage: boolean;
  };

  const buildBreadcrumb = ({ parts, isFolderPage }: BuildBreadcrumbProps): string => {
    if (parts.length === 0) {
      return '';
    }

    const items: BreadcrumbItem[] = parts.map((part, index) => {
      const isCurrent = isFolderPage && index === parts.length - 1;

      if (isCurrent) {
        return { label: part, href: null };
      }

      if (parts[0] === 'plugins') {
        if (index === 0) {
          return { label: 'plugins', href: '/docs/plugins/' };
        }
        if (index === 1) {
          return { label: parts[1], href: `/docs/plugins/${parts[1]}/` };
        }
        const sub = parts.slice(2, index + 1).join('/');
        return { label: part, href: `/docs/plugins/${parts[1]}/${sub}/` };
      }

      if (parts[0] === 'core') {
        if (index === 0) {
          return { label: 'core', href: '/docs/core/' };
        }
        const sub = parts.slice(1, index + 1).join('/');
        return { label: part, href: `/docs/core/${sub}/` };
      }

      return { label: part, href: null };
    });

    return items
      .map((item) => {
        if (item.href !== null) {
          return `<a href="${item.href}">${escapeHtml(item.label)}</a>`;
        }
        return `<span class="doc-breadcrumb-current">${escapeHtml(item.label)}</span>`;
      })
      .join('<span class="doc-breadcrumb-sep">/</span>');
  };

  type TreeNode = {
    name: string;
    files: DocPage[];
    dirs: Map<string, TreeNode>;
  };

  const sortFiles = (files: DocPage[]): DocPage[] => [...files].sort((a, b) => {
    const aBase = basename(a.source).toLowerCase();
    const bBase = basename(b.source).toLowerCase();

    if (aBase.startsWith('readme')) {
      return -1;
    }
    if (bBase.startsWith('readme')) {
      return 1;
    }
    if (aBase.startsWith('architecture')) {
      return -1;
    }
    if (bBase.startsWith('architecture')) {
      return 1;
    }
    if (aBase.startsWith('features')) {
      return -1;
    }
    if (bBase.startsWith('features')) {
      return 1;
    }

    return a.title.localeCompare(b.title);
  });

  type RenderTreeNodeProps = {
    node: TreeNode;
    isRoot: boolean;
  };

  const renderNode = ({ node, isRoot }: RenderTreeNodeProps): string => {
    const sortedFiles = sortFiles(node.files);
    const sortedDirs = [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b));

    const fileItems = sortedFiles.map(
      (file) => `<li class="doc-tree-item doc-tree-file"><a href="${file.route}">${escapeHtml(file.title)}</a></li>`,
    );

    const dirItems = sortedDirs.map(([name, dirNode]) => {
      const inner = renderNode({ node: dirNode, isRoot: false });
      return `<li class="doc-tree-item doc-tree-folder"><span class="doc-tree-folder-title"><span class="doc-tree-folder-icon">📁</span> ${escapeHtml(name)}/</span>${inner}</li>`;
    });

    const listClass = isRoot ? 'doc-tree-list doc-tree-root' : 'doc-tree-list';

    return `<ul class="${listClass}">${fileItems.join('')}${dirItems.join('')}</ul>`;
  };

  type RenderDocTreeProps = {
    items: DocPage[];
    baseRoot: string;
    isCore: boolean;
  };

  const renderDocTree = ({ items, baseRoot, isCore }: RenderDocTreeProps): string => {
    if (items.length === 0) {
      return '<p class="doc-empty">No documentation pages available.</p>';
    }

    const root: TreeNode = { name: '', files: [], dirs: new Map() };

    for (const page of items) {
      let rel = relative(baseRoot, page.source).split(sep).join('/');

      if (isCore && rel.startsWith('docs/')) {
        rel = rel.slice(5);
      }

      const dir = dirname(rel);
      const parts = dir === '.' || dir === '' ? [] : dir.split('/');
      let current = root;

      for (const part of parts) {
        if (!current.dirs.has(part)) {
          current.dirs.set(part, { name: part, files: [], dirs: new Map() });
        }

        current = current.dirs.get(part)!;
      }

      current.files.push(page);
    }

    return `<div class="doc-tree">${renderNode({ node: root, isRoot: true })}</div>`;
  };

  const pluginRoots = new Map(plugins.map((plugin) => [plugin.alias, plugin.root]));

  for (const page of pages) {
    let parts: string[] = [];

    if (page.group === 'core') {
      const rel = relative(WORKSPACE_ROOT, page.source).split(sep).join('/');
      const dir = dirname(rel);
      const subParts = dir === '.' || dir === '' ? [] : dir.split('/').map((part) => part.toLowerCase());
      parts = ['core', ...subParts];
    } else {
      const pluginRoot = pluginRoots.get(page.group) ?? WORKSPACE_ROOT;
      const rel = relative(pluginRoot, page.source).split(sep).join('/');
      const dir = dirname(rel);
      const subParts = dir === '.' || dir === '' ? [] : dir.split('/').map((part) => part.toLowerCase());
      parts = ['plugins', page.group.toLowerCase(), ...subParts];
    }

    const breadcrumbHtml = buildBreadcrumb({ parts, isFolderPage: false });
    writePage(page.route, renderPage({ title: page.title, route: page.route, body: page.body, breadcrumbHtml }));
  }

  type FolderEntry = {
    route: string;
    title: string;
    parts: string[];
    baseRoot: string;
    isCore: boolean;
    pages: DocPage[];
  };

  const folderEntries = new Map<string, FolderEntry>();

  for (const page of pages) {
    if (page.group === 'core') {
      const rel = relative(WORKSPACE_ROOT, page.source).split(sep).join('/');
      const dir = dirname(rel);

      if (dir !== '.' && dir !== '') {
        const parts = dir.split('/');

        for (let i = 1; i <= parts.length; i += 1) {
          const subRel = parts.slice(0, i).join('/');
          const folderRoute = `/docs/core/${subRel.toLowerCase()}/`;
          const folderAbsPath = resolve(WORKSPACE_ROOT, subRel);
          const folderParts = ['core', ...parts.slice(0, i).map((part) => part.toLowerCase())];

          if (!folderEntries.has(folderRoute)) {
            folderEntries.set(folderRoute, {
              route: folderRoute,
              title: `core/${subRel}`,
              parts: folderParts,
              baseRoot: folderAbsPath,
              isCore: false,
              pages: [],
            });
          }

          folderEntries.get(folderRoute)!.pages.push(page);
        }
      }
    } else {
      const pluginRoot = pluginRoots.get(page.group) ?? WORKSPACE_ROOT;
      const rel = relative(pluginRoot, page.source).split(sep).join('/');
      const dir = dirname(rel);

      if (dir !== '.' && dir !== '') {
        const parts = dir.split('/');

        for (let i = 1; i <= parts.length; i += 1) {
          const subRel = parts.slice(0, i).join('/');
          const folderRoute = `/docs/plugins/${page.group}/${subRel.toLowerCase()}/`;
          const folderAbsPath = resolve(pluginRoot, subRel);
          const folderParts = ['plugins', page.group.toLowerCase(), ...parts.slice(0, i).map((part) => part.toLowerCase())];

          if (!folderEntries.has(folderRoute)) {
            folderEntries.set(folderRoute, {
              route: folderRoute,
              title: `${page.group}/${subRel}`,
              parts: folderParts,
              baseRoot: folderAbsPath,
              isCore: false,
              pages: [],
            });
          }

          folderEntries.get(folderRoute)!.pages.push(page);
        }
      }
    }
  }

  for (const entry of folderEntries.values()) {
    const tree = renderDocTree({
      items: entry.pages,
      baseRoot: entry.baseRoot,
      isCore: entry.isCore,
    });
    const body = `<h1>${escapeHtml(entry.title)} documentation</h1>${tree}`;
    const breadcrumbHtml = buildBreadcrumb({
      parts: entry.parts,
      isFolderPage: true,
    });

    writePage(entry.route, renderPage({
      title: `${entry.title} documentation`,
      route: entry.route,
      body,
      breadcrumbHtml,
    }));
  }

  const coreTree = renderDocTree({
    items: pages.filter((page) => page.group === 'core'),
    baseRoot: WORKSPACE_ROOT,
    isCore: true,
  });

  const coreBreadcrumbHtml = buildBreadcrumb({ parts: ['core'], isFolderPage: true });
  writePage('/docs/core/', renderPage({
    title: 'Core documentation',
    route: '/docs/core/',
    body: `<h1>Core documentation</h1>${coreTree}`,
    breadcrumbHtml: coreBreadcrumbHtml,
  }));

  const pluginsBreadcrumbHtml = buildBreadcrumb({ parts: ['plugins'], isFolderPage: true });
  let pluginsIndexBody = '<h1>Plugins documentation</h1>';

  for (const [alias, name] of groups) {
    const entries = pages.filter((page) => page.group === alias);
    const route = `/docs/plugins/${alias}/`;
    const pluginRoot = pluginRoots.get(alias) ?? WORKSPACE_ROOT;
    const tree = renderDocTree({ items: entries, baseRoot: pluginRoot, isCore: false });
    const body = `<h1>${escapeHtml(name)} documentation</h1><p><a href="${officialApps.find((app) => app.alias === alias)!.href}">App page</a></p>${tree}`;
    const breadcrumbHtml = buildBreadcrumb({ parts: ['plugins', alias.toLowerCase()], isFolderPage: true });

    writePage(route, renderPage({
      title: `${name} documentation`,
      route,
      body,
      breadcrumbHtml,
    }));

    pluginsIndexBody += `<h2><a href="${route}">${escapeHtml(name)}</a></h2>${tree}`;
  }

  writePage('/docs/plugins/', renderPage({
    title: 'Plugins documentation',
    route: '/docs/plugins/',
    body: pluginsIndexBody,
    breadcrumbHtml: pluginsBreadcrumbHtml,
  }));

  const rootBreadcrumbHtml = buildBreadcrumb({ parts: [], isFolderPage: true });
  let indexBody = `<h1>AppWeaver documentation</h1><h2><a href="/docs/core/">Core</a></h2>${coreTree}<h2><a href="/docs/plugins/">Plugins</a></h2>`;

  for (const [alias, name] of groups) {
    const entries = pages.filter((page) => page.group === alias);
    const route = `/docs/plugins/${alias}/`;
    const pluginRoot = pluginRoots.get(alias) ?? WORKSPACE_ROOT;
    const tree = renderDocTree({ items: entries, baseRoot: pluginRoot, isCore: false });
    indexBody += `<h2><a href="${route}">${escapeHtml(name)}</a></h2>${tree}`;
  }

  writePage('/docs/', renderPage({
    title: 'Documentation',
    route: '/docs/',
    body: indexBody,
    breadcrumbHtml: rootBreadcrumbHtml,
  }));

  const docRoutes = [
    '/docs/',
    '/docs/core/',
    '/docs/plugins/',
    ...[...groups.keys()].map((alias) => `/docs/plugins/${alias}/`),
    ...[...folderEntries.keys()],
    ...pages.map((page) => page.route),
  ];
  const sitemapPath = resolve(LANDING_ROOT, 'public/sitemap.xml');

  if (existsSync(sitemapPath)) {
    const sitemap = readFileSync(sitemapPath, 'utf8').replace(/\s*<url>\s*<loc>https:\/\/getappweaver\.com\/docs\/[\s\S]*?<\/url>/g, '');
    const urls = docRoutes.map((route) => `  <url><loc>${SITE_ORIGIN}${route}</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`).join('\n');
    writeFileSync(sitemapPath, sitemap.replace('</urlset>', `${urls}\n</urlset>`));
  }

  console.log(`Generated ${pages.length} documentation pages plus core/plugin indexes.`);
  return docRoutes;
}

if (import.meta.main) {
  generateDocs();
}

