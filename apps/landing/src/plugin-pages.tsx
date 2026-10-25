import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';

import type {
  PluginCatalogFeature,
  PluginDemoStory,
  PluginDemoGifVariant,
  PluginFeatureGallery,
  PluginFeatureGalleryItem,
} from '../content-types';

import { AppWeaverInstallBlock } from './appweaver-install-block';
import { BlogPostsSection } from './blog-posts';
import { scheduleStageHashScroll, scrollStageToHash } from './hash-scroll';
import { officialApps, officialAuthor } from './landing-data';
import { OfficialAppGrid } from './official-app-grid';
import { RoadmapPanel, appWeaverRoadmapTarget } from './roadmap-panel';
import { DocsIcon, SiteFooter } from './site-footer';

type PluginPageSectionId =
  'features' | 'gallery' | 'demo' | 'install' | 'more';

type PluginPage = {
  routeSlug: string;
  installScreenshot: string | null;
  docsHref: string;
  roadmapRepoId: string | null;
  command: string;
  subcommand: string;
  label: string;
  shortName: string;
  iconSrc: string | null;
  title: string;
  eyebrow: string;
  description: string;
  demoQuery: string | null;
  demoStories: PluginDemoStory[];
  catalogFeatures: PluginCatalogFeature[];
  features: string[];
  featureGallery: PluginFeatureGallery | null;
};

type PluginDemoViewMode = 'desktop' | 'mobile';

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

function isVideoMedia(src: string): boolean {
  return src.endsWith('.webm') || src.endsWith('.mp4');
}

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
  'more',
];

export function routeSlugForPath(pathname: string): string {
  return pathname.replace(/^\/+|\/+$/g, '');
}

export function officialAppForSlug(slug: string) {
  return officialApps.find(
    (app) => app.href === `/${slug}` || app.alias === slug,
  );
}

export function pluginNavItemsForPath(pathname: string): PluginNavItem[] {
  const slug = routeSlugForPath(pathname);
  const app = officialAppForSlug(slug);
  const usesFeatureGallery = !!app?.presentation?.featureGallery;
  const hasCatalogFeatures = (app?.catalogFeatures?.length ?? 0) > 0;

  return [
    { sectionId: 'features', label: 'Features', href: '#features' },
    ...(usesFeatureGallery
      ? [{ sectionId: 'gallery' as const, label: 'Gallery', href: '#gallery' }]
      : hasCatalogFeatures || app?.hasInteractiveDemo === false
        ? []
        : [{ sectionId: 'demo' as const, label: 'Demo', href: '#demo' }]),
    { sectionId: 'install', label: 'Install', href: '#install' },
    { sectionId: 'more', label: 'More', href: '#more' },
  ];
}

function pluginPageForPath(
  pathname: string,
  commands: DemoCommand[],
): PluginPage | null {
  const slug = routeSlugForPath(pathname);

  if (!slug) {
    return null;
  }

  const officialApp = officialAppForSlug(slug);

  if (!officialApp) {
    return null;
  }

  const commandToken = officialApp.alias;
  const presentation = officialApp.presentation;
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

  const displayName = officialApp.displayName;
  const description = officialApp.description;

  return {
    routeSlug: slug,
    installScreenshot: officialApp.installScreenshot,
    docsHref: `/docs/plugins/${officialApp.alias}/`,
    roadmapRepoId: officialApp.roadmapRepoId,
    command: command?.name ?? commandToken,
    subcommand: subcommand?.name ?? 'status',
    label: officialApp?.label ?? `/${commandToken}`,
    shortName: officialApp?.shortName ?? displayName,
    iconSrc: officialApp.iconSrc,
    title:
      presentation?.title ?? `${displayName} for your AppWeaver workspace.`,
    eyebrow: displayName,
    description: presentation?.description ?? description,
    demoQuery:
      officialApp.hasInteractiveDemo && subcommand?.webWidget && command
        ? `widget=${encodeURIComponent(command.name)}:${encodeURIComponent(subcommand.name)}`
        : null,
    demoStories: officialApp.demoStories,
    catalogFeatures: officialApp.catalogFeatures,
    features: officialApp.features,
    featureGallery: presentation?.featureGallery ?? null,
  };
}

