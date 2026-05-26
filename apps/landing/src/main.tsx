import { For, createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';

import {
  PluginRoute,
  isPluginRoute,
  pluginNavItemsForPath,
} from './plugin-pages';
import { officialApps, socialLinks } from './landing-data';
import { OfficialAppGrid } from './official-app-grid';

import './styles.css';

const logoUrl = '/appweaver-logo-accent.svg';

type NavItem = {
  sectionId: string | null;
  label: string;
  href: string;
};

type OnePageSectionId = 'intro' | 'features' | 'demo' | 'apps';

type HeaderProps = {
  activeSection: string | null;
  navItems: NavItem[];
  introActive: boolean;
  onNavSelect: (sectionId: string) => void;
};

type HomePageProps = {
  featuresHref: string;
  demoHref: string;
};

type BouncingSectionLinkProps = {
  href: string;
  label: string;
};

type CopyableCommandBlockProps = {
  className: string;
  ariaLabel: string;
  lines: string[];
};

type Feature = {
  title: string;
  points: JSX.Element[];
};

const onePageNavItems: NavItem[] = [
  { sectionId: 'intro', label: 'Intro', href: '#intro' },
  { sectionId: 'features', label: 'Features', href: '#features' },
  { sectionId: 'demo', label: 'Demo', href: '#demo' },
  { sectionId: 'apps', label: 'Apps', href: '#apps' },
];

const features: Feature[] = [
  {
    title: 'Local-First App Hub',
    points: [
      'Install AppWeaver to and run for any project or workspace folder you control.',
      'Use apps that can work with your local filesystem and databases, create files, inspect project state, and show visual git diffs.',
      'You can setup a local AI model, Text to Speach (TTS) engine, and push notifications. Be private as you want to be.',
    ],
  },
  {
    title: 'Installable Apps And Plugin Manager',
    points: [
      'Browse apps in the plugin manager, then download and use the ones that belong in your hub.',
      <>
        Install focused apps like <a href="/todo-app">todos</a>,{' '}
        <a href="/bookmark-manager">bookmarks</a>,{' '}
        <a href="/job-scheduler">jobs</a>, <a href="/file-manager">files</a>,
        browser actions, <a href="/captains-log">journals</a>, and publishing.
      </>,
      'Anyone can publish an app into the ecosystem.',
      'Apps expose commands, widgets, AI skills, and promptable tools.',
    ],
  },
  {
    title: 'Many Interfaces, One Command System',
    points: [
      'Use AppWeaver through the web UI, web prompt, CLI, or your favourite Nostr chat app that supports private DM chat.',
      'Run the same command-based system across many interfaces.',
      'Use apps through special AI prompts, or through regular chat prompts via generated app skills.',
    ],
  },
  {
    title: 'Your AI Backend, Your Models',
    points: [
      'Choose any model your backend supports, including OpenCode and Cursor backends.',
      'Use Routstr-supported pay-as-you-go models when you want hosted model access.',
      'Pay with a local Cashu bitcoin balance where supported.',
    ],
  },
  {
    title: 'Nostr-Native Assistant',
    points: [
      'AppWeaver runs with a Nostr bot identity that can send and receive private DMs through the Nostr network.',
      'Use your normal Nostr chat app as an interface to your local AppWeaver instance.',
      'Give different projects different AppWeaver instances and independent Nostr identities.',
    ],
  },
  {
    title: 'Responsive Web App',
    points: [
      'Works on wide desktop screens and mobile screens.',
      'Desktop gets docked widgets and a workspace-style layout.',
      'Mobile keeps the same apps, commands, and prompts usable in a smaller interface.',
      'Push notifications keep you updated when an app or assistant needs your attention.',
    ],
  },
  {
    title: 'Assistant Cards That Can Speak',
    points: [
      'AI assistant cards support Piper TTS.',
      'Long responses and important updates can be read aloud locally.',
      'Reading is attached to the cards you already use, not a separate assistant surface.',
    ],
  },
  {
    title: 'Open Source And Community Signal',
    points: [
      'AppWeaver is open-source software with an open and transparent roadmap.',
      'Roadmap issues and feature requests can be discussed in public.',
      'Vote on issues with sats to create signal about which fixes and features matter most.',
    ],
  },
];

function DownBlocksIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      aria-hidden="true"
    >
      <path d="M277.333,320h-42.667C211.136,320,192,339.136,192,362.667v42.667c0,23.53,19.136,42.666,42.667,42.666h42.667c23.53,0,42.666-19.136,42.666-42.667v-42.667C320,339.136,300.864,320,277.333,320z" />
      <path d="M384,192h-42.667c-23.531,0-42.667,19.136-42.667,42.667v42.667c0,23.531,19.136,42.667,42.667,42.667H384c23.531,0,42.667-19.136,42.667-42.667v-42.667C426.667,211.136,407.531,192,384,192z" />
      <path d="M469.333,64h-42.667C403.136,64,384,83.136,384,106.667v42.667c0,23.53,19.136,42.666,42.667,42.666h42.667c23.53,0,42.666-19.136,42.666-42.667v-42.667C512,83.136,492.864,64,469.333,64z" />
      <path d="M85.333,64H42.667C19.136,64,0,83.136,0,106.667v42.667C0,172.864,19.136,192,42.667,192h42.667c23.53,0,42.666-19.136,42.666-42.667v-42.667C128,83.136,108.864,64,85.333,64z" />
      <path d="M170.666,191.999H128c-23.531,0-42.667,19.136-42.667,42.667v42.667C85.333,300.864,104.469,320,128,320h42.667c23.53,0,42.666-19.136,42.666-42.667v-42.667C213.333,211.135,194.197,191.999,170.666,191.999z" />
    </svg>
  );
}

