#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { landingFeatures } from '../src/landing-features';
import type { OfficialApp } from '../src/landing-data';
import { officialApps, officialAuthor } from '../src/landing-data';
import { pluginAssetUrl } from '../src/plugin-content';
import { buildBlog } from './blog';
import { generateDocs } from './generate-docs';

const LANDING_ROOT = resolve(import.meta.dirname, '..');
const DIST_ROOT = join(LANDING_ROOT, 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');
const SITE_ORIGIN = 'https://getappweaver.com';
const LOGO_URL = '/appweaver-logo-accent.svg';

type NavItem = {
  label: string;
  href: string;
  isActive: boolean;
};

type HeaderProps = {
  isIntroActive: boolean;
  navItems: NavItem[];
};

type BlogPostPreview = {
  title: string;
  summary: string;
  href: string;
  publishedAt: number;
  tags: string[];
};

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
  return `${SITE_ORIGIN}${app.installScreenshot ?? app.iconSrc ?? '/favicon/android-chrome-512x512.png'}`;
}

function renderHeader({ isIntroActive, navItems }: HeaderProps): string {
  return `<header class="stage-header">
      <a
        href="/"
        class="stage-brand${isIntroActive ? ' stage-brand--intro-active' : ''}"
        ${isIntroActive ? 'aria-hidden="true" tabindex="-1"' : ''}
      >
        <img src="${LOGO_URL}" alt="AppWeaver" class="stage-brand-logo" />
        <span class="stage-brand-text" aria-hidden="true">AppWeaver</span>
      </a>
      <nav class="stage-nav-simple" aria-label="Landing pages">
        ${navItems
          .map(
            (item) => `<a
              href="${escapeAttribute(item.href)}"
              class="stage-nav-simple-item${item.isActive ? ' is-active' : ''}"
              ${item.isActive ? 'aria-current="location"' : ''}
            >${escapeHtml(item.label)}</a>`,
          )
          .join('\n        ')}
      </nav>
    </header>`;
}

function renderFooter(): string {
  return `<footer class="site-footer">
      <div class="site-footer-brand">AppWeaver</div>
      <nav class="site-footer-links" aria-label="AppWeaver social links">
        <a href="/docs/">
          <svg class="site-footer-link-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
          <span>Docs</span>
        </a>
        <a href="https://github.com/getappweaver" rel="noreferrer" target="_blank">
          <svg class="site-footer-link-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"/></svg>
          <span>GitHub</span>
        </a>
        <a href="https://gitworkshop.dev/getappweaver.com" rel="noreferrer" target="_blank">
          <svg class="site-footer-link-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
          <span>Nostr Git</span>
        </a>
        <a href="https://nosta.me/getappweaver.com" rel="noreferrer" target="_blank">
          <svg class="site-footer-link-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="47 43 167 167" fill="currentColor" aria-hidden="true"><path d="M210.8 199.4c0 3.1-2.5 5.7-5.7 5.7h-68c-3.1 0-5.7-2.5-5.7-5.7v-15.5c.3-19 2.3-37.2 6.5-45.5 2.5-5 6.7-7.7 11.5-9.1 9.1-2.7 24.9-.9 31.7-1.2 0 0 20.4.8 20.4-10.7s-9.1-8.6-9.1-8.6c-10 .3-17.7-.4-22.6-2.4-8.3-3.3-8.6-9.2-8.6-11.2-.4-23.1-34.5-25.9-64.5-20.1-32.8 6.2.4 53.3.4 116.1v8.4c0 3.1-2.6 5.6-5.7 5.6H57.7c-3.1 0-5.7-2.5-5.7-5.7v-144c0-3.1 2.5-5.7 5.7-5.7h31.7c3.1 0 5.7 2.5 5.7 5.7 0 4.7 5.2 7.2 9 4.5 11.4-8.2 26-12.5 42.4-12.5 36.6 0 64.4 21.4 64.4 68.7v83.2ZM150 99.3c0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1 5.4 12.1 12.1S150 106 150 99.3Z"/></svg>
          <span>Nostr</span>
        </a>
        <a href="https://x.com/getappweaver" rel="noreferrer" target="_blank" aria-label="X">
          <svg class="site-footer-link-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>
        <a href="https://www.linkedin.com/company/getappweaver" rel="noreferrer" target="_blank">
          <svg class="site-footer-link-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 34 34" fill="currentColor" aria-hidden="true"><path d="M34 2.5v29a2.5 2.5 0 0 1-2.5 2.5h-29A2.5 2.5 0 0 1 0 31.5v-29A2.5 2.5 0 0 1 2.5 0h29A2.5 2.5 0 0 1 34 2.5M10 13H5v16h5zm.45-5.5a2.88 2.88 0 0 0-2.86-2.9H7.5a2.9 2.9 0 0 0 0 5.8 2.88 2.88 0 0 0 2.95-2.81zM29 19.28c0-4.81-3.06-6.68-6.1-6.68a5.7 5.7 0 0 0-5.06 2.58h-.14V13H13v16h5v-8.51a3.32 3.32 0 0 1 3-3.58h.19c1.59 0 2.77 1 2.77 3.52V29h5z"/></svg>
          <span>LinkedIn</span>
        </a>
      </nav>
    </footer>`;
}

