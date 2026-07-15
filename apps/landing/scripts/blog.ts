#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import type { EventTemplate, NostrEvent, VerifiedEvent } from 'nostr-tools';
import { nip19, verifyEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { getEventHash } from 'nostr-tools/pure';
import { z } from 'zod';

import { openCoreDb } from '@src/db';
import { bunkerSignEvent } from '@src/nostr/bunker';
import { listConnections, type ConnectionRow } from '@src/nostr/connections';
import {
  publishSignedEventToRelays,
  summarizeRelayOutcomes,
} from '@src/nostr/relay-publish';

const LANDING_ROOT = resolve(import.meta.dirname, '..');
const BLOG_ROOT = join(LANDING_ROOT, 'blog');
const BLOG_CSS_PATH = join(LANDING_ROOT, 'src', 'blog.css');
const LIGHTBOX_CSS_PATH = join(LANDING_ROOT, 'src', 'lightbox.css');
const PUBLIC_BLOG_ROOT = join(LANDING_ROOT, 'public', 'blog');
const PUBLIC_ROOT = join(LANDING_ROOT, 'public');
const NIP23_LONG_FORM_KIND = 30023;
const SITE_ORIGIN = 'https://getappweaver.com';
const DEFAULT_BLOG_IMAGE = `${SITE_ORIGIN}/favicon/android-chrome-512x512.png`;
const STATIC_SITEMAP_PATHS = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/apps/todo', priority: '0.8', changefreq: 'monthly' },
  { path: '/apps/bookmark-manager', priority: '0.8', changefreq: 'monthly' },
  { path: '/apps/captains-log', priority: '0.8', changefreq: 'monthly' },
  { path: '/apps/job-scheduler', priority: '0.8', changefreq: 'monthly' },
  { path: '/apps/nostr-radar', priority: '0.8', changefreq: 'monthly' },
  { path: '/apps/file-manager', priority: '0.8', changefreq: 'monthly' },
  { path: '/blog/', priority: '0.7', changefreq: 'weekly' },
] as const;

const EventSchema = z.object({
  id: z.string().length(64).optional(),
  pubkey: z.string().length(64),
  created_at: z.number().int().optional(),
  kind: z.number().int().optional(),
  tags: z.array(z.array(z.string())),
  content: z.string().optional(),
  sig: z.string().length(128).optional(),
});

const BlogWrapperSchema = z.object({
  relays: z.array(z.string().url()).min(1),
  markdown: z.string().min(1),
  'nostr-footer': z.string().min(1).optional(),
  event: EventSchema,
});

type BlogWrapper = z.infer<typeof BlogWrapperSchema>;

type LoadedPost = {
  wrapperPath: string;
  wrapper: BlogWrapper;
  markdown: string;
};

type BlogPost = {
  title: string;
  summary: string;
  image: string | null;
  publishedAt: number | null;
  slug: string;
  tags: string[];
  relays: string[];
  naddr: string;
  event: BlogWrapper['event'];
  markdown: string;
};

type Command = 'build' | 'publish' | 'sync';

type RenderPageProps = {
  title: string;
  description: string;
  body: string;
  canonicalPath: string;
  image: string | null;
  pageType: 'article' | 'website';
  stylesheet: string;
};

type PublishPostProps = {
  loaded: LoadedPost;
  publishContent: string;
  pool: SimplePool;
  connections: ConnectionRow[];
};

type SignPostProps = {
  loaded: LoadedPost;
  publishContent: string;
  pool: SimplePool;
  connection: ConnectionRow;
  createdAt: number;
};

type SitemapEntry = {
  path: string;
  priority: string;
  changefreq: string;
};

function usage(): string {
  return `Usage: bun apps/landing/scripts/blog.ts <build|publish|sync>

Blog source files live in apps/landing/blog/*.json with this shape:
{
  "relays": ["wss://relay.example"],
  "markdown": "./my-post.md",
  "event": {
    "pubkey": "<64 hex pubkey matching a saved bunker connection>",
    "kind": 30023,
    "tags": [["d", "my-post"], ["title", "My Post"], ["summary", "..."]],
    "content": "",
    "id": "...",
    "sig": "..."
  }
}`;
}

