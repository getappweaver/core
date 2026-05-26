import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';

import { officialApps, officialAuthor, socialLinks } from './landing-data';
import { OfficialAppGrid, pluginIconSrcForSlug } from './official-app-grid';

type PluginPageSectionId = 'features' | 'demo' | 'install' | 'apps';

type PluginPage = {
  routeSlug: string;
  command: string;
  subcommand: string;
  label: string;
  shortName: string;
  iconSrc: string | null;
  title: string;
  eyebrow: string;
  description: string;
  demoQuery: string;
  features: string[];
};

type PluginRouteProps = {
  pathname: string;
  onActiveSectionChange: (sectionId: PluginPageSectionId) => void;
};

type PluginNavItem = {
  sectionId: PluginPageSectionId | null;
  label: string;
  href: string;
};

type DemoCommand = {
  name: string;
  summary: string;
  aliases?: string[];
  pluginAlias?: string;
  subcommands: DemoSubcommand[];
};

type DemoSubcommand = {
  name: string;
  aliases?: string[];
  webWidget?: {
    placement: 'header' | 'fixed';
    label?: string;
    modalTitle: string;
  };
};

const pluginRouteAliases: Record<string, string> = {
  'bookmark-manager': 'bm',
  'captains-log': 'journal',
  'file-manager': 'file',
  'job-scheduler': 'job',
  'todo-app': 'todo',
};

const pluginFeatures: Record<string, string[]> = {
  bm: [
    'Your local bookmarks, accessible from anywhere you use AppWeaver.',
    'Ask AI to inspect a link or search for something, then draft a bookmark with a useful description, tags, and category.',
    'Publish selected bookmark sets only when you deliberately choose to share.',
  ],
  file: [
    'Browse workspace trees without leaving the AppWeaver UI.',
    'Ask for folder summaries and bottom-up context before editing code.',
    'Review git diffs in the UI so you can check what changed before moving on.',
  ],
  job: [
    'Schedule one-off or recurring prompts from the same app hub.',
    'Use natural language like “Run X each Monday at 8am” and AppWeaver creates the job in your timezone.',
    'Automate checks, reminders, publishing, and maintenance without leaving your workspace.',
  ],
  journal: [
    'Capture private workspace notes as a local Captain\'s Log.',
    'Stroll through entries like a real notepad instead of treating every note as a search result.',
    'Publish selected logs only after reviewing the exact draft.',
  ],
  todo: [
    'Create structured tasks from chat, web UI actions, or AI prompts.',
    'Focus on one part of the todo tree when you want to work in detail.',
    'Copy part of the tree structurally and paste it into any model you want to work with.',
    'AI agents cannot edit your todos directly; they create drafts that you can accept, revise, or decline.',
    'Your local todo app, accessible from anywhere you use AppWeaver.',
  ],
};

const pluginPageSections: PluginPageSectionId[] = [
  'features',
  'demo',
  'install',
  'apps',
];

function routeSlugForPath(pathname: string): string {
  return pathname.replace(/^\/+|\/+$/g, '');
}

function officialAppForSlug(slug: string) {
  const commandToken = pluginRouteAliases[slug] ?? slug;

  return officialApps.find(
    (app) => app.href === `/${slug}` || app.label.slice(1) === commandToken,
  );
}

export function pluginNavItemsForPath(_pathname: string): PluginNavItem[] {
  void _pathname;

  return [
    { sectionId: null, label: 'Back', href: '/' },
    { sectionId: 'features', label: 'Features', href: '#features' },
    {
      sectionId: 'demo',
      label: `Demo`,
      href: '#demo',
    },
    { sectionId: 'install', label: 'Install', href: '#install' },
    { sectionId: 'apps', label: 'Apps', href: '#apps' },
  ];
}

