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
import { BlogPostsSection } from './blog-posts';
import { scheduleStageHashScroll, scrollStageToHash } from './hash-scroll';
import { officialApps, officialAuthor, socialLinks } from './landing-data';
import { OfficialAppGrid, pluginIconSrcForSlug } from './official-app-grid';
import {
  RoadmapPanel,
  appWeaverRoadmapTarget,
} from './roadmap-panel';

type PluginPageSectionId =
  | 'features'
  | 'gallery'
  | 'demo'
  | 'install'
  | 'apps'
  | 'more';

type PluginPage = {
  routeSlug: string;
  installScreenshotSlug: string;
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
  featureGallery: PluginFeatureGallery | null;
};

type PluginFeatureGalleryItem = {
  id: string;
  title: string;
  description: string[];
  mediaSrc: string;
  mediaAlt: string;
  mediaLabel: string;
};

type PluginFeatureGallery = {
  title: string;
  description: string;
  items: PluginFeatureGalleryItem[];
};

type PluginPagePresentation = {
  title: string;
  description: string;
  featureGallery: PluginFeatureGallery;
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
    placement: 'header' | 'fixed' | 'right';
    label?: string;
    modalTitle: string;
  };
};

const pluginRouteAliases: Record<string, string> = {
  'apps/bookmark-manager': 'bm',
  'apps/captains-log': 'journal',
  'apps/file-manager': 'file',
  'apps/job-scheduler': 'job',
  'apps/nostr-radar': 'nr',
  'apps/todo': 'todo',
};

const pluginInstallScreenshotSlugs: Record<string, string> = {
  bm: 'bookmark-manager',
  file: 'file-manager',
  job: 'job-scheduler',
  journal: 'captains-log',
  nr: 'nostr-radar',
  todo: 'todo-app',
};