function assertCommand(raw: string | undefined): Command {
  if (raw === 'build' || raw === 'publish' || raw === 'sync') {
    return raw;
  }

  throw new Error(usage());
}

function getTag(event: BlogWrapper['event'], name: string): string | null {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? null;
}

function getTags(event: BlogWrapper['event'], name: string): string[] {
  return event.tags
    .filter((tag) => tag[0] === name)
    .map((tag) => tag[1])
    .filter((value): value is string => Boolean(value));
}

function requireIdentifier(event: BlogWrapper['event'], wrapperPath: string): string {
  const identifier = getTag(event, 'd');

  if (!identifier) {
    throw new Error(`${wrapperPath}: NIP-23 event must include a ["d", "..."] tag`);
  }

  return identifier;
}

function unsignedEventFromWrapper(wrapper: BlogWrapper): EventTemplate & {
  pubkey: string;
} {
  return {
    pubkey: wrapper.event.pubkey,
    kind: NIP23_LONG_FORM_KIND,
    created_at: wrapper.event.created_at ?? Math.floor(Date.now() / 1000),
    tags: wrapper.event.tags,
    content: wrapper.event.content ?? '',
  };
}

function isSigningNeeded(wrapper: BlogWrapper): boolean {
  const event = unsignedEventFromWrapper(wrapper);
  const computedId = getEventHash(event);

  return !wrapper.event.id || !wrapper.event.sig || wrapper.event.id !== computedId;
}

function verifiedEventFromWrapper(wrapper: BlogWrapper, wrapperPath: string): VerifiedEvent {
  const event = {
    ...unsignedEventFromWrapper(wrapper),
    id: wrapper.event.id,
    sig: wrapper.event.sig,
  } as NostrEvent;

  if (!event.id || !event.sig || !verifyEvent(event)) {
    throw new Error(`${wrapperPath}: signed event failed Nostr signature verification`);
  }

  return event;
}

function findMatchingConnection(
  connections: ConnectionRow[],
  pubkey: string,
): ConnectionRow | null {
  return (
    connections.find(
      (connection) =>
        connection.method === 'bunker' && connection.data.userPubkey === pubkey,
    ) ?? null
  );
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) {
    return '';
  }

  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

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

function slugToPath(slug: string): string {
  return `/blog/${encodeURIComponent(slug)}/`;
}

function tagToPath(tag: string): string {
  return `/blog/tag/${encodeURIComponent(tag)}/`;
}

function renderPostList(posts: BlogPost[]): string {
  return `<ul class="blog-post-list">
    ${posts
      .map(
        (post) => `<li class="blog-post-card">
      <a class="blog-post-card-title" href="${slugToPath(post.slug)}">${escapeHtml(post.title)}</a>
      <div class="blog-post-card-meta">${escapeHtml(formatDate(post.publishedAt))}</div>
      <p>${escapeHtml(post.summary)}</p>
    </li>`,
      )
      .join('\n')}
  </ul>`;
}

function renderTagLinks(tags: string[]): string {
  return tags
    .map(
      (tag) => `<a class="tag" href="${tagToPath(tag)}">#${escapeHtml(tag)}</a>`,
    )
    .join('');
}

function inlineMarkdown(value: string): string {
  let html = escapeHtml(value);

  html = html.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (_match, alt, src) => {
    return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_match, label, href) => {
    return `<a href="${escapeAttribute(href)}">${label}</a>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return html;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    blocks.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push(`<ul>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (codeLines) {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
      } else {
        flushParagraph();
        flushList();
        codeLines = [];
      }

      continue;
    }

    if (codeLines) {
      codeLines.push(line);

      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();

      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushList();

      const level = heading[1].length;

      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);

      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);

    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);

      continue;
    }

    const quote = /^>\s?(.+)$/.exec(line);

    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);

      continue;
    }

    paragraph.push(line.trim());
  }

  if (codeLines) {
    blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  flushParagraph();
  flushList();

  return blocks.join('\n');
}