function renderInstallBlock(title: string | null = null): string {
  return `<div class="hero-install-block">
      ${title ? `<h3 class="hero-install-title">${escapeHtml(title)}</h3>` : ''}
      <div class="hero-install-label">Go to your project/workspace folder and run:</div>
      <div class="hero-install-command command-copy-block" aria-label="Install command">
        <button
          type="button"
          class="command-copy-button"
          aria-label="Copy install command"
          title="Copy"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </button>
        <div class="command-copy-lines">
          <code>git clone --depth=1 https://github.com/getappweaver/core.git appweaver</code>
          <code>cd appweaver &amp;&amp; bun install &amp;&amp; bun run start</code>
        </div>
      </div>
      <div class="hero-actions">
        <a
          href="https://github.com/getappweaver/core/blob/main/DOCKER.md"
          class="hero-install-guide-link"
          rel="noreferrer"
          target="_blank"
        >
          Alternative: Docker
        </a>
      </div>
    </div>`;
}

function renderOfficialAppGrid(apps: OfficialApp[]): string {
  return `<div class="official-app-grid">
      ${apps
        .map(
          (app) => `<article class="official-app-card">
          <a class="official-app-card-heading" href="${escapeAttribute(app.href)}">
            ${
              app.iconSrc
                ? `<img class="official-app-icon" src="${escapeAttribute(app.iconSrc)}" alt="" aria-hidden="true" />`
                : ''
            }
            <span class="official-app-heading-copy">
              <span class="official-app-label">${escapeHtml(app.label)}</span>
              <span class="official-app-name">${escapeHtml(app.name)}</span>
            </span>
          </a>
          <p class="official-app-description">${escapeHtml(app.description)}</p>
          ${
            app.hasInteractiveDemo
              ? `<a class="official-app-link" href="${escapeAttribute(app.href)}">Interactive Demo</a>`
              : ''
          }
        </article>`,
        )
        .join('\n      ')}
    </div>`;
}

function renderFeaturesAccordion(): string {
  return `<div class="features-accordion" aria-label="AppWeaver feature groups">
      ${landingFeatures
        .map(
          (feature, index) => `<div class="feature-panel${index === 0 ? ' feature-panel--open' : ''}">
          <button
            type="button"
            class="feature-panel-summary"
            aria-expanded="${index === 0 ? 'true' : 'false'}"
          >
            <span class="feature-panel-mark" aria-hidden="true"></span>
            <span class="feature-panel-title">${escapeHtml(feature.title)}</span>
          </button>
          <div class="feature-panel-body">
            <ul class="feature-panel-list">
              ${feature.points
                .map((point) => `<li class="feature-panel-point">${point}</li>`)
                .join('\n              ')}
            </ul>
          </div>
        </div>`,
        )
        .join('\n      ')}
    </div>`;
}