function demoAppSrc(query: string): string {
  return `/demo/app/index.html?${query}`;
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

function ShowcaseVideoItem(props: {
  feat: PluginCatalogFeature;
  index: number;
  isPaused: boolean;
  onOpenFullscreen: (feat: PluginCatalogFeature) => void;
}) {
  let videoRef: HTMLVideoElement | undefined;
  let isInView = false;
  let hasLeftViewCompletely = true;
  let playPromise: Promise<void> | null = null;

  const play = () => {
    if (!videoRef || props.isPaused) return;
    playPromise = videoRef.play().catch(() => {
      // Suppress playback interruptions during rapid scrolling
    });
  };

  const pause = () => {
    if (!videoRef) return;
    if (playPromise) {
      playPromise
        .then(() => {
          videoRef?.pause();
        })
        .catch(() => {});
    } else {
      videoRef.pause();
    }
  };

  createEffect(() => {
    if (props.isPaused) {
      pause();
    } else if (isInView) {
      play();
    }
  });

  onMount(() => {
    if (!videoRef || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
            isInView = true;
            if (hasLeftViewCompletely && videoRef) {
              videoRef.currentTime = 0;
              hasLeftViewCompletely = false;
            }
            play();
          } else if (!entry.isIntersecting || entry.intersectionRatio === 0) {
            isInView = false;
            hasLeftViewCompletely = true;
            pause();
          } else if (entry.intersectionRatio < 0.3) {
            isInView = false;
            pause();
          }
        }
      },
      {
        threshold: [0, 0.3],
      },
    );

    observer.observe(videoRef);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pause();
      } else if (isInView) {
        play();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    onCleanup(() => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      pause();
    });
  });

  return (
    <div class="plugin-showcase-item">
      <header class="plugin-showcase-header">
        <span class="plugin-showcase-index">0{props.index + 1}</span>
        <h2 class="plugin-showcase-active-title">{props.feat.title}</h2>
      </header>
      <figure class="plugin-showcase-video-frame">
        <button
          type="button"
          class="plugin-showcase-video-button"
          onClick={() => props.onOpenFullscreen(props.feat)}
          aria-label={`Open ${props.feat.title} fullscreen`}
        >
          <video
            ref={videoRef}
            class="plugin-showcase-video"
            src={props.feat.media.video!}
            poster={props.feat.media.poster ?? undefined}
            loop
            muted
            playsinline
            preload="metadata"
            aria-label={props.feat.title}
          />
        </button>
      </figure>
    </div>
  );
}

function PluginCatalogShowcase(props: {
  catalogFeatures: PluginCatalogFeature[];
  shortName: string;
}) {
  const videoFeatures = () =>
    [...props.catalogFeatures]
      .filter((f) => f.media.video !== null)
      .sort((a, b) => a.order - b.order);
  const [fullscreenVideo, setFullscreenVideo] =
    createSignal<PluginCatalogFeature | null>(null);

  return (
    <div class="plugin-catalog-showcase">
      <For each={videoFeatures()}>
        {(feat, idx) => (
          <ShowcaseVideoItem
            feat={feat}
            index={idx()}
            isPaused={fullscreenVideo() !== null}
            onOpenFullscreen={setFullscreenVideo}
          />
        )}
      </For>
      <Show when={fullscreenVideo()}>
        {(feat) => (
          <div class="lightbox" role="dialog" aria-modal="true">
            <button
              type="button"
              class="lightbox__backdrop"
              aria-label="Close fullscreen video"
              onClick={() => setFullscreenVideo(null)}
            />
            <figure class="lightbox__card">
              <div class="lightbox__head">
                <div>{feat().title}</div>
                <button
                  type="button"
                  class="lightbox__close"
                  onClick={() => setFullscreenVideo(null)}
                  aria-label="Close fullscreen video"
                >
                  x
                </button>
              </div>
              <video
                class="lightbox__media"
                src={feat().media.video!}
                poster={feat().media.poster ?? undefined}
                autoplay
                loop
                muted
                playsinline
                aria-label={feat().title}
              />
            </figure>
          </div>
        )}
      </Show>
    </div>
  );
}