const pluginRoadmapRepoIds: Record<string, string> = {
  bm: 'bm',
  file: 'file',
  job: 'job',
  journal: 'journal',
  nr: 'Nostr-Radar',
  todo: 'todo',
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

const pluginPagePresentations: Record<string, PluginPagePresentation> = {
  nr: {
    title: 'Explore Nostr by topic. Rank what matters. Filter out what does not.',
    description:
      'Nostr Radar is an intentional Nostr reader that discovers posts through your network, evaluates them in finite time slots, and scores relevance with private local signals.',
    featureGallery: {
      title: 'A reader designed for deliberate discovery.',
      description:
        'Move through finite batches, discover posts through overlooked social signals, and decide which topics deserve your attention.',
      items: [
        {
          id: 'timeline',
          title: 'Timeline',
          description: [
            'Browse posts discovered through your Nostr network without turning your reader into an endless feed.',
            'Nostr Radar fetches and evaluates posts in time slots, making each reading session a manageable batch.',
          ],
          mediaSrc: '/screenshots/nostr-radar/timeline.png',
          mediaAlt: 'Nostr Radar Timeline showing an evaluated time slot of posts',
          mediaLabel: 'Timeline screenshot',
        },
        {
          id: 'for-you',
          title: 'For You',
          description: [
            'See the 25 posts most relevant to you from the posts Nostr Radar has evaluated.',
            'Ranking uses your preferred topics and private interaction signals stored by your local instance.',
          ],
          mediaSrc: '/screenshots/nostr-radar/for-you.png',
          mediaAlt: 'Nostr Radar For You view showing the most relevant posts',
          mediaLabel: 'For You screenshot',
        },
        {
          id: 'filtering',
          title: 'Filtering',
          description: [
            'Filter both Timeline and For You by time slot, or use mass reading to clear an unwanted topic from either view.',
            'Click Read all on a topic to quickly remove posts matching that keyword. Add recurring unwanted topics to Unpreferred Topics to skip them in the future, or add topics to Preferred Topics to influence scoring.',
          ],
          mediaSrc: '/gifs/nostr-radar/filtering.gif',
          mediaAlt:
            'Nostr Radar filtering posts by time slot and removing posts with Read all',
          mediaLabel: 'Filtering demo',
        },
        {
          id: 'reactions',
          title: 'Reactions',
          description: [
            'Surface reactions, not just reposts or quotes.',
            'People often react or reply when they do not want to repost. Followers’ reactions reveal worthwhile posts that conventional timelines tend to miss.',
          ],
          mediaSrc: '/screenshots/nostr-radar/reactions.png',
          mediaAlt: 'Nostr Radar showing a post discovered through a follower reaction',
          mediaLabel: 'Reactions screenshot',
        },
        {
          id: 'archive',
          title: 'Archive',
          description: [
            'Archive posts that are important to you, that you want to collect, or that you plan to return to later.',
          ],
          mediaSrc: '/screenshots/nostr-radar/archive.png',
          mediaAlt: 'Nostr Radar Archive containing saved posts',
          mediaLabel: 'Archive screenshot',
        },
        {
          id: 'private-scoring',
          title: 'Private, independent scoring',
          description: [
            'Keep two or more Nostr Radar instances for the same pubkey—one for work and another for personal interests.',
            'Each instance keeps different private signals and runs its own scoring algorithm without requiring another Nostr identity.',
          ],
          mediaSrc: '/screenshots/nostr-radar/private-scoring.png',
          mediaAlt:
            'Two Nostr Radar instances for the same pubkey with different scoring signals',
          mediaLabel: 'Independent instances illustration',
        },
      ],
    },
  },
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
  'gallery',
  'demo',
  'install',
  'apps',
  'more',
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

export function pluginNavItemsForPath(pathname: string): PluginNavItem[] {
  const slug = routeSlugForPath(pathname);
  const commandToken = pluginRouteAliases[slug] ?? slug;
  const usesFeatureGallery = pluginPagePresentations[commandToken] !== undefined;

  return [
    { sectionId: null, label: 'Back', href: '/' },
    { sectionId: 'features', label: 'Features', href: '#features' },
    usesFeatureGallery
      ? { sectionId: 'gallery', label: 'Gallery', href: '#gallery' }
      : { sectionId: 'demo', label: 'Demo', href: '#demo' },
    { sectionId: 'install', label: 'Install', href: '#install' },
    { sectionId: 'apps', label: 'Apps', href: '#apps' },
    { sectionId: 'more', label: 'More', href: '#more' },
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
  const presentation = pluginPagePresentations[commandToken];
  const command = commands.find(
    (entry) =>
      entry.name === commandToken ||
      entry.pluginAlias === commandToken ||
      entry.aliases?.includes(commandToken),
  );

  const subcommand = command?.subcommands.find(
    (entry) =>
      (entry.webWidget?.placement === 'header' ||
        entry.webWidget?.placement === 'right') &&
      entry.webWidget?.label,
  );

  if (!command || !subcommand?.webWidget) {
    return null;
  }

  const displayName =
    officialApp?.displayName ?? subcommand.webWidget.modalTitle ?? titleCaseSlug(slug);
  const description = officialApp?.description ?? command.summary;

  return {
    routeSlug: slug,
    installScreenshotSlug: pluginInstallScreenshotSlugs[command.name] ?? slug,
    command: command.name,
    subcommand: subcommand.name,
    label: officialApp?.label ?? `/${command.name}`,
    shortName: officialApp?.shortName ?? displayName,
    iconSrc: pluginIconSrcForSlug(slug),
    title: presentation?.title ?? `${displayName} for your AppWeaver workspace.`,
    eyebrow: displayName,
    description: presentation?.description ?? description,
    demoQuery: `widget=${encodeURIComponent(command.name)}:${encodeURIComponent(subcommand.name)}`,
    demoStories: pluginDemoStories[command.name] ?? [],
    features: officialApp?.features ?? [
      description,
      'Install it from the AppWeaver plugin manager when it belongs in your workspace.',
      'Use it through commands, widgets, and AI-assisted workflows.',
    ],
    featureGallery: presentation?.featureGallery ?? null,
  };
}

function demoAppSrc(query: string): string {
  return `/demo/app/index.html?${query}`;
}

function installScreenshotSrc(screenshotSlug: string): string {
  return `/plugin-install/${screenshotSlug}.png`;
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
      <Show when={props.page.featureGallery === null}>
        <ul class="plugin-page-list">
          <For each={props.page.features}>{(feature) => <li>{feature}</li>}</For>
        </ul>
      </Show>
    </div>
  );
}

function PluginFeatureGallery(props: { gallery: PluginFeatureGallery }) {
  const [fullscreenItem, setFullscreenItem] =
    createSignal<PluginFeatureGalleryItem | null>(null);

  return (
    <div class="plugin-feature-gallery">
      <div class="plugin-feature-gallery-heading">
        <div class="plugin-page-eyebrow">Feature Gallery</div>
        <h2 class="plugin-section-title">{props.gallery.title}</h2>
        <p class="plugin-page-description">{props.gallery.description}</p>
      </div>
      <div class="plugin-feature-gallery-list">
        <For each={props.gallery.items}>
          {(item, index) => {
            const [mediaReady, setMediaReady] = createSignal(false);

            return (
              <article
                id={`feature-${item.id}`}
                class="plugin-feature-gallery-item"
                classList={{ 'plugin-feature-gallery-item--reverse': index() % 2 === 1 }}
              >
                <div class="plugin-feature-gallery-copy">
                  <div class="plugin-feature-gallery-index">
                    {String(index() + 1).padStart(2, '0')}
                  </div>
                  <h3>{item.title}</h3>
                  <For each={item.description}>{(paragraph) => <p>{paragraph}</p>}</For>
                </div>
                <figure class="plugin-feature-gallery-media">
                  <figcaption>{item.mediaLabel}</figcaption>
                  <button
                    type="button"
                    class="plugin-feature-gallery-media-button"
                    disabled={!mediaReady()}
                    onClick={() => setFullscreenItem(item)}
                    aria-label={`Open ${item.mediaLabel} fullscreen`}
                  >
                    <img
                      src={item.mediaSrc}
                      alt={item.mediaAlt}
                      classList={{ 'is-ready': mediaReady() }}
                      onLoad={() => setMediaReady(true)}
                      onError={() => setMediaReady(false)}
                    />
                  </button>
                  <Show when={!mediaReady()}>
                    <div class="plugin-feature-gallery-placeholder">
                      <strong>Media coming soon</strong>
                      <span>{item.mediaSrc}</span>
                    </div>
                  </Show>
                </figure>
              </article>
            );
          }}
        </For>
      </div>
      <Show when={fullscreenItem()}>
        {(item) => (
          <div class="lightbox" role="dialog" aria-modal="true">
            <button
              type="button"
              class="lightbox__backdrop"
              aria-label="Close fullscreen feature media"
              onClick={() => setFullscreenItem(null)}
            />
            <figure class="lightbox__card lightbox__card--screenshot">
              <div class="lightbox__head">
                <div>{item().title}</div>
                <button
                  type="button"
                  class="lightbox__close"
                  onClick={() => setFullscreenItem(null)}
                  aria-label="Close fullscreen feature media"
                >
                  x
                </button>
              </div>
              <img
                class="lightbox__media lightbox__media--screenshot"
                src={item().mediaSrc}
                alt={item().mediaAlt}
              />
            </figure>
          </div>
        )}
      </Show>
    </div>
  );
}

function PluginInstallPreview(props: { page: PluginPage }) {
  const screenshotSrc = () => installScreenshotSrc(props.page.installScreenshotSlug);
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
          label={`Install ${props.page.eyebrow}`}
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
          <div class="lightbox" role="dialog" aria-modal="true">
            <button
              type="button"
              class="lightbox__backdrop"
              aria-label="Close fullscreen screenshot"
              onClick={() => setFullscreenScreenshot(null)}
            />
            <figure class="lightbox__card lightbox__card--screenshot">
              <div class="lightbox__head">
                <div>{screenshot().label}</div>
                <button
                  type="button"
                  class="lightbox__close"
                  onClick={() => setFullscreenScreenshot(null)}
                  aria-label="Close fullscreen screenshot"
                >
                  x
                </button>
              </div>
              <img
                class="lightbox__media lightbox__media--screenshot"
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
          <div class="lightbox" role="dialog" aria-modal="true">
            <button
              type="button"
              class="lightbox__backdrop"
              aria-label="Close fullscreen GIF"
              onClick={() => setFullscreenGif(null)}
            />
            <figure class="lightbox__card">
              <div class="lightbox__head">
                <div>{gif().label}</div>
                <button
                  type="button"
                  class="lightbox__close"
                  onClick={() => setFullscreenGif(null)}
                  aria-label="Close fullscreen GIF"
                >
                  x
                </button>
              </div>
              <img class="lightbox__media" src={gif().src} alt={gif().alt} />
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

function PluginMoreSection(props: { page: PluginPage }) {
  const repoId = pluginRoadmapRepoIds[props.page.command] ?? props.page.command;

  return (
    <div class="more-section-stack">
      <RoadmapPanel
        title={`${props.page.eyebrow} Roadmap`}
        boardKey={repoId}
        target={appWeaverRoadmapTarget(repoId)}
      />
      <BlogPostsSection />
      <SiteFooter />
    </div>
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
      <Show
        when={props.page.featureGallery}
        fallback={
          <section
            id="demo"
            class="plugin-page-section plugin-page-section--demo"
            aria-label={`${props.page.eyebrow} demo`}
          >
            <PluginDemoSection page={props.page} />
          </section>
        }
      >
        {(gallery) => (
          <section
            id="gallery"
            class="plugin-page-section plugin-page-section--gallery"
            aria-label={`${props.page.eyebrow} feature gallery`}
          >
            <PluginFeatureGallery gallery={gallery()} />
          </section>
        )}
      </Show>
      <section id="install" class="plugin-page-section plugin-page-section--install">
        <PluginInstallPreview page={props.page} />
      </section>
      <section id="apps" class="plugin-page-section plugin-page-section--apps">
        <PluginAppsSection page={props.page} />
      </section>
      <section id="more" class="plugin-page-section plugin-page-section--more">
        <PluginMoreSection page={props.page} />
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
