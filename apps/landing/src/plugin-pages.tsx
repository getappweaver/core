import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';

import { AppWeaverInstallBlock } from './appweaver-install-block';
import { scheduleStageHashScroll, scrollStageToHash } from './hash-scroll';
import { officialApps, officialAuthor, socialLinks } from './landing-data';
import { OfficialAppGrid, pluginIconSrcForSlug } from './official-app-grid';
import { RoadmapPanel } from './roadmap-panel';

type PluginPageSectionId = 'features' | 'demo' | 'roadmap' | 'install' | 'apps';

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
  demoStories: PluginDemoStory[];
  features: string[];
};

type PluginDemoViewMode = 'desktop' | 'mobile';

type PluginDemoGifVariant = {
  view: PluginDemoViewMode;
  src: string;
  alt: string;
  durationMs: number;
};

type PluginDemoStory = {
  id: string;
  label: string;
  variants: PluginDemoGifVariant[];
};

type PluginDemoGif = PluginDemoGifVariant & {
  storyId: string;
  label: string;
};

type PluginDemoStoryChoice = {
  storyId: string;
  label: string;
  gif: PluginDemoGif | null;
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

const pluginRoadmapBoardKeys: Record<string, string> = {
  bm: 'appweaver-plugin-bookmarks-roadmap',
  file: 'appweaver-plugin-file-roadmap',
  job: 'appweaver-plugin-job-roadmap',
  journal: 'appweaver-plugin-journal-roadmap',
  todo: 'appweaver-plugin-todo-roadmap',
};

const pluginRoadmapRepos: Record<string, string> = {
  bm: 'nostr://_@getappweaver.com/relay.ngit.dev/bm',
  file: 'nostr://_@getappweaver.com/relay.ngit.dev/file',
  job: 'nostr://_@getappweaver.com/relay.ngit.dev/job',
  journal: 'nostr://_@getappweaver.com/relay.ngit.dev/journal',
  todo: 'nostr://_@getappweaver.com/relay.ngit.dev/todo',
};

const pluginDemoStories: Record<string, PluginDemoStory[]> = {
  bm: [
    {
      id: 'bookmark-add-new-ai',
      label: 'AI-assisted bookmark capture',
      variants: [
        {
          view: 'desktop',
          src: '/gifs/bookmark-add-new-ai.gif',
          alt: 'Bookmark Manager creating a new bookmark with AI help',
          durationMs: 29260,
        },
        {
          view: 'mobile',
          src: '/gifs/bookmark-add-new-ai-mobile.gif',
          alt: 'Bookmark Manager creating a new bookmark with AI help',
          durationMs: 42760,
        },
      ],
    },
  ],
  file: [
    {
      id: 'file-edit-diff',
      label: 'Edit a file and inspect the diff',
      variants: [
        {
          view: 'desktop',
          src: '/gifs/file-edit-diff.gif',
          alt: 'File Manager opening a markdown file, editing it, and reviewing the diff',
          durationMs: 29760,
        },
        {
          view: 'mobile',
          src: '/gifs/file-edit-diff-mobile.gif',
          alt: 'File Manager mobile view editing a file and opening the diff',
          durationMs: 37260,
        },
      ],
    },
    {
      id: 'file-diff-commit',
      label: 'Review all your file changes and commit',
      variants: [
        {
          view: 'desktop',
          src: '/gifs/file-diff-commit.gif',
          alt: 'Review your changes in one place, and commit',
          durationMs: 33260,
        },
        {
          view: 'mobile',
          src: '/gifs/file-diff-commit-mobile.gif',
          alt: 'Review your changes in mobile view in one place, and commit',
          durationMs: 50630,
        },
      ],
    },
    {
      id: 'file-commit-history',
      label: 'Check your file commit history',
      variants: [
        {
          view: 'desktop',
          src: '/gifs/file-commit-history.gif',
          alt: 'See all your commit history in a folder',
          durationMs: 30380,
        },
        {
          view: 'mobile',
          src: '/gifs/file-commit-history-mobile.gif',
          alt: 'See all your commit history in a folder on mobile',
          durationMs: 39760,
        },
      ],
    },
  ],
  job: [
    {
      label: 'Schedule a job with AI',
      id: 'job-ai-create',
      variants: [
        {
          view: 'desktop',
          src: '/gifs/job-ai.gif',
          alt: 'Job Scheduler creating a scheduled job with AI',
          durationMs: 22380,
        },
        {
          view: 'mobile',
          src: '/gifs/job-ai-mobile.gif',
          alt: 'Job Scheduler mobile flow creating a scheduled job with AI',
          durationMs: 32260,
        },
      ],
    },
  ],
  todo: [
    {
      id: 'todo-add',
      label: 'Add todos',
      variants: [
        {
          view: 'desktop',
          src: '/gifs/todo-add.gif',
          alt: 'Todo app desktop view adding a todo from the widget',
          durationMs: 44380,
        },
        {
          view: 'mobile',
          src: '/gifs/todo-add-mobile.gif',
          alt: 'Todo app mobile view adding a todo from the widget',
          durationMs: 58380,
        },
      ],
    },
    {
      id: 'todo-add-by-ai',
      label: 'Create todos with AI',
      variants: [
        {
          view: 'desktop',
          src: '/gifs/todo-add-by-ai.gif',
          alt: 'Todo app creating tasks from an AI prompt',
          durationMs: 18760,
        },
        {
          view: 'mobile',
          src: '/gifs/todo-add-by-ai-mobile.gif',
          alt: 'Todo app mobile view creating tasks from an AI prompt',
          durationMs: 36760,
        },
      ],
    },
    {
      id: 'todo-duel',
      label: 'Prioritize with duels',
      variants: [
        {
          view: 'desktop',
          src: '/gifs/todo-duel.gif',
          alt: 'Todo app desktop view choosing between todos in a duel',
          durationMs: 37880,
        },
        {
          view: 'mobile',
          src: '/gifs/todo-duel-mobile.gif',
          alt: 'Todo app mobile view choosing between todos in a duel',
          durationMs: 50260,
        },
      ],
    },
  ],
};

function demoGifsForView(
  stories: PluginDemoStory[],
  viewMode: PluginDemoViewMode,
): PluginDemoGif[] {
  return stories.flatMap((story) => {
    const variant = story.variants.find((entry) => entry.view === viewMode);

    if (!variant) {
      return [];
    }

    return [
      {
        ...variant,
        storyId: story.id,
        label: story.label,
      },
    ];
  });
}

function demoChoicesForView(
  stories: PluginDemoStory[],
  viewMode: PluginDemoViewMode,
): PluginDemoStoryChoice[] {
  return stories.map((story) => {
    const variant = story.variants.find((entry) => entry.view === viewMode);

    return {
      storyId: story.id,
      label: story.label,
      gif: variant
        ? {
            ...variant,
            storyId: story.id,
            label: story.label,
          }
        : null,
    };
  });
}

function hasDemoGifsForView(
  stories: PluginDemoStory[],
  viewMode: PluginDemoViewMode,
): boolean {
  return stories.some((story) =>
    story.variants.some((variant) => variant.view === viewMode),
  );
}

const pluginPageSections: PluginPageSectionId[] = [
  'features',
  'demo',
  'roadmap',
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
    { sectionId: 'roadmap', label: 'Roadmap', href: '#roadmap' },
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
    demoStories: pluginDemoStories[command.name] ?? [],
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
  onOpenFullscreen: () => void;
}) {
  const [imageReady, setImageReady] = createSignal(false);

  return (
    <figure class="plugin-install-screenshot-card">
      <figcaption>{props.label}</figcaption>
      <button
        type="button"
        class="plugin-install-screenshot-button"
        onClick={props.onOpenFullscreen}
        aria-label={`Open ${props.label} fullscreen`}
      >
        <img
          class="plugin-install-screenshot"
          src={props.src}
          alt={props.alt}
          classList={{ 'is-ready': imageReady() }}
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(false)}
        />
      </button>
      <Show when={!imageReady()}>
        <div class="plugin-install-screenshot-placeholder">
          <strong>Plugin Manager screenshot slot</strong>
          <span>{props.src}</span>
        </div>
      </Show>
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
  const [fullscreenScreenshot, setFullscreenScreenshot] = createSignal<{
    src: string;
    alt: string;
    label: string;
  } | null>(null);

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
          onOpenFullscreen={() =>
            setFullscreenScreenshot({
              src: '/plugin-install/open-plugin-manager.png',
              alt: 'AppWeaver command bar opening the Plugin Manager',
              label: 'Open Plugin Manager',
            })
          }
        />
        <ScreenshotCard
          src={screenshotSrc()}
          alt={`AppWeaver Plugin Manager showing ${props.page.eyebrow}`}
          label={`Install ${props.page.shortName}`}
          onOpenFullscreen={() =>
            setFullscreenScreenshot({
              src: screenshotSrc(),
              alt: `AppWeaver Plugin Manager showing ${props.page.eyebrow}`,
              label: `Install ${props.page.shortName}`,
            })
          }
        />
      </div>
      <Show when={fullscreenScreenshot()}>
        {(screenshot) => (
          <div class="plugin-demo-lightbox" role="dialog" aria-modal="true">
            <button
              type="button"
              class="plugin-demo-lightbox-backdrop"
              aria-label="Close fullscreen screenshot"
              onClick={() => setFullscreenScreenshot(null)}
            />
            <figure class="plugin-demo-lightbox-card plugin-demo-lightbox-card--screenshot">
              <div class="plugin-demo-lightbox-head">
                <div>{screenshot().label}</div>
                <button
                  type="button"
                  class="plugin-demo-lightbox-close"
                  onClick={() => setFullscreenScreenshot(null)}
                  aria-label="Close fullscreen screenshot"
                >
                  x
                </button>
              </div>
              <img
                class="plugin-demo-lightbox-gif plugin-demo-lightbox-gif--screenshot"
                src={screenshot().src}
                alt={screenshot().alt}
              />
            </figure>
          </div>
        )}
      </Show>
      <AppWeaverInstallBlock title="Install AppWeaver if you haven't already to use this app" />
    </div>
  );
}