async function loadRecentBlogPosts(): Promise<BlogPostPreview[]> {
  const blogDir = join(LANDING_ROOT, 'blog');
  if (!existsSync(blogDir)) {
    return [];
  }

  const entries = await readdir(blogDir);
  const jsonFiles = entries.filter((entry) => entry.endsWith('.json')).sort();
  const posts: BlogPostPreview[] = [];

  for (const filename of jsonFiles) {
    try {
      const raw = await readFile(join(blogDir, filename), 'utf8');
      const data = JSON.parse(raw);
      const event = data.event;
      if (!event || !Array.isArray(event.tags)) {
        continue;
      }

      const slug = event.tags.find((tag: string[]) => tag[0] === 'd')?.[1];
      const title = event.tags.find((tag: string[]) => tag[0] === 'title')?.[1];
      const summary = event.tags.find((tag: string[]) => tag[0] === 'summary')?.[1] ?? '';
      const publishedAt = event.created_at ?? 0;
      const tags = event.tags
        .filter((tag: string[]) => tag[0] === 't')
        .map((tag: string[]) => tag[1])
        .filter(Boolean);

      if (slug && title) {
        posts.push({
          title,
          summary,
          href: `/blog/${slug}`,
          publishedAt,
          tags,
        });
      }
    } catch {
      // Ignore invalid files
    }
  }

  posts.sort((a, b) => b.publishedAt - a.publishedAt);
  return posts.slice(0, 3);
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function renderBlogPostsSection(posts: BlogPostPreview[]): string {
  return `<section class="blog-posts-section">
      <h2 class="section-title short-viewport-section-title">
        <a href="/blog">Latest Blog Posts</a>
      </h2>
      <div class="blog-posts-grid">
        ${posts
          .map(
            (post) => `<article class="blog-post-card">
            <span class="blog-post-card-date">${escapeHtml(formatDate(post.publishedAt))}</span>
            <a href="${escapeAttribute(post.href)}" class="blog-post-card-title">${escapeHtml(post.title)}</a>
            <p class="blog-post-card-summary">${escapeHtml(post.summary)}</p>
            ${
              post.tags.length > 0
                ? `<div class="blog-post-card-tags">
              ${post.tags.map((tag) => `<span class="blog-post-card-tag">#${escapeHtml(tag)}</span>`).join('')}
            </div>`
                : ''
            }
          </article>`,
          )
          .join('\n        ')}
      </div>
    </section>`;
}

function renderRoadmapPanel(): string {
  return `<section class="roadmap-panel">
      <div class="roadmap-panel-header">
        <h3 class="roadmap-panel-title">Core Roadmap</h3>
        <div class="roadmap-panel-meta">relay.ngit.dev</div>
      </div>
      <div class="roadmap-panel-body">
        <div class="roadmap-panel-status">Loading roadmap from relay.ngit.dev</div>
      </div>
    </section>`;
}

function renderIndexMarkup(recentPosts: BlogPostPreview[]): string {
  const navItems: NavItem[] = [
    { label: 'Intro', href: '#intro', isActive: true },
    { label: 'Features', href: '#features', isActive: false },
    { label: 'Demo', href: '#demo', isActive: false },
    { label: 'Apps', href: '#apps', isActive: false },
    { label: 'More', href: '#more', isActive: false },
  ];

  return `<div class="stage-page">
  <div class="stage-background"></div>
  <div class="stage-shell">
    ${renderHeader({ isIntroActive: true, navItems })}
    <main class="page-sections">
      <div class="one-page-stage">
        <section id="intro" class="one-page-section one-page-section--intro">
          <section class="hero-stage">
            <div class="hero-copy">
              <div class="hero-brand" aria-hidden="true">
                <div class="hero-brand-text">AppWeaver</div>
                <img src="${LOGO_URL}" alt="" class="hero-brand-logo" />
              </div>
              <h1 class="hero-title">
                An <span class="hero-title-ai">AI</span>-powered
                <span class="hero-title-app-hub">App Hub</span> on a computer
                <span class="hero-title-mark hero-title-mark--computer">
                  you control
                </span>.
              </h1>
              <p class="hero-description">
                Your data stays <span class="hero-description-mark">local-first</span>.
                You choose which
                <a href="#apps" class="hero-description-link hero-apps-link">
                  <span class="hero-apps-icon" aria-hidden="true">
                    <span class="hero-apps-icon-frame hero-apps-icon-frame--todo"></span>
                    <span class="hero-apps-icon-frame hero-apps-icon-frame--bm"></span>
                    <span class="hero-apps-icon-frame hero-apps-icon-frame--jobs"></span>
                    <span class="hero-apps-icon-frame hero-apps-icon-frame--file"></span>
                    <span class="hero-apps-icon-frame hero-apps-icon-frame--journal"></span>
                    <span class="hero-apps-icon-frame hero-apps-icon-frame--nostr-radar"></span>
                  </span>
                  <span class="hero-apps-text">apps</span>
                </a>
                belong in your hub.
              </p>
              <p class="hero-description">
                Use them through
                <a href="#demo" class="hero-description-link">responsive app</a>,
                prompts, local terminal input, WebSocket API, or your favourite
                Nostr chat app.
              </p>
              ${renderInstallBlock()}
            </div>
          </section>
        </section>
        <section id="features" class="one-page-section one-page-section--features">
          <h2 class="section-title short-viewport-section-title">Features</h2>
          ${renderFeaturesAccordion()}
        </section>
        <section id="demo" class="one-page-section one-page-section--demo">
          <h2 class="section-title short-viewport-section-title">Interactive Demo</h2>
          <div class="plugin-demo-view-toggle plugin-demo-view-toggle--interactive" aria-label="Choose interactive demo viewport">
            <button type="button" class="plugin-demo-view-button plugin-demo-view-button--active">Desktop</button>
            <button type="button" class="plugin-demo-view-button">Mobile</button>
          </div>
          <div class="one-page-demo-frame one-page-demo-frame--placeholder" aria-hidden="true"></div>
        </section>
        <section id="apps" class="one-page-section one-page-section--apps">
          <div class="official-apps">
            <h2 class="section-title short-viewport-section-title">Official Apps</h2>
            <div class="section-heading-row">
              <p class="section-summary">
                Each app adds commands, widgets, AI skills, and local data models to your AppWeaver workspace.
              </p>
            </div>
            ${renderOfficialAppGrid(officialApps)}
          </div>
        </section>
        <section id="more" class="one-page-section one-page-section--more">
          <div class="more-section-stack">
            ${renderRoadmapPanel()}
            ${renderBlogPostsSection(recentPosts)}
            ${renderFooter()}
          </div>
        </section>
      </div>
    </main>
  </div>
</div>`;
}

function renderAppMarkup(app: OfficialApp, recentPosts: BlogPostPreview[]): string {
  const otherApps = officialApps.filter((entry) => entry.href !== app.href);
  const navItems: NavItem[] = [
    { label: 'Features', href: '#features', isActive: true },
    { label: app.presentation?.featureGallery ? 'Gallery' : 'Demo', href: app.presentation?.featureGallery ? '#gallery' : '#demo', isActive: false },
    { label: 'Install', href: '#install', isActive: false },
    { label: 'Roadmap', href: '#roadmap', isActive: false },
    { label: 'Apps', href: '#apps', isActive: false },
    { label: 'More', href: '#more', isActive: false },
  ];

  return `<div class="stage-page">
  <div class="stage-background"></div>
  <div class="stage-shell">
    ${renderHeader({ isIntroActive: false, navItems })}
    <main class="page-sections">
      <div class="plugin-page-stage">
        <section id="features" class="plugin-page-section plugin-page-section--features">
          <div class="plugin-page-copy">
            <div class="plugin-page-eyebrow">${escapeHtml(app.label)}</div>
            <div class="plugin-page-hero-title-row">
              ${
                app.iconSrc
                  ? `<img class="plugin-page-hero-icon" src="${escapeAttribute(app.iconSrc)}" alt="" aria-hidden="true" />`
                  : ''
              }
              <h1 class="plugin-page-title">${escapeHtml(app.displayName)}</h1>
            </div>
            <p class="plugin-page-description">${escapeHtml(app.presentation?.description ?? app.description)}</p>
            <ul class="plugin-page-list">
              ${app.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('\n              ')}
            </ul>
          </div>
        </section>
        ${
          app.presentation?.featureGallery
            ? `<section id="gallery" class="plugin-page-section plugin-page-section--gallery" aria-label="${escapeAttribute(app.displayName)} feature gallery">
          <div class="plugin-feature-gallery">
            <div class="plugin-feature-gallery-heading">
              <div class="plugin-page-eyebrow">Feature Gallery</div>
              <h2 class="plugin-section-title">${escapeHtml(app.presentation.featureGallery.title)}</h2>
              <p class="plugin-page-description">${escapeHtml(app.presentation.featureGallery.description)}</p>
            </div>
            <div class="plugin-feature-gallery-list">
              ${app.presentation.featureGallery.items
                .map(
                  (item, idx) => `<article id="feature-${escapeAttribute(item.id)}" class="plugin-feature-gallery-item${idx % 2 === 1 ? ' plugin-feature-gallery-item--reverse' : ''}">
                <div class="plugin-feature-gallery-copy">
                  <div class="plugin-feature-gallery-index">${String(idx + 1).padStart(2, '0')}</div>
                  <h3>${escapeHtml(item.title)}</h3>
                  ${item.description.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
                </div>
                <figure class="plugin-feature-gallery-media">
                  <img src="${escapeAttribute(item.mediaSrc)}" alt="${escapeAttribute(item.mediaAlt)}" class="is-ready" />
                </figure>
              </article>`,
                )
                .join('\n              ')}
            </div>
          </div>
        </section>`
            : `<section id="demo" class="plugin-page-section plugin-page-section--demo" aria-label="${escapeAttribute(app.displayName)} demo">
          <div class="plugin-demo-section">
            <div class="plugin-page-eyebrow">Interactive Demo</div>
            <h2 class="plugin-section-title">See ${escapeHtml(app.displayName)} in action</h2>
            <div class="one-page-demo-frame one-page-demo-frame--placeholder" aria-hidden="true"></div>
          </div>
        </section>`
        }
        <section id="install" class="plugin-page-section plugin-page-section--install">
          <div class="plugin-install-preview" aria-label="${escapeAttribute(app.displayName)} install preview">
            <div class="plugin-install-preview-copy">
              <div class="plugin-page-eyebrow">Plugin Manager</div>
              <h2 class="plugin-section-title">Install from the official app author.</h2>
              <p class="plugin-page-description">
                AppWeaver shows catalog entries before install. Choose ${escapeHtml(app.displayName)} from the official AppWeaver catalog.
                Author: <span class="plugin-install-author-emphasis">${escapeHtml(officialAuthor.label)}</span>.
              </p>
              <div class="plugin-install-command-wrap">
                <div class="hero-install-label">Package name:</div>
                <div class="hero-install-command command-copy-block">
                  <div class="command-copy-lines">
                    <code>${escapeHtml(app.packageName)}</code>
                  </div>
                </div>
              </div>
            </div>
            ${
              app.installScreenshot
                ? `<figure class="plugin-install-screenshot-frame">
              <img class="plugin-install-screenshot is-ready" src="${escapeAttribute(app.installScreenshot)}" alt="${escapeAttribute(app.displayName)} install screenshot" />
            </figure>`
                : ''
            }
          </div>
        </section>
        <section id="roadmap" class="plugin-page-section plugin-page-section--roadmap">
          <div class="more-section-stack">
            <div class="plugin-docs-banner">
              <a href="/docs/plugins/${app.alias}/" class="plugin-docs-link" aria-label="${escapeAttribute(app.displayName)} documentation">
                <span class="plugin-docs-link-icon-wrap" aria-hidden="true">
                  <svg class="plugin-docs-link-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
                </span>
                <span class="plugin-docs-link-content">
                  <span class="plugin-docs-link-eyebrow">Documentation</span>
                  <span class="plugin-docs-link-title">${escapeHtml(app.displayName)} documentation</span>
                  <span class="plugin-docs-link-desc">Read setup guides, configuration options, and command reference</span>
                </span>
                <span class="plugin-docs-link-arrow" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </span>
              </a>
            </div>
          </div>
        </section>
        <section id="apps" class="plugin-page-section plugin-page-section--apps">
          <div class="official-apps">
            <h2 class="section-title short-viewport-section-title">More Official Apps</h2>
            ${renderOfficialAppGrid(otherApps)}
          </div>
        </section>
        <section id="more" class="plugin-page-section plugin-page-section--more">
          <div class="more-section-stack">
            ${renderBlogPostsSection(recentPosts)}
            ${renderFooter()}
          </div>
        </section>
      </div>
    </main>
  </div>
</div>`;
}

function render404Markup(): string {
  const navItems: NavItem[] = [
    { label: 'Home', href: '/', isActive: false },
    { label: 'Docs', href: '/docs/', isActive: false },
    { label: 'Blog', href: '/blog/', isActive: false },
  ];

  return `<div class="stage-page">
  <div class="stage-background"></div>
  <div class="stage-shell">
    ${renderHeader({ isIntroActive: false, navItems })}
    <main class="page-sections">
      <div class="one-page-stage" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; text-align: center; padding: 2rem;">
        <div class="plugin-page-eyebrow" style="color: var(--color-warning, #f59e0b); font-family: monospace; font-size: 1.25rem; margin-bottom: 0.5rem;">404 · NOT FOUND</div>
        <h1 class="hero-title" style="font-size: 2.5rem; margin-bottom: 1rem;">Page not found</h1>
        <p class="hero-description" style="max-width: 480px; margin: 0 auto 2rem auto; color: #a1a1aa;">
          The page you're looking for doesn't exist or has been moved to another location.
        </p>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center;">
          <a href="/" class="stage-nav-simple-item is-active" style="padding: 0.5rem 1.25rem;">← Return Home</a>
          <a href="/docs/" class="stage-nav-simple-item" style="padding: 0.5rem 1.25rem;">Documentation</a>
          <a href="/blog/" class="stage-nav-simple-item" style="padding: 0.5rem 1.25rem;">Blog</a>
        </div>
      </div>
    </main>
    ${renderFooter()}
  </div>
</div>`;
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

function renderPluginPageHtml(baseHtml: string, app: OfficialApp, recentPosts: BlogPostPreview[]): string {
  const title = `${app.displayName} for AppWeaver | AppWeaver`;
  const canonicalUrl = `${SITE_ORIGIN}${app.href}`;
  const imageUrl = appImageUrl(app);
  const markup = renderAppMarkup(app, recentPosts);

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
      `<meta property="twitter:title" content="${escapeAttribute(title)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="twitter:description" content="${escapeAttribute(app.description)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
      `<meta property="twitter:image" content="${escapeAttribute(imageUrl)}" />`,
    )
    .replace(
      /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${renderStructuredData(app)}</script>`,
    )
    .replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
}

function renderIndexPageHtml(baseHtml: string, recentPosts: BlogPostPreview[]): string {
  const markup = renderIndexMarkup(recentPosts);
  return baseHtml.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
}

function render404PageHtml(baseHtml: string): string {
  const markup = render404Markup();
  return baseHtml
    .replace(/<title>[^<]*<\/title>/, '<title>Page Not Found | AppWeaver</title>')
    .replace('<div id="root"></div>', `<div id="root">${markup}</div>`)
    // Remove hydration script for the static 404 page
    .replace(/<script type="module" crossorigin src="[^"]*"><\/script>/, '');
}

export async function generateSite(): Promise<void> {
  console.log('Generating documentation...');
  const docRoutes = generateDocs();

  console.log('Building blog and sitemap...');
  await buildBlog(docRoutes);

  let baseHtml: string;
  try {
    baseHtml = await readFile(INDEX_PATH, 'utf8');
  } catch {
    throw new Error('dist/index.html not found. Run "vite build" first.');
  }

  const recentPosts = await loadRecentBlogPosts();

  // 1. Generate dist/index.html with full static markup
  console.log('Rendering static index page...');
  await writeFile(INDEX_PATH, renderIndexPageHtml(baseHtml, recentPosts));

  // 2. Generate dist/404.html
  console.log('Rendering static 404 page...');
  await writeFile(join(DIST_ROOT, '404.html'), render404PageHtml(baseHtml));

  // 3. Generate 12 app pages
  console.log(`Rendering ${officialApps.length} static app pages...`);
  await Promise.all(
    officialApps.map(async (app) => {
      const routeDir = join(DIST_ROOT, app.href.slice(1));
      await mkdir(routeDir, { recursive: true });
      await writeFile(
        join(routeDir, 'index.html'),
        renderPluginPageHtml(baseHtml, app, recentPosts),
      );

      for (const asset of app.assetAliases) {
        const source = join(
          DIST_ROOT,
          decodeURIComponent(pluginAssetUrl(app.alias, asset.source).slice(1)),
        );
        const target = join(DIST_ROOT, asset.publicPath.slice(1));
        await mkdir(dirname(target), { recursive: true });
        if (existsSync(source)) {
          await copyFile(source, target);
        }
      }

      console.log(`Generated ${app.href}/index.html`);
    }),
  );

  // 4. Ensure docs, blog, sitemap, and robots are present in dist/
  const publicDocs = join(LANDING_ROOT, 'public/docs');
  const distDocs = join(DIST_ROOT, 'docs');
  if (existsSync(publicDocs)) {
    await cp(publicDocs, distDocs, { recursive: true });
  }

  const publicBlog = join(LANDING_ROOT, 'public/blog');
  const distBlog = join(DIST_ROOT, 'blog');
  if (existsSync(publicBlog)) {
    await cp(publicBlog, distBlog, { recursive: true });
  }

  const publicSitemap = join(LANDING_ROOT, 'public/sitemap.xml');
  const distSitemap = join(DIST_ROOT, 'sitemap.xml');
  if (existsSync(publicSitemap)) {
    await copyFile(publicSitemap, distSitemap);
  }

  const publicRobots = join(LANDING_ROOT, 'public/robots.txt');
  const distRobots = join(DIST_ROOT, 'robots.txt');
  if (existsSync(publicRobots)) {
    await copyFile(publicRobots, distRobots);
  }

  console.log('Static site generation complete!');
}

if (import.meta.main) {
  generateSite().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