function postFromLoaded(loaded: LoadedPost): BlogPost {
  const { wrapper, markdown, wrapperPath } = loaded;
  const slug = requireIdentifier(wrapper.event, wrapperPath);
  const title = getTag(wrapper.event, 'title') ?? slug;
  const summary = getTag(wrapper.event, 'summary') ?? '';
  const image = getTag(wrapper.event, 'image');
  const publishedAtRaw = getTag(wrapper.event, 'published_at');
  const publishedAt = publishedAtRaw ? Number(publishedAtRaw) : null;

  return {
    title,
    summary,
    image,
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
    slug,
    tags: getTags(wrapper.event, 't'),
    relays: wrapper.relays,
    naddr: nip19.naddrEncode({
      kind: NIP23_LONG_FORM_KIND,
      pubkey: wrapper.event.pubkey,
      identifier: slug,
      relays: wrapper.relays,
    }),
    event: wrapper.event,
    markdown,
  };
}

function absoluteSiteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}

function renderSitemapUrl({ path, priority, changefreq }: SitemapEntry): string {
  return `  <url>
    <loc>${escapeHtml(absoluteSiteUrl(path))}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function renderSitemap(posts: BlogPost[], tags: string[]): string {
  const urls = [
    ...STATIC_SITEMAP_PATHS.map((entry) =>
      renderSitemapUrl(entry),
    ),
    ...posts.map((post) =>
      renderSitemapUrl({
        path: slugToPath(post.slug),
        priority: '0.6',
        changefreq: 'monthly',
      }),
    ),
    ...tags.map((tag) =>
      renderSitemapUrl({
        path: tagToPath(tag),
        priority: '0.4',
        changefreq: 'monthly',
      }),
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

async function writeSeoDiscoveryFiles(
  posts: BlogPost[],
  tags: string[],
): Promise<void> {
  await writeTextFile(join(PUBLIC_ROOT, 'sitemap.xml'), renderSitemap(posts, tags));
  await writeTextFile(
    join(PUBLIC_ROOT, 'robots.txt'),
    `User-agent: *
Allow: /

Sitemap: ${absoluteSiteUrl('/sitemap.xml')}
`,
  );
}

function renderPage({
  title,
  description,
  body,
  canonicalPath,
  image,
  pageType,
  stylesheet,
}: RenderPageProps): string {
  const canonicalUrl = absoluteSiteUrl(canonicalPath);
  const socialImage = image ?? DEFAULT_BLOG_IMAGE;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}">
    <link rel="canonical" href="${escapeAttribute(canonicalUrl)}">
    <meta property="og:site_name" content="AppWeaver">
    <meta property="og:type" content="${pageType}">
    <meta property="og:title" content="${escapeAttribute(title)}">
    <meta property="og:description" content="${escapeAttribute(description)}">
    <meta property="og:url" content="${escapeAttribute(canonicalUrl)}">
    <meta property="og:image" content="${escapeAttribute(socialImage)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeAttribute(title)}">
    <meta name="twitter:description" content="${escapeAttribute(description)}">
    <meta name="twitter:image" content="${escapeAttribute(socialImage)}">
    <link
      rel="apple-touch-icon"
      sizes="180x180"
      href="${escapeAttribute(absoluteSiteUrl('/favicon/apple-touch-icon.png'))}"
    />
    <link
      rel="icon"
      type="image/png"
      sizes="32x32"
      href="${escapeAttribute(absoluteSiteUrl('/favicon/favicon-32x32.png'))}"
    />
    <link
      rel="icon"
      type="image/png"
      sizes="16x16"
      href="${escapeAttribute(absoluteSiteUrl('/favicon/favicon-16x16.png'))}"
    />
    <link rel="shortcut icon" href="${escapeAttribute(absoluteSiteUrl('/favicon/favicon.ico'))}" />
    <link rel="manifest" href="${escapeAttribute(absoluteSiteUrl('/favicon/site.webmanifest'))}" />
    <style>${stylesheet}</style>
  </head>
  <body class="blog-static-page">
    <div class="shell">
      <header class="top">
        <a class="brand" href="/">AppWeaver</a>
        <nav class="nav"><a href="/blog/">Blog</a><a href="/">Home</a></nav>
      </header>
      ${body}
      <footer class="bottom">
        <a class="brand" href="/">AppWeaver</a>
        <nav class="nav"><a href="/blog/">Blog</a><a href="/">Home</a></nav>
      </footer>
    </div>
    <script>
      (() => {
        const imageSelector = '.blog-static-page article .cover, .blog-static-page article .content img';
        const images = [...document.querySelectorAll(imageSelector)];

        if (images.length === 0) {
          return;
        }

        let lightbox = null;

        function closeLightbox() {
          lightbox?.remove();
          lightbox = null;
          document.body.classList.remove('blog-lightbox-open');
        }

        function openLightbox(image) {
          closeLightbox();

          const src = image.currentSrc || image.src;
          const alt = image.alt || 'Blog image';

          lightbox = document.createElement('div');
          lightbox.className = 'lightbox blog-image-lightbox';
          lightbox.setAttribute('role', 'dialog');
          lightbox.setAttribute('aria-modal', 'true');
          lightbox.innerHTML = '<button type="button" class="lightbox__backdrop" aria-label="Close image"></button><figure class="lightbox__card lightbox__card--screenshot"><div class="lightbox__head"><figcaption></figcaption><button type="button" class="lightbox__close" aria-label="Close">✕</button></div><img class="lightbox__media lightbox__media--screenshot" alt=""></figure>';

          const preview = lightbox.querySelector('img');
          const caption = lightbox.querySelector('figcaption');
          const closeButton = lightbox.querySelector('.lightbox__close');

          preview.src = src;
          preview.alt = alt;
          caption.textContent = alt;
          lightbox.querySelector('.lightbox__backdrop')?.addEventListener('click', closeLightbox);
          closeButton?.addEventListener('click', closeLightbox);
          document.body.append(lightbox);
          document.body.classList.add('blog-lightbox-open');
          closeButton?.focus();
        }

        for (const image of images) {
          image.tabIndex = 0;
          image.setAttribute('role', 'button');
          image.setAttribute('aria-label', image.alt ? 'Open image: ' + image.alt : 'Open image');
          image.addEventListener('click', () => openLightbox(image));
          image.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openLightbox(image);
            }
          });
        }

        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            closeLightbox();
          }
        });
      })();
    </script>
  </body>
</html>`;
}