function BouncingSectionLink(props: BouncingSectionLinkProps) {
  return (
    <a href={props.href} class="bouncing-section-link">
      <DownBlocksIcon />
      <span>{props.label}</span>
    </a>
  );
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CopyableCommandBlock(props: CopyableCommandBlockProps) {
  const [copied, setCopied] = createSignal(false);
  let resetTimer: number | null = null;

  onCleanup(() => {
    if (resetTimer !== null) {
      window.clearTimeout(resetTimer);
    }
  });

  const copyCommands = () => {
    void navigator.clipboard.writeText(props.lines.join('\n')).then(() => {
      setCopied(true);

      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
      }

      resetTimer = window.setTimeout(() => setCopied(false), 2200);
    });
  };

  return (
    <div class={`${props.className} command-copy-block`} aria-label={props.ariaLabel}>
      <button
        type="button"
        class="command-copy-button"
        classList={{ 'is-copied': copied() }}
        aria-label={copied() ? 'Copied install command' : 'Copy install command'}
        title={copied() ? 'Copied' : 'Copy'}
        onClick={copyCommands}
      >
        {copied() ? <CheckIcon /> : <CopyIcon />}
      </button>
      <div class="command-copy-lines">
        <For each={props.lines}>{(line) => <code>{line}</code>}</For>
      </div>
    </div>
  );
}

function Header(props: HeaderProps) {
  return (
    <header class="stage-header">
      <a
        href="/"
        class="stage-brand"
        classList={{ 'stage-brand--intro-active': props.introActive }}
        aria-hidden={props.introActive ? 'true' : undefined}
        tabIndex={props.introActive ? -1 : undefined}
      >
        <img src={logoUrl} alt="AppWeaver" class="stage-brand-logo" />
        <span class="stage-brand-text" aria-hidden="true">
          AppWeaver
        </span>
      </a>
      <nav class="stage-nav-simple" aria-label="Landing pages">
        <For each={props.navItems}>
          {(item) => (
            <a
              href={item.href}
              class="stage-nav-simple-item"
              classList={{ 'is-active': props.activeSection === item.sectionId }}
              aria-current={
                props.activeSection === item.sectionId ? 'location' : undefined
              }
              onClick={() => {
                if (item.sectionId) {
                  props.onNavSelect(item.sectionId);
                }
              }}
            >
              {item.label}
            </a>
          )}
        </For>
      </nav>
    </header>
  );
}