function titleCaseSlug(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function pluginPageForPath(
  pathname: string,
  commands: DemoCommand[],
): PluginPage | null {
  const slug = routeSlugForPath(pathname);

  if (!slug) {
    return null;
  }

  const commandToken = pluginRouteAliases[slug] ?? slug;
  const officialApp = officialAppForSlug(slug);
  const command = commands.find(
    (entry) =>
      entry.name === commandToken ||
      entry.pluginAlias === commandToken ||
      entry.aliases?.includes(commandToken),
  );

  const subcommand = command?.subcommands.find(
    (entry) => entry.webWidget?.placement === 'header' && entry.webWidget.label,
  );

  if (!command || !subcommand?.webWidget) {
    return null;
  }

  const displayName =
    officialApp?.displayName ?? subcommand.webWidget.modalTitle ?? titleCaseSlug(slug);
  const description = officialApp?.description ?? command.summary;

  return {
    routeSlug: slug,
    command: command.name,
    subcommand: subcommand.name,
    label: officialApp?.label ?? `/${command.name}`,
    shortName: officialApp?.shortName ?? displayName,
    iconSrc: pluginIconSrcForSlug(slug),
    title: `${displayName} for your AppWeaver workspace.`,
    eyebrow: displayName,
    description,
    demoQuery: `widget=${encodeURIComponent(command.name)}:${encodeURIComponent(subcommand.name)}`,
    features: pluginFeatures[command.name] ?? [
      description,
      'Install it from the AppWeaver plugin manager when it belongs in your workspace.',
      'Use it through commands, widgets, and AI-assisted workflows.',
    ],
  };
}

function demoAppSrc(query: string): string {
  return `/demo/app/index.html?${query}`;
}

function installScreenshotSrc(routeSlug: string): string {
  return `/plugin-install/${routeSlug}.png`;
}

function ScreenshotCard(props: {
  src: string;
  alt: string;
  label: string;
}) {
  const [imageReady, setImageReady] = createSignal(false);

  return (
    <figure class="plugin-install-screenshot-card">
      <img
        class="plugin-install-screenshot"
        src={props.src}
        alt={props.alt}
        classList={{ 'is-ready': imageReady() }}
        onLoad={() => setImageReady(true)}
        onError={() => setImageReady(false)}
      />
      <Show when={!imageReady()}>
        <div class="plugin-install-screenshot-placeholder">
          <strong>Plugin Manager screenshot slot</strong>
          <span>{props.src}</span>
        </div>
      </Show>
      <figcaption>{props.label}</figcaption>
    </figure>
  );
}

function PluginFeatures(props: { page: PluginPage }) {
  return (
    <div class="plugin-page-copy">
      <div class="plugin-page-eyebrow">{props.page.label}</div>
      <div class="plugin-page-hero-title-row">
        <Show when={props.page.iconSrc}>
          {(iconSrc) => (
            <img
              class="plugin-page-hero-icon"
              src={iconSrc()}
              alt=""
              aria-hidden="true"
            />
          )}
        </Show>
        <h1 class="plugin-page-title">{props.page.title}</h1>
      </div>
      <p class="plugin-page-description">{props.page.description}</p>
      <ul class="plugin-page-list">
        <For each={props.page.features}>{(feature) => <li>{feature}</li>}</For>
      </ul>
    </div>
  );
}

function PluginInstallPreview(props: { page: PluginPage }) {
  const screenshotSrc = () => installScreenshotSrc(props.page.routeSlug);

  return (
    <div
      class="plugin-install-preview"
      aria-label={`${props.page.eyebrow} install preview`}
    >
      <div class="plugin-install-preview-copy">
        <div class="plugin-page-eyebrow">Plugin Manager</div>
        <h2 class="plugin-section-title">Install from the official app author.</h2>
        <p class="plugin-page-description">
          AppWeaver shows catalog entries before install. The current app is
          highlighted below, and the author line stays visible so you can verify
          it comes from{' '}
          <span class="plugin-install-author-emphasis">{officialAuthor.label}</span>.
        </p>
      </div>

      <div class="plugin-install-screenshot-grid">
        <ScreenshotCard
          src="/plugin-install/open-plugin-manager.png"
          alt="AppWeaver command bar opening the Plugin Manager"
          label="Open Plugin Manager"
        />
        <ScreenshotCard
          src={screenshotSrc()}
          alt={`AppWeaver Plugin Manager showing ${props.page.eyebrow}`}
          label={`Install ${props.page.shortName}`}
        />
      </div>
    </div>
  );
}

function PluginAppsSection(props: { page: PluginPage }) {
  return (
    <div class="official-apps plugin-related-apps">
      <div class="section-heading-row">
        <div>
          <div class="section-eyebrow">Other Official Apps</div>
          <h2 class="section-title">Add more tools to the same local hub.</h2>
        </div>
        <p class="section-summary">
          {props.page.shortName} can run beside the other official AppWeaver apps.
          Each one adds focused commands, widgets, and AI skills.
        </p>
      </div>

      <OfficialAppGrid
        apps={officialApps.filter((app) => app.href !== `/${props.page.routeSlug}`)}
      />
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

function PluginLandingPage(props: {
  page: PluginPage;
  onActiveSectionChange: (sectionId: PluginPageSectionId) => void;
}) {
  let root: HTMLDivElement | undefined;

  onMount(() => {
    if (!root) {
      return;
    }

    if (!window.location.hash) {
      window.requestAnimationFrame(() => root?.scrollTo({ top: 0, left: 0 }));
    }

    let frameId: number | null = null;

    const updateActiveSection = () => {
      frameId = null;
      const rootRect = root!.getBoundingClientRect();
      const activationY = rootRect.top + rootRect.height * 0.3;
      let activeSection: PluginPageSectionId = 'features';

      for (const sectionId of pluginPageSections) {
        const section = document.getElementById(sectionId);

        if (!section) {
          continue;
        }

        if (section.getBoundingClientRect().top <= activationY) {
          activeSection = sectionId;
        }
      }

      props.onActiveSectionChange(activeSection);
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
      root?.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('hashchange', scheduleUpdate);

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    });
  });

  return (
    <div class="plugin-page-stage" ref={root}>
      <section id="features" class="plugin-page-section plugin-page-section--features">
        <PluginFeatures page={props.page} />
      </section>
      <section
        id="demo"
        class="plugin-page-section plugin-page-section--demo"
        aria-label={`${props.page.eyebrow} demo`}
      >
        <iframe
          title={`${props.page.eyebrow} AppWeaver demo`}
          src={demoAppSrc(props.page.demoQuery)}
          class="plugin-page-demo-frame"
          loading="lazy"
          tabIndex={-1}
        />
      </section>
      <section id="install" class="plugin-page-section plugin-page-section--install">
        <PluginInstallPreview page={props.page} />
      </section>
      <section id="apps" class="plugin-page-section plugin-page-section--apps">
        <PluginAppsSection page={props.page} />
        <SiteFooter />
      </section>
    </div>
  );
}

function LoadingPluginPage() {
  return (
    <div class="plugin-page-stage">
      <section class="plugin-page-copy">
        <div class="plugin-page-eyebrow">Loading Demo</div>
        <h1 class="plugin-page-title">Preparing plugin demo.</h1>
        <p class="plugin-page-description">
          Loading generated demo command metadata.
        </p>
      </section>
    </div>
  );
}

function MissingPluginPage() {
  return (
    <div class="plugin-page-stage">
      <section class="plugin-page-copy">
        <div class="plugin-page-eyebrow">Plugin Demo</div>
        <h1 class="plugin-page-title">No demo widget found.</h1>
        <p class="plugin-page-description">
          This route did not match a generated header widget in the demo command
          metadata.
        </p>
      </section>
    </div>
  );
}

export function PluginRoute(props: PluginRouteProps) {
  const [commands, setCommands] = createSignal<DemoCommand[] | null>(null);

  onMount(() => {
    void fetch('/demo/commands.json')
      .then((response) => (response.ok ? response.json() : []))
      .then((value) => {
        setCommands(Array.isArray(value) ? value : []);
      })
      .catch(() => setCommands([]));
  });

  const page = () => {
    const loaded = commands();

    return loaded ? pluginPageForPath(props.pathname, loaded) : null;
  };

  return (
    <Show when={commands() !== null} fallback={<LoadingPluginPage />}>
      <Show when={page()} fallback={<MissingPluginPage />}>
        {(resolvedPage) => (
          <PluginLandingPage
            page={resolvedPage()}
            onActiveSectionChange={props.onActiveSectionChange}
          />
        )}
      </Show>
    </Show>
  );
}

export function isPluginRoute(pathname: string): boolean {
  return pathname !== '/';
}