async function loadPosts(): Promise<LoadedPost[]> {
  if (!existsSync(BLOG_ROOT)) {
    return [];
  }

  const entries = await readdir(BLOG_ROOT);
  const wrappers = entries.filter((entry) => entry.endsWith('.json')).sort();

  return Promise.all(
    wrappers.map(async (entry) => {
      const wrapperPath = join(BLOG_ROOT, entry);
      const raw = await readFile(wrapperPath, 'utf8');
      const wrapper = BlogWrapperSchema.parse(JSON.parse(raw));
      const markdownPath = resolve(dirname(wrapperPath), wrapper.markdown);
      const markdown = await readFile(markdownPath, 'utf8');

      return { wrapperPath, wrapper, markdown };
    }),
  );
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function readNostrFooter(loaded: LoadedPost): Promise<string> {
  const footerPath = loaded.wrapper['nostr-footer'];

  if (!footerPath) {
    return '';
  }

  const resolvedPath = resolve(dirname(loaded.wrapperPath), footerPath);

  if (!existsSync(resolvedPath)) {
    return '';
  }

  return (await readFile(resolvedPath, 'utf8')).trim();
}

function composeNostrContent(markdown: string, footer: string): string {
  const body = markdown.trim();

  if (!footer) {
    return `${body}\n`;
  }

  return `${body}\n\n${footer}\n`;
}

async function buildBlog(): Promise<void> {
  const [blogStylesheet, lightboxStylesheet] = await Promise.all([
    readFile(BLOG_CSS_PATH, 'utf8'),
    readFile(LIGHTBOX_CSS_PATH, 'utf8'),
  ]);
  const stylesheet = `${blogStylesheet}\n${lightboxStylesheet}`;
  const posts = (await loadPosts())
    .map(postFromLoaded)
    .sort((a, b) => (b.publishedAt ?? b.event.created_at ?? 0) - (a.publishedAt ?? a.event.created_at ?? 0));

  await mkdir(PUBLIC_BLOG_ROOT, { recursive: true });

  const indexBody = `<main>
  <h1>Blog</h1>
  ${renderPostList(posts)}
</main>`;

  await writeTextFile(
    join(PUBLIC_BLOG_ROOT, 'index.html'),
    renderPage({
      title: 'AppWeaver Blog',
      description:
        'Long-form AppWeaver posts about local-first apps, AI tools, Nostr-native workflows, and building focused plugins for your workspace.',
      body: indexBody,
      canonicalPath: '/blog/',
      image: null,
      pageType: 'website',
      stylesheet,
    }),
  );

  const postsByTag = new Map<string, BlogPost[]>();

  for (const post of posts) {
    for (const tag of post.tags) {
      const taggedPosts = postsByTag.get(tag) ?? [];

      taggedPosts.push(post);
      postsByTag.set(tag, taggedPosts);
    }
  }

  await Promise.all(
    [...postsByTag.entries()].map(async ([tag, taggedPosts]) => {
      const tagBody = `<main>
  <h1>#${escapeHtml(tag)}</h1>
  <p class="summary">Posts tagged #${escapeHtml(tag)}.</p>
  ${renderPostList(taggedPosts)}
</main>`;

      await writeTextFile(
        join(PUBLIC_BLOG_ROOT, 'tag', encodeURIComponent(tag), 'index.html'),
        renderPage({
          title: `#${tag} · AppWeaver Blog`,
          description: `AppWeaver blog posts tagged #${tag}, covering local-first apps, AI tools, Nostr workflows, and plugin development.`,
          body: tagBody,
          canonicalPath: tagToPath(tag),
          image: taggedPosts[0]?.image ?? null,
          pageType: 'website',
          stylesheet,
        }),
      );
    }),
  );

  await writeSeoDiscoveryFiles(posts, [...postsByTag.keys()].sort());

  await Promise.all(
    posts.map(async (post) => {
      const postBody = `<main>
  <article>
    <p class="meta">${escapeHtml(formatDate(post.publishedAt))}</p>
    <h1>${escapeHtml(post.title)}</h1>
    ${post.summary ? `<p class="summary">${escapeHtml(post.summary)}</p>` : ''}
    ${post.image ? `<img class="cover" src="${escapeAttribute(post.image)}" alt="">` : ''}
    ${post.tags.length > 0 ? `<div class="tags">${renderTagLinks(post.tags)}</div>` : ''}
    <div class="content">${markdownToHtml(post.markdown)}</div>
    <a class="nostr-link" href="nostr:${post.naddr}">Open as Nostr article</a>
  </article>
</main>`;

      await writeTextFile(
        join(PUBLIC_BLOG_ROOT, post.slug, 'index.html'),
        renderPage({
          title: `${post.title} · AppWeaver Blog`,
          description: post.summary,
          body: postBody,
          canonicalPath: slugToPath(post.slug),
          image: post.image,
          pageType: 'article',
          stylesheet,
        }),
      );
    }),
  );

  console.log(`Generated ${posts.length} blog post page(s) in ${PUBLIC_BLOG_ROOT}`);
}

async function signPost({
  loaded,
  publishContent,
  pool,
  connection,
  createdAt,
}: SignPostProps): Promise<VerifiedEvent> {
  const { wrapper } = loaded;
  const template: EventTemplate = {
    kind: NIP23_LONG_FORM_KIND,
    created_at: createdAt,
    tags: wrapper.event.tags,
    content: publishContent,
  };

  const signed = await bunkerSignEvent(pool, connection.data, template);

  wrapper.event = {
    ...wrapper.event,
    kind: signed.kind,
    pubkey: signed.pubkey,
    created_at: signed.created_at,
    tags: signed.tags,
    content: signed.content,
    id: signed.id,
    sig: signed.sig,
  };

  await writeFile(loaded.wrapperPath, `${JSON.stringify(wrapper, null, 2)}\n`);

  return signed;
}

async function publishPost({
  loaded,
  publishContent,
  pool,
  connections,
}: PublishPostProps): Promise<void> {
  const { wrapper, wrapperPath } = loaded;
  requireIdentifier(wrapper.event, wrapperPath);

  wrapper.event.kind = NIP23_LONG_FORM_KIND;
  wrapper.event.content = publishContent;

  let signed: VerifiedEvent;

  if (isSigningNeeded(wrapper)) {
    const connection = findMatchingConnection(connections, wrapper.event.pubkey);

    if (!connection) {
      throw new Error(
        `${wrapperPath}: no saved bunker connection signs for event.pubkey ${wrapper.event.pubkey}`,
      );
    }

    signed = await signPost({
      loaded,
      publishContent,
      pool,
      connection,
      createdAt: Math.floor(Date.now() / 1000),
    });

    console.log(`${basename(wrapperPath)}: signed ${signed.id}`);
  } else {
    signed = verifiedEventFromWrapper(wrapper, wrapperPath);
    console.log(`${basename(wrapperPath)}: unchanged ${signed.id}`);
  }

  const outcomes = await publishSignedEventToRelays(wrapper.relays, signed);
  const summary = summarizeRelayOutcomes(outcomes);

  console.log(
    `${basename(wrapperPath)}: accepted ${summary.accepted.map((relay) => relay.relay).join(', ') || 'none'}`,
  );

  if (summary.rejected.length > 0) {
    console.warn(
      `${basename(wrapperPath)}: rejected ${summary.rejected.map((relay) => `${relay.relay}: ${relay.error}`).join('; ')}`,
    );
  }

  if (summary.accepted.length === 0) {
    throw new Error(`${wrapperPath}: publish failed on all relays`);
  }

  console.log(
    `${basename(wrapperPath)}: published ${signed.id} to ${summary.accepted.length}/${wrapper.relays.length} relay(s)`,
  );
}

async function publishBlog(): Promise<void> {
  const posts = await loadPosts();
  const db = openCoreDb();
  const connections = listConnections(db);
  const pool = new SimplePool({ enablePing: true, enableReconnect: true });
  const poolRelays = [
    ...new Set([
      ...posts.flatMap((post) => post.wrapper.relays),
      ...connections.flatMap((connection) => connection.data.relays),
    ]),
  ];

  try {
    for (const loaded of posts) {
      const nostrFooter = await readNostrFooter(loaded);

      await publishPost({
        loaded,
        publishContent: composeNostrContent(loaded.markdown, nostrFooter),
        pool,
        connections,
      });
    }
  } finally {
    pool.close(poolRelays);
  }
}

async function main(): Promise<void> {
  const command = assertCommand(process.argv[2]);

  if (command === 'build') {
    await buildBlog();

    return;
  }

  if (command === 'publish') {
    await publishBlog();

    return;
  }

  await publishBlog();
  await buildBlog();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    if (err instanceof Error) {
      console.error(err.stack ?? err.message);
    } else {
      console.error(String(err));
    }

    process.exit(1);
  });