function HomePage(props: HomePageProps) {
  return (
    <section class="hero-stage">
      <div class="hero-copy">
        <div class="hero-brand" aria-hidden="true">
          <div class="hero-brand-text">AppWeaver</div>
          <img src={logoUrl} alt="" class="hero-brand-logo" />
        </div>
        <h1 class="hero-title">
          An <span class="hero-title-ai">AI</span>-powered <span class="hero-title-app-hub">App Hub</span> on a computer{' '}
          <span class="hero-title-mark hero-title-mark--computer">you control</span>.
        </h1>
        <p class="hero-description">
          Your data stays <span class="hero-description-mark">local-first</span>.
          You choose which{' '}
          <a href="#apps" class="hero-description-link hero-apps-link">
            <span class="hero-apps-icon" aria-hidden="true">
              <span class="hero-apps-icon-frame hero-apps-icon-frame--todo" />
              <span class="hero-apps-icon-frame hero-apps-icon-frame--bm" />
              <span class="hero-apps-icon-frame hero-apps-icon-frame--jobs" />
              <span class="hero-apps-icon-frame hero-apps-icon-frame--file" />
              <span class="hero-apps-icon-frame hero-apps-icon-frame--journal" />
            </span>
            <span class="hero-apps-text">apps</span>
          </a>{' '}
          belong in your hub.
        </p>
        <p class="hero-description">
          Use them through{' '}
          <a href={props.demoHref} class="hero-description-link">
            responsive app
          </a>
          , prompts, local terminal input, WebSocket API, or your favourite Nostr
          chat app.
        </p>
        <div class="hero-install-block">
          <div class="hero-install-label">
            Go to your project/workspace folder and run:
          </div>
          <CopyableCommandBlock
            className="hero-install-command"
            ariaLabel="Install command"
            lines={[
              'git clone https://github.com/getappweaver/core.git appweaver',
              'cd appweaver && bun install && bun run start',
            ]}
          />
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
      </div>
      <div class="hero-next">
        <BouncingSectionLink href={props.featuresHref} label="Features" />
      </div>
    </section>
  );
}