function PluginFeatures(props: { page: PluginPage }) {
  return (
    <>
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
        <Show
          when={
            props.page.catalogFeatures.length === 0 &&
            props.page.featureGallery === null
          }
        >
          <ul class="plugin-page-list">
            <For each={props.page.features}>
              {(feature) => <li>{feature}</li>}
            </For>
          </ul>
        </Show>
      </div>
      <Show when={props.page.catalogFeatures.length > 0}>
        <PluginCatalogShowcase
          catalogFeatures={props.page.catalogFeatures}
          shortName={props.page.shortName}
        />
      </Show>
    </>
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
                classList={{
                  'plugin-feature-gallery-item--reverse': index() % 2 === 1,
                }}
              >
                <div class="plugin-feature-gallery-copy">
                  <div class="plugin-feature-gallery-index">
                    {String(index() + 1).padStart(2, '0')}
                  </div>
                  <h3>{item.title}</h3>
                  <For each={item.description}>
                    {(paragraph) => <p>{paragraph}</p>}
                  </For>
                </div>
                <figure class="plugin-feature-gallery-media">
                  <button
                    type="button"
                    class="plugin-feature-gallery-media-button"
                    disabled={!mediaReady()}
                    onClick={() => setFullscreenItem(item)}
                    aria-label={`Open ${item.mediaLabel} fullscreen`}
                  >
                    <Show
                      when={isVideoMedia(item.mediaSrc)}
                      fallback={
                        <img
                          src={item.mediaSrc}
                          alt={item.mediaAlt}
                          classList={{ 'is-ready': mediaReady() }}
                          onLoad={() => setMediaReady(true)}
                          onError={() => setMediaReady(false)}
                        />
                      }
                    >
                      <video
                        src={item.mediaSrc}
                        autoplay
                        loop
                        muted
                        playsinline
                        classList={{ 'is-ready': mediaReady() }}
                        onLoadedData={() => setMediaReady(true)}
                        onError={() => setMediaReady(false)}
                        aria-label={item.mediaAlt}
                      />
                    </Show>
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
              <Show
                when={isVideoMedia(item().mediaSrc)}
                fallback={
                  <img
                    class="lightbox__media lightbox__media--screenshot"
                    src={item().mediaSrc}
                    alt={item().mediaAlt}
                  />
                }
              >
                <video
                  class="lightbox__media lightbox__media--screenshot"
                  src={item().mediaSrc}
                  autoplay
                  loop
                  muted
                  playsinline
                  aria-label={item().mediaAlt}
                />
              </Show>
            </figure>
          </div>
        )}
      </Show>
    </div>
  );
}

function PluginInstallPreview(props: { page: PluginPage }) {
  const screenshotSrc = () => props.page.installScreenshot;
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
        <h2 class="plugin-section-title">
          Install from the official app author.
        </h2>
        <p class="plugin-page-description">
          AppWeaver shows catalog entries before install. The current app is
          highlighted below, and the author line stays visible so you can verify
          it comes from{' '}
          <span class="plugin-install-author-emphasis">
            {officialAuthor.label}
          </span>
          .
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
        <Show when={screenshotSrc()}>
          {(src) => (
            <ScreenshotCard
              src={src()}
              alt={`AppWeaver Plugin Manager showing ${props.page.eyebrow}`}
              label={`Install ${props.page.eyebrow}`}
              onOpenFullscreen={() =>
                setFullscreenScreenshot({
                  src: src(),
                  alt: `AppWeaver Plugin Manager showing ${props.page.eyebrow}`,
                  label: `Install ${props.page.shortName}`,
                })
              }
            />
          )}
        </Show>
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
  const hasDesktopGifs = () =>
    hasDemoGifsForView(props.page.demoStories, 'desktop');
  const hasMobileGifs = () =>
    hasDemoGifsForView(props.page.demoStories, 'mobile');

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
        <div
          class="plugin-demo-carousel"
          aria-label={`${props.page.eyebrow} GIF demos`}
        >
          <h2 class="plugin-panel-title">
            Watch how {props.page.shortName} works
          </h2>
          <div class="plugin-demo-view-toggle" aria-label="Choose GIF viewport">
            <button
              type="button"
              class="plugin-demo-view-button"
              classList={{
                'plugin-demo-view-button--active': viewMode() === 'desktop',
              }}
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
              classList={{
                'plugin-demo-view-button--active': viewMode() === 'mobile',
              }}
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
                      'plugin-demo-thumb--active':
                        selectedIndex() === activeGifIndex(),
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
                  <Show
                    when={isVideoMedia(gif().src)}
                    fallback={
                      <img
                        class="plugin-demo-gif"
                        src={gif().src}
                        alt={gif().alt}
                      />
                    }
                  >
                    <video
                      class="plugin-demo-gif"
                      src={gif().src}
                      poster={gif().poster ?? undefined}
                      autoplay
                      loop
                      muted
                      playsinline
                      aria-label={gif().alt}
                    />
                  </Show>
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
              <Show
                when={isVideoMedia(gif().src)}
                fallback={
                  <img class="lightbox__media" src={gif().src} alt={gif().alt} />
                }
              >
                <video
                  class="lightbox__media"
                  src={gif().src}
                  poster={gif().poster ?? undefined}
                  autoplay
                  loop
                  muted
                  playsinline
                  aria-label={gif().alt}
                />
              </Show>
            </figure>
          </div>
        )}
      </Show>
      <div class="plugin-interactive-demo-panel">
        <h2 class="plugin-panel-title">
          See {props.page.shortName} stories for yourself
        </h2>
        <div
          class="plugin-demo-view-toggle plugin-demo-view-toggle--interactive"
          aria-label="Choose interactive demo viewport"
        >
          <button
            type="button"
            class="plugin-demo-view-button"
            classList={{
              'plugin-demo-view-button--active': demoViewMode() === 'desktop',
            }}
            onClick={() => setDemoViewMode('desktop')}
          >
            Desktop
          </button>
          <button
            type="button"
            class="plugin-demo-view-button"
            classList={{
              'plugin-demo-view-button--active': demoViewMode() === 'mobile',
            }}
            onClick={() => setDemoViewMode('mobile')}
          >
            Mobile
          </button>
        </div>
        <iframe
          title={`See ${props.page.shortName} stories for yourself`}
          src={demoAppSrc(props.page.demoQuery ?? '')}
          class="plugin-page-demo-frame"
          classList={{
            'plugin-page-demo-frame--mobile': demoViewMode() === 'mobile',
          }}
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
          {props.page.shortName} can run beside the other official AppWeaver
          apps. Each one adds focused commands, widgets, and AI skills.
        </p>
      </div>

      <OfficialAppGrid
        apps={officialApps.filter(
          (app) => app.href !== `/${props.page.routeSlug}`,
        )}
      />
    </div>
  );
}