function PluginDemoSection(props: { page: PluginPage }) {
  const initialViewMode = hasDemoGifsForView(props.page.demoStories, 'desktop')
    ? 'desktop'
    : 'mobile';
  const [viewMode, setViewMode] =
    createSignal<PluginDemoViewMode>(initialViewMode);
  const [demoViewMode, setDemoViewMode] =
    createSignal<PluginDemoViewMode>('desktop');
  const [activeGifIndex, setActiveGifIndex] = createSignal(0);
  const [fullscreenGif, setFullscreenGif] = createSignal<PluginDemoGif | null>(
    null,
  );
  const selectedGifs = createMemo(() =>
    demoGifsForView(props.page.demoStories, viewMode()),
  );
  const demoChoices = createMemo(() =>
    demoChoicesForView(props.page.demoStories, viewMode()),
  );
  const activeGif = () => selectedGifs()[activeGifIndex()] ?? null;
  const hasDesktopGifs = () => hasDemoGifsForView(props.page.demoStories, 'desktop');
  const hasMobileGifs = () => hasDemoGifsForView(props.page.demoStories, 'mobile');

  createEffect(() => {
    const gifs = selectedGifs();

    if (gifs.length > 0) {
      return;
    }

    if (viewMode() === 'desktop' && hasMobileGifs()) {
      setViewMode('mobile');
    } else if (viewMode() === 'mobile' && hasDesktopGifs()) {
      setViewMode('desktop');
    }
  });

  createEffect(() => {
    const count = selectedGifs().length;

    if (activeGifIndex() >= count) {
      setActiveGifIndex(0);
    }
  });

  createEffect(() => {
    const gifs = selectedGifs();
    const count = gifs.length;

    if (count < 2 || fullscreenGif() !== null) {
      return;
    }

    const currentIndex = activeGifIndex();
    const timeoutId = window.setTimeout(() => {
      setActiveGifIndex((currentIndex + 1) % count);
    }, gifs[currentIndex]?.durationMs ?? 20000);

    onCleanup(() => window.clearTimeout(timeoutId));
  });

  return (
    <div class="plugin-demo-section">
      <Show when={props.page.demoStories.length > 0}>
        <div class="plugin-demo-carousel" aria-label={`${props.page.eyebrow} GIF demos`}>
          <h2 class="plugin-panel-title">Watch how {props.page.shortName} works</h2>
          <div class="plugin-demo-view-toggle" aria-label="Choose GIF viewport">
            <button
              type="button"
              class="plugin-demo-view-button"
              classList={{ 'plugin-demo-view-button--active': viewMode() === 'desktop' }}
              disabled={!hasDesktopGifs()}
              onClick={() => {
                setViewMode('desktop');
                setActiveGifIndex(0);
              }}
            >
              Desktop
            </button>
            <button
              type="button"
              class="plugin-demo-view-button"
              classList={{ 'plugin-demo-view-button--active': viewMode() === 'mobile' }}
              disabled={!hasMobileGifs()}
              onClick={() => {
                setViewMode('mobile');
                setActiveGifIndex(0);
              }}
            >
              Mobile
            </button>
          </div>
          <div class="plugin-demo-thumb-row" aria-label="Choose GIF demo">
            <For each={demoChoices()}>
              {(choice) => {
                const selectedIndex = () =>
                  choice.gif === null
                    ? -1
                    : selectedGifs().findIndex(
                        (gif) => gif.storyId === choice.storyId,
                      );

                return (
                  <button
                    type="button"
                    class="plugin-demo-thumb"
                    classList={{
                      'plugin-demo-thumb--active': selectedIndex() === activeGifIndex(),
                    }}
                    disabled={choice.gif === null}
                    onClick={() => {
                      const index = selectedIndex();

                      if (index >= 0) {
                        setActiveGifIndex(index);
                      }
                    }}
                  >
                    {choice.label}
                  </button>
                );
              }}
            </For>
          </div>
          <Show when={activeGif()}>
            {(gif) => (
              <figure class="plugin-demo-gif-card plugin-demo-gif-card--active">
                <button
                  type="button"
                  class="plugin-demo-gif-button"
                  onClick={() => setFullscreenGif(gif())}
                  aria-label={`Open ${gif().label} fullscreen`}
                >
                  <img class="plugin-demo-gif" src={gif().src} alt={gif().alt} />
                </button>
              </figure>
            )}
          </Show>
        </div>
      </Show>
      <Show when={fullscreenGif()}>
        {(gif) => (
          <div class="plugin-demo-lightbox" role="dialog" aria-modal="true">
            <button
              type="button"
              class="plugin-demo-lightbox-backdrop"
              aria-label="Close fullscreen GIF"
              onClick={() => setFullscreenGif(null)}
            />
            <figure class="plugin-demo-lightbox-card">
              <div class="plugin-demo-lightbox-head">
                <div>{gif().label}</div>
                <button
                  type="button"
                  class="plugin-demo-lightbox-close"
                  onClick={() => setFullscreenGif(null)}
                  aria-label="Close fullscreen GIF"
                >
                  x
                </button>
              </div>
              <img class="plugin-demo-lightbox-gif" src={gif().src} alt={gif().alt} />
            </figure>
          </div>
        )}
      </Show>
      <div class="plugin-interactive-demo-panel">
        <h2 class="plugin-panel-title">
          See {props.page.shortName} stories for yourself
        </h2>
        <div class="plugin-demo-view-toggle plugin-demo-view-toggle--interactive" aria-label="Choose interactive demo viewport">
          <button
            type="button"
            class="plugin-demo-view-button"
            classList={{ 'plugin-demo-view-button--active': demoViewMode() === 'desktop' }}
            onClick={() => setDemoViewMode('desktop')}
          >
            Desktop
          </button>
          <button
            type="button"
            class="plugin-demo-view-button"
            classList={{ 'plugin-demo-view-button--active': demoViewMode() === 'mobile' }}
            onClick={() => setDemoViewMode('mobile')}
          >
            Mobile
          </button>
        </div>
        <iframe
          title={`See ${props.page.shortName} stories for yourself`}
          src={demoAppSrc(props.page.demoQuery)}
          class="plugin-page-demo-frame"
          classList={{ 'plugin-page-demo-frame--mobile': demoViewMode() === 'mobile' }}
          loading="lazy"
          tabIndex={-1}
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

    const handleHashChange = () => {
      if (scrollStageToHash(root!)) {
        scheduleUpdate();
        return;
      }

      scheduleUpdate();
    };

    const cancelInitialHashScroll = scheduleStageHashScroll(root, scheduleUpdate);

    root.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('hashchange', handleHashChange);
    updateActiveSection();

    onCleanup(() => {
      root?.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('hashchange', handleHashChange);
      cancelInitialHashScroll();

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
        <PluginDemoSection page={props.page} />
      </section>
      <section id="roadmap" class="plugin-page-section plugin-page-section--roadmap">
        <RoadmapPanel
          title={`${props.page.shortName} Roadmap`}
          boardKey={pluginRoadmapBoardKeys[props.page.command] ?? `${props.page.command}-roadmap`}
          repo={pluginRoadmapRepos[props.page.command]}
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