function FeatureAccordion(props: {
  openFeatureIndex: number;
  setOpenFeatureIndex: (index: number) => void;
}) {
  return (
    <div class="features-accordion" aria-label="AppWeaver feature groups">
      <For each={features}>
        {(feature, index) => (
          <div
            class="feature-panel"
            classList={{ 'feature-panel--open': props.openFeatureIndex === index() }}
          >
            <button
              type="button"
              class="feature-panel-summary"
              aria-expanded={props.openFeatureIndex === index()}
              onClick={() => props.setOpenFeatureIndex(index())}
            >
              <span class="feature-panel-mark" aria-hidden="true" />
              <span class="feature-panel-title">{feature.title}</span>
            </button>
            <div class="feature-panel-body">
              <ul class="feature-panel-list">
                <For each={feature.points}>
                  {(point) => <li class="feature-panel-point">{point}</li>}
                </For>
              </ul>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function OfficialAppsSection() {
  return (
    <div class="official-apps">
      <h2 class="section-title short-viewport-section-title">Official Apps</h2>
      <div class="section-heading-row">
        <p class="section-summary">
          Each app adds commands, widgets, AI skills, and local data models to your AppWeaver workspace.
        </p>
      </div>

      <OfficialAppGrid apps={officialApps} />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer class="site-footer">
      <div class="site-footer-brand">AppWeaver</div>
      <nav class="site-footer-links" aria-label="AppWeaver social links">
        <For each={socialLinks}>
          {(link) => (
            <a href={link.href} rel="noreferrer" target="_blank">
              {link.label}
            </a>
          )}
        </For>
      </nav>
    </footer>
  );
}

function OnePage(props: {
  onActiveSectionChange: (sectionId: OnePageSectionId) => void;
  onHeroTitleReachedChange: (reached: boolean) => void;
}) {
  const [openFeatureIndex, setOpenFeatureIndex] = createSignal(0);

  onMount(() => {
    const root = document.querySelector('.one-page-stage');

    if (!(root instanceof HTMLElement)) {
      return;
    }

    const sectionIds: OnePageSectionId[] = [
      'intro',
      'features',
      'demo',
      'apps',
    ];
    let frameId: number | null = null;

    const updateActiveSection = () => {
      frameId = null;
      const rootRect = root.getBoundingClientRect();
      const activationY = rootRect.top + rootRect.height * 0.3;
      const heroTitle = root.querySelector('.hero-title');
      let activeSection: OnePageSectionId = 'intro';

      for (const sectionId of sectionIds) {
        const section = document.getElementById(sectionId);

        if (!section) {
          continue;
        }

        if (section.getBoundingClientRect().top <= activationY) {
          activeSection = sectionId;
        }
      }

      props.onActiveSectionChange(activeSection);

      props.onHeroTitleReachedChange(
        heroTitle instanceof HTMLElement &&
          heroTitle.getBoundingClientRect().top <= rootRect.top + 8,
      );
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(updateActiveSection);
    };

    root.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('hashchange', scheduleUpdate);
    updateActiveSection();

    onCleanup(() => {
      root.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('hashchange', scheduleUpdate);

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    });
  });

  return (
    <div class="one-page-stage">
      <section id="intro" class="one-page-section one-page-section--intro">
        <HomePage demoHref="#demo" featuresHref="#features" />
      </section>
      <section id="features" class="one-page-section one-page-section--features">
        <h2 class="section-title short-viewport-section-title">Features</h2>
        <FeatureAccordion
          openFeatureIndex={openFeatureIndex()}
          setOpenFeatureIndex={setOpenFeatureIndex}
        />
        <div class="features-next">
          <BouncingSectionLink href="#demo" label="Interactive Demo" />
        </div>
      </section>
      <section id="demo" class="one-page-section one-page-section--demo">
        <h2 class="section-title short-viewport-section-title">Interactive Demo</h2>
        <iframe
          title="AppWeaver interactive demo"
          src="/demo/app/index.html"
          class="one-page-demo-frame"
        />
        <div class="demo-next">
          <BouncingSectionLink href="#apps" label="Apps" />
        </div>
      </section>
      <section id="apps" class="one-page-section one-page-section--apps">
        <OfficialAppsSection />
        <SiteFooter />
      </section>
    </div>
  );
}

function App() {
  const pluginRoute = isPluginRoute(window.location.pathname);
  const [onePageActiveSection, setOnePageActiveSection] =
    createSignal<OnePageSectionId>('intro');
  const [heroTitleReached, setHeroTitleReached] = createSignal(false);
  const [pluginPageActiveSection, setPluginPageActiveSection] =
    createSignal<string>('features');

  return (
    <div class="stage-page">
      <div class="stage-background" />
      <div class="stage-shell">
        <Header
          activeSection={
            pluginRoute ? pluginPageActiveSection() : onePageActiveSection()
          }
          introActive={
            !pluginRoute &&
            onePageActiveSection() === 'intro' &&
            !heroTitleReached()
          }
          navItems={
            pluginRoute
              ? pluginNavItemsForPath(window.location.pathname)
              : onePageNavItems
          }
          onNavSelect={(sectionId) => {
            if (pluginRoute) {
              setPluginPageActiveSection(sectionId);
              return;
            }

            setOnePageActiveSection(sectionId as OnePageSectionId);
          }}
        />

        <main class="page-sections">
          {pluginRoute ? (
            <PluginRoute
              pathname={window.location.pathname}
              onActiveSectionChange={setPluginPageActiveSection}
            />
          ) : (
            <OnePage
              onActiveSectionChange={setOnePageActiveSection}
              onHeroTitleReachedChange={setHeroTitleReached}
            />
          )}
        </main>
      </div>
    </div>
  );
}

render(() => <App />, document.getElementById('root')!);