function ArrowRightIcon(props?: { class?: string }) {
  return (
    <svg
      class={props?.class}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function PluginResourcesSection(props: { page: PluginPage }) {
  return (
    <div class="more-section-stack">
      <div class="plugin-docs-banner">
        <a
          href={props.page.docsHref}
          class="plugin-docs-link"
          aria-label={`${props.page.eyebrow} documentation`}
        >
          <span class="plugin-docs-link-icon-wrap" aria-hidden="true">
            <DocsIcon class="plugin-docs-link-icon" />
          </span>
          <span class="plugin-docs-link-content">
            <span class="plugin-docs-link-eyebrow">Documentation</span>
            <span class="plugin-docs-link-title">
              {props.page.eyebrow} documentation
            </span>
            <span class="plugin-docs-link-desc">
              Read setup guides, configuration options, and command reference
            </span>
          </span>
          <span class="plugin-docs-link-arrow" aria-hidden="true">
            <ArrowRightIcon />
          </span>
        </a>
      </div>
      <Show when={props.page.roadmapRepoId}>
        {(repoId) => (
          <RoadmapPanel
            title={`${props.page.eyebrow} Roadmap`}
            boardKey={repoId()}
            target={appWeaverRoadmapTarget(repoId())}
          />
        )}
      </Show>
    </div>
  );
}

function PluginMoreSection() {
  return (
    <div class="more-section-stack">
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

    const cancelInitialHashScroll = scheduleStageHashScroll(
      root,
      scheduleUpdate,
    );

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
      <section
        id="features"
        class="plugin-page-section plugin-page-section--features"
      >
        <PluginFeatures page={props.page} />
      </section>
      <Show
        when={props.page.featureGallery}
        fallback={
          <Show
            when={
              props.page.catalogFeatures.length === 0 &&
              props.page.demoQuery !== null
            }
          >
            <section
              id="demo"
              class="plugin-page-section plugin-page-section--demo"
              aria-label={`${props.page.eyebrow} demo`}
            >
              <PluginDemoSection page={props.page} />
            </section>
          </Show>
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
      <section
        id="install"
        class="plugin-page-section plugin-page-section--install"
      >
        <PluginInstallPreview page={props.page} />
      </section>
      <section
        id="more"
        class="plugin-page-section plugin-page-section--roadmap"
      >
        <PluginResourcesSection page={props.page} />
      </section>
      <section id="apps" class="plugin-page-section plugin-page-section--apps">
        <PluginAppsSection page={props.page} />
      </section>
      <section class="plugin-page-section plugin-page-section--more">
        <PluginMoreSection />
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
  return pathname.startsWith('/apps/');
}
