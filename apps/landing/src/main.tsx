import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { render } from 'solid-js/web';

import './styles.css';

const logoUrl = '/appweaver-logo.svg';

/** Parent → iframe: landing page uses wide demo chrome (story rail beside embed). See `landing/src/demo/App.tsx`. */
const DEMO_IFRAME_LANDING_CHROME_WIDE_MESSAGE = 'demo.landing_chrome_wide';

type ShowcaseTiming = {
  initialDelayMs?: number;
  stepDelayMs?: number;
  storyDelayMs?: number;
};

type ShowcaseStoryStep = {
  type: string;
  text?: string;
  showcase?: {
    title?: string;
    description?: string;
    delayMs?: number;
  };
};

type ShowcaseStoryEntry = {
  pluginAlias: string;
  pluginName: string;
  iconUrl?: string;
  story: {
    id: string;
    title: string;
    description?: string;
    showcase?: {
      title: string;
      description: string;
      timing?: ShowcaseTiming;
    };
    steps: ShowcaseStoryStep[];
  };
};

type ShowcaseStepState = {
  storyId: string;
  stepIndex: number;
  title: string;
  description: string;
  complete?: boolean;
};

type ShowcaseRailItem =
  | {
      type: 'story';
      storyIndex: number;
      storyId: string;
      pluginAlias: string;
      title: string;
      description: string;
    }
  | {
      type: 'step';
      storyIndex: number;
      storyId: string;
      stepIndex: number;
      pluginAlias: string;
      title: string;
      description: string;
    };

type ActiveSection = 'hero' | 'demo' | 'rest';

type ShowcasePlayRequest = {
  storyIndex: number;
  stepIndex: number;
};

type RequestShowcaseStoryProps = ShowcasePlayRequest & {
  deferWhileInspecting: boolean;
};

const sectionOrder: ActiveSection[] = ['hero', 'demo', 'rest'];

const sectionLabels: Record<ActiveSection, string> = {
  hero: 'Intro',
  demo: 'Demo',
  rest: 'More',
};

/** Matches landing layout breakpoint for wide demo chrome (`styles.css` @media width >= 64rem). */
const LANDING_WIDE_LAYOUT_MQ = '(width >= 64rem)';

function readWideLandingLayoutMatch(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia(LANDING_WIDE_LAYOUT_MQ).matches;
}

/** Keep in sync with `.stage-nav` width and `.stage-nav-item` / spacer widths in `styles.css`. */
const STAGE_NAV_VIEWPORT_WIDTH_PX = 720;
const STAGE_NAV_SLOT_WIDTH_PX = 120;

const DEFAULT_STEP_DELAY_MS = 1800;
const MIN_SHOWCASE_STEP_DELAY_MS = 2800;
const RAIL_CLICK_DELAY_MS = 180;

async function loadShowcaseStories(): Promise<ShowcaseStoryEntry[]> {
  const response = await fetch('/demo/stories.json');

  if (!response.ok) {
    throw new Error('Failed to load demo stories');
  }

  const stories = (await response.json()) as ShowcaseStoryEntry[];

  return stories.filter((entry) => entry.story.showcase);
}

function showcaseTitle(entry: ShowcaseStoryEntry): string {
  return entry.story.showcase?.title ?? entry.story.title;
}

function stepTitle(step: ShowcaseStoryStep): string | null {
  return step.showcase?.title ?? null;
}

function stepDescription(step: ShowcaseStoryStep): string | null {
  return step.showcase?.description ?? step.text ?? null;
}

function hasShowcaseRailStep(step: ShowcaseStoryStep): boolean {
  return stepTitle(step) !== null && stepDescription(step) !== null;
}

function stepDisplayDelayMs(
  entry: ShowcaseStoryEntry,
  step: ShowcaseStoryStep,
): number {
  const delayMs =
    step.showcase?.delayMs ??
    entry.story.showcase?.timing?.stepDelayMs ??
    DEFAULT_STEP_DELAY_MS;

  return step.showcase ? Math.max(delayMs, MIN_SHOWCASE_STEP_DELAY_MS) : delayMs;
}

function railProgressDurationMs(
  entry: ShowcaseStoryEntry,
  item: ShowcaseRailItem,
): number {
  const startIndex = item.type === 'step' ? item.stepIndex : 0;
  const nextShowcaseStepIndex = entry.story.steps.findIndex(
    (step, index) => index > startIndex && hasShowcaseRailStep(step),
  );
  const endIndex =
    nextShowcaseStepIndex < 0 ? entry.story.steps.length : nextShowcaseStepIndex;
  const stepDurationMs = entry.story.steps
    .slice(startIndex, endIndex)
    .reduce(
      (total, step) =>
        step.type === 'complete' ? total : total + stepDisplayDelayMs(entry, step),
      0,
    );

  return Math.max(stepDurationMs, MIN_SHOWCASE_STEP_DELAY_MS);
}

function storyProgressDurationMs(entry: ShowcaseStoryEntry): number {
  const stepDurationMs = entry.story.steps.reduce(
    (total, step) =>
      step.type === 'complete' ? total : total + stepDisplayDelayMs(entry, step),
    0,
  );

  return Math.max(stepDurationMs, MIN_SHOWCASE_STEP_DELAY_MS);
}

function storyProgressElapsedMs(
  entry: ShowcaseStoryEntry,
  stepIndex: number,
): number {
  return entry.story.steps
    .slice(0, Math.max(stepIndex, 0))
    .reduce(
      (total, step) =>
        step.type === 'complete' ? total : total + stepDisplayDelayMs(entry, step),
      0,
    );
}

function railKey(item: ShowcaseRailItem): string {
  return item.type === 'story'
    ? `story:${item.storyId}`
    : `step:${item.storyId}:${item.stepIndex}`;
}

function App() {
  let demoFrameEl: HTMLIFrameElement | undefined;
  let railViewportEl: HTMLDivElement | undefined;
  let storySelectorEl: HTMLDivElement | undefined;
  let railClickTimer: ReturnType<typeof setTimeout> | undefined;

  const [showcaseStories, setShowcaseStories] = createSignal<
    ShowcaseStoryEntry[]
  >([]);
  const [activeShowcaseIndex, setActiveShowcaseIndex] = createSignal(0);
  const [activeSection, setActiveSection] = createSignal<ActiveSection>('hero');
  const [isFrameReady, setIsFrameReady] = createSignal(false);
  const [isAutoplayPaused, setIsAutoplayPaused] = createSignal(false);
  const [isRailInspecting, setIsRailInspecting] = createSignal(false);
  const [pendingPlayRequest, setPendingPlayRequest] =
    createSignal<ShowcasePlayRequest | null>(null);
  const [playRequest, setPlayRequest] = createSignal({
    storyIndex: 0,
    stepIndex: 0,
    nonce: 0,
  });
  const [error, setError] = createSignal<string | null>(null);
  const [activeShowcaseStep, setActiveShowcaseStep] =
    createSignal<ShowcaseStepState | null>(null);

  const [isWideLandingLayout, setIsWideLandingLayout] = createSignal(
    readWideLandingLayoutMatch(),
  );

  const showLandingDemoHeadingRow = createMemo(
    () => isWideLandingLayout() || error() !== null,
  );

  const officialPlugins = [
    {
      name: 'bm',
      summary:
        'Save, organize, and revisit links inside the same AI workspace.',
    },
    {
      name: 'todo',
      summary:
        'Track tasks with installable commands and AI-assisted draft flows.',
    },
    {
      name: 'job',
      summary:
        'Schedule recurring or one-off jobs that run from your own setup.',
    },
    {
      name: 'file',
      summary:
        'Work with project files through shared commands and automation.',
    },
    {
      name: 'browser',
      summary:
        'Browser automation is in progress for web-driven workflows and agents.',
    },
  ];

  const pillars = [
    'Install AppWeaver inside any project or workspace directory and let it act as a shared app layer for that folder.',
    'Chat through the web or over a chat client, then use commands provided by the plugins you have installed.',
    'Choose model providers through OpenCode support, with a built-in Cashu wallet for Pay-per-request Routstr usage.',
    'Create bot accounts, build plugins, and publish them without asking permission from a hosted platform.',
  ];

  const activeShowcaseStory = createMemo(
    () => showcaseStories()[activeShowcaseIndex()] ?? null,
  );

  const isPlaybackPaused = createMemo(
    () => isAutoplayPaused() || isRailInspecting(),
  );

  const showcaseRailItems = createMemo<ShowcaseRailItem[]>(() => {
    const entry = activeShowcaseStory();
    const storyIndex = activeShowcaseIndex();

    if (!entry) {
      return [];
    }

    return entry.story.steps.flatMap((step, stepIndex) => {
      if (!hasShowcaseRailStep(step)) {
        return [];
      }

      return [
        {
          type: 'step' as const,
          storyIndex,
          storyId: entry.story.id,
          stepIndex,
          pluginAlias: entry.pluginAlias,
          title: stepTitle(step)!,
          description: stepDescription(step)!,
        },
      ];
    });
  });

  const activeRailKey = createMemo(() => {
    const step = activeShowcaseStep();
    const items = showcaseRailItems();

    if (step) {
      const exactStepKey = `step:${step.storyId}:${step.stepIndex}`;

      if (!step.complete && items.some((item) => railKey(item) === exactStepKey)) {
        return exactStepKey;
      }

      const nearestPreviousStep = [...items]
        .reverse()
        .find(
          (item) =>
            item.type === 'step' &&
            item.storyId === step.storyId &&
            item.stepIndex <= step.stepIndex,
        );

      if (nearestPreviousStep) {
        return railKey(nearestPreviousStep);
      }

      return items[0] ? railKey(items[0]) : null;
    }

    const firstItem = items[0];

    return firstItem ? railKey(firstItem) : null;
  });

  const activeRailIndex = createMemo(() => {
    const key = activeRailKey();

    if (!key) {
      return 0;
    }

    const index = showcaseRailItems().findIndex((item) => railKey(item) === key);

    return index < 0 ? 0 : index;
  });

  const activeRailProgressDurationMs = createMemo(() => {
    const item = showcaseRailItems()[activeRailIndex()] ?? null;
    const entry = item ? showcaseStories()[item.storyIndex] : null;

    return item && entry
      ? railProgressDurationMs(entry, item)
      : MIN_SHOWCASE_STEP_DELAY_MS;
  });

  const activeStoryProgressDurationMs = createMemo(() => {
    const story = activeShowcaseStory();

    return story ? storyProgressDurationMs(story) : MIN_SHOWCASE_STEP_DELAY_MS;
  });

  const activeStoryProgressElapsedMs = createMemo(() => {
    const story = activeShowcaseStory();
    const step = activeShowcaseStep();

    if (!story || !step || step.storyId !== story.story.id) {
      return 0;
    }

    return step.complete
      ? storyProgressDurationMs(story)
      : storyProgressElapsedMs(story, step.stepIndex);
  });

  const activeRailRollOffsetPx = createMemo(() =>
    Math.max(activeRailIndex(), 0) * 188,
  );

  const activeSectionIndex = createMemo(() =>
    Math.max(sectionOrder.indexOf(activeSection()), 0),
  );

  const stageNavScrollOffsetPx = createMemo(() => {
    const index = activeSectionIndex();
    const activeCenterPx =
      STAGE_NAV_SLOT_WIDTH_PX +
      index * STAGE_NAV_SLOT_WIDTH_PX +
      STAGE_NAV_SLOT_WIDTH_PX / 2;

    return activeCenterPx - STAGE_NAV_VIEWPORT_WIDTH_PX / 2;
  });

  function playShowcaseStory(
    entry: ShowcaseStoryEntry | null,
    stepIndex: number | null,
  ): void {
    if (!entry || !isFrameReady()) {
      return;
    }

    demoFrameEl?.contentWindow?.postMessage(
      {
        type: 'demo.play_story',
        storyId: entry.story.id,
        stepIndex: stepIndex ?? 0,
      },
      window.location.origin,
    );
  }

  function requestShowcaseStory({
    storyIndex,
    stepIndex,
    deferWhileInspecting,
  }: RequestShowcaseStoryProps): void {
    setActiveShowcaseIndex(storyIndex);

    if (deferWhileInspecting && isRailInspecting()) {
      setPendingPlayRequest({ storyIndex, stepIndex });

      return;
    }

    setPlayRequest((request) => ({
      storyIndex,
      stepIndex,
      nonce: request.nonce + 1,
    }));
  }

  function sendPlaybackPaused(paused: boolean): void {
    if (!isFrameReady()) {
      return;
    }

    demoFrameEl?.contentWindow?.postMessage(
      {
        type: 'demo.set_playback_paused',
        paused,
      },
      window.location.origin,
    );
  }

  function setRailInspecting(inspecting: boolean): void {
    setIsRailInspecting(inspecting);

    if (inspecting) {
      return;
    }

    const request = pendingPlayRequest();

    if (!request) {
      return;
    }

    setPendingPlayRequest(null);
    requestShowcaseStory({
      storyIndex: request.storyIndex,
      stepIndex: request.stepIndex,
      deferWhileInspecting: false,
    });
  }

  function clearRailClickTimer(): void {
    if (!railClickTimer) {
      return;
    }

    clearTimeout(railClickTimer);
    railClickTimer = undefined;
  }

  function focusRailItem(item: ShowcaseRailItem): void {
    setActiveShowcaseIndex(item.storyIndex);
    setActiveShowcaseStep({
      storyId: item.storyId,
      stepIndex: item.type === 'step' ? item.stepIndex : 0,
      title: item.title,
      description: item.description,
    });
  }

  function requestRailItemPlayback(item: ShowcaseRailItem): void {
    requestShowcaseStory({
      storyIndex: item.storyIndex,
      stepIndex: item.type === 'step' ? item.stepIndex : 0,
      deferWhileInspecting: true,
    });
  }

  function postLandingChromeWideToDemoFrame(): void {
    if (!isFrameReady()) {
      return;
    }

    const contentWindow = demoFrameEl?.contentWindow;

    if (!contentWindow) {
      return;
    }

    contentWindow.postMessage(
      {
        type: DEMO_IFRAME_LANDING_CHROME_WIDE_MESSAGE,
        wideLandingChrome: isWideLandingLayout(),
      },
      window.location.origin,
    );
  }

  function showSection(section: ActiveSection): void {
    setActiveSection(section);

    if (section === 'demo') {
      setIsAutoplayPaused(false);
    }
  }

  function jumpToRailItem(item: ShowcaseRailItem): void {
    const isCurrentItem = railKey(item) === activeRailKey();

    focusRailItem(item);

    if (isCurrentItem) {
      setPendingPlayRequest(null);
      setIsAutoplayPaused((value) => !value);

      return;
    }

    setIsAutoplayPaused(false);
    requestRailItemPlayback(item);
  }

  function restartRailItem(item: ShowcaseRailItem): void {
    setIsAutoplayPaused(false);
    focusRailItem(item);
    requestRailItemPlayback(item);
  }

  function scheduleRailItemClick(item: ShowcaseRailItem): void {
    clearRailClickTimer();
    railClickTimer = setTimeout(() => {
      railClickTimer = undefined;
      jumpToRailItem(item);
    }, RAIL_CLICK_DELAY_MS);
  }

  function handleRailItemDoubleClick(item: ShowcaseRailItem): void {
    clearRailClickTimer();
    restartRailItem(item);
  }

  function selectShowcaseStory(storyIndex: number): void {
    setIsAutoplayPaused(false);
    requestShowcaseStory({
      storyIndex,
      stepIndex: 0,
      deferWhileInspecting: false,
    });
  }

  onMount(async () => {
    const wideLayoutMq = window.matchMedia(LANDING_WIDE_LAYOUT_MQ);

    function syncWideLandingLayout(): void {
      setIsWideLandingLayout(wideLayoutMq.matches);
    }

    syncWideLandingLayout();
    wideLayoutMq.addEventListener('change', syncWideLandingLayout);
    onCleanup(() =>
      wideLayoutMq.removeEventListener('change', syncWideLandingLayout),
    );

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    window.scrollTo(0, 0);

    try {
      const loadedStories = await loadShowcaseStories();
      setShowcaseStories(loadedStories);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }

    const handleDemoMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as
        | { type?: string; state?: ShowcaseStepState | null }
        | null;

      if (!data || data.type !== 'demo.showcase_step') {
        return;
      }

      const state = data.state ?? null;
      setActiveShowcaseStep(state);

      if (!state) {
        return;
      }

      const storyIndex = showcaseStories().findIndex(
        (entry) => entry.story.id === state.storyId,
      );

      if (storyIndex >= 0 && storyIndex !== activeShowcaseIndex()) {
        setActiveShowcaseIndex(storyIndex);
      }
    };

    window.addEventListener('message', handleDemoMessage);
    onCleanup(() => window.removeEventListener('message', handleDemoMessage));
    onCleanup(clearRailClickTimer);
  });

  createEffect(() => {
    if (activeSection() !== 'demo') {
      return;
    }

    const request = playRequest();
    playShowcaseStory(
      showcaseStories()[request.storyIndex] ?? null,
      request.stepIndex,
    );
  });

  createEffect(() => {
    sendPlaybackPaused(activeSection() !== 'demo' || isPlaybackPaused());
  });

  createEffect(() => {
    if (activeSection() !== 'demo') {
      return;
    }

    isWideLandingLayout();
    isFrameReady();
    postLandingChromeWideToDemoFrame();
  });

  createEffect(() => {
    if (!isWideLandingLayout()) {
      return;
    }

    activeShowcaseIndex();

    const activeStoryEl = storySelectorEl?.querySelector<HTMLElement>(
      '.story-selector-item.is-active',
    );

    activeStoryEl?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  });

  createEffect(() => {
    const top = activeRailRollOffsetPx();
    const inspecting = isRailInspecting();

    if (!railViewportEl || inspecting) {
      return;
    }

    railViewportEl.scrollTo({
      top,
      behavior: 'smooth',
    });
  });

  return (
    <div class="stage-page">
      <div class="stage-background" />
      <div class="stage-shell">
        <header class="stage-header">
          <a href="/" class="stage-brand">
            <img
              src={logoUrl}
              alt="AppWeaver"
              class="stage-brand-logo"
            />
            <span class="stage-brand-text" aria-hidden="true">
              AppWeaver
            </span>
          </a>
          <nav class="stage-nav-simple" aria-label="Landing sections">
            <For each={sectionOrder}>
              {(section) => (
                <button
                  type="button"
                  onClick={() => showSection(section)}
                  class="stage-nav-simple-item"
                  classList={{ 'is-active': activeSection() === section }}
                  aria-current={
                    activeSection() === section ? 'page' : undefined
                  }
                >
                  {sectionLabels[section]}
                </button>
              )}
            </For>
          </nav>
          <nav class="stage-nav" aria-label="Landing sections">
            <div
              class="stage-nav-track"
              style={{
                '--stage-nav-active-offset': `${stageNavScrollOffsetPx()}px`,
              }}
            >
              <div
                class="stage-nav-indicator"
                style={{
                  transform: `translateX(${activeSectionIndex() * STAGE_NAV_SLOT_WIDTH_PX}px)`,
                }}
              />
              <div class="stage-nav-spacer" />
              <For each={sectionOrder}>
                {(section) => (
                  <button
                    type="button"
                    onClick={() => showSection(section)}
                    class="stage-nav-item"
                    classList={{ 'is-active': activeSection() === section }}
                  >
                    {sectionLabels[section]}
                  </button>
                )}
              </For>
              <div class="stage-nav-spacer" />
            </div>
          </nav>
        </header>

        <main class="page-sections">
          <Show when={activeSection() === 'hero'}>
          <section class="hero-stage">
            <div class="hero-copy">
              <h1 class="hero-title">
                Installable apps, automation, and bots that live in your own
                environment.
              </h1>
              <p class="hero-description">
                AppWeaver is an open-source platform for running plugin-powered
                workflows from a project or workspace folder you control. Use it
                through the web or over a chat client, choose the AI providers
                you want, and compose focused apps into one shared system.
              </p>
              <div class="hero-actions">
                  <button
                    type="button"
                    onClick={() => showSection('demo')}
                    class="stage-primary-button"
                  >
                    See it in action
                  </button>
              </div>
            </div>
          </section>
          </Show>

          <Show when={activeSection() === 'demo'}>
          <section
            class="demo-stage"
            classList={{
              'demo-stage--mobile-headingless':
                !isWideLandingLayout() && error() === null,
            }}
          >
            <Show when={showLandingDemoHeadingRow()}>
              <div class="demo-stage-heading">
                <Show when={isWideLandingLayout()}>
                  <div>
                    <div class="demo-eyebrow">
                      Autoplay demo
                    </div>
                    <h2 class="demo-title">
                      Watch the real app drive itself.
                    </h2>
                  </div>
                </Show>
                <Show when={!isWideLandingLayout()}>
                  <Show when={error()}>{(message) => (
                    <div class="demo-error demo-error--inline-narrow">
                      {message()}
                    </div>
                  )}
                  </Show>
                </Show>
              </div>
            </Show>
            <Show when={isWideLandingLayout()}>
              <div class="demo-stage-controls">
                <div ref={storySelectorEl} class="story-selector">
                  <For each={showcaseStories()}>
                    {(story, index) => {
                      const isActive = () =>
                        activeShowcaseIndex() === index();

                      return (
                        <button
                          type="button"
                          onClick={() => selectShowcaseStory(index())}
                          class="story-selector-item"
                          classList={{ 'is-active': isActive() }}
                        >
                          <Show when={isActive()}>
                            <div
                              class="story-selector-progress"
                              style={{
                                animation: `showcase-rail-progress ${activeStoryProgressDurationMs()}ms linear both`,
                                'animation-delay': `-${activeStoryProgressElapsedMs()}ms`,
                                'animation-play-state': isPlaybackPaused()
                                  ? 'paused'
                                  : 'running',
                              }}
                            />
                          </Show>
                          <span class="story-selector-icon-box">
                            <Show
                              when={story.iconUrl}
                              fallback={
                                <span class="story-selector-icon-fallback">
                                  {story.pluginAlias.slice(0, 2).toUpperCase()}
                                </span>
                              }
                            >
                              {(iconUrl) => (
                                <img
                                  src={iconUrl()}
                                  alt=""
                                  class="story-selector-icon"
                                />
                              )}
                            </Show>
                          </span>
                          <span class="story-selector-label">
                            {showcaseTitle(story)}
                          </span>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={isWideLandingLayout()}>
              <div class="showcase-panel">
                <Show when={error()}>
                  {(message) => <div class="demo-error">{message()}</div>}
                </Show>
                <div
                  ref={railViewportEl}
                  onMouseEnter={() => setRailInspecting(true)}
                  onMouseLeave={() => setRailInspecting(false)}
                  onFocusIn={() => setRailInspecting(true)}
                  onFocusOut={() => setRailInspecting(false)}
                  class="showcase-rail"
                >
                  <div class="showcase-rail-list">
                    <For each={showcaseRailItems()}>
                      {(item, index) => {
                        const key = railKey(item);
                        const isActive = () => activeRailKey() === key;
                        const distance = () =>
                          Math.abs(
                            index() - Math.max(activeRailIndex(), 0),
                          );

                        return (
                          <button
                            type="button"
                            onClick={() => scheduleRailItemClick(item)}
                            onDblClick={() => handleRailItemDoubleClick(item)}
                            class="showcase-rail-item"
                            classList={{
                              'is-current': isActive(),
                              'is-manually-paused':
                                isActive() && isAutoplayPaused(),
                              'is-playback-paused':
                                isActive() && isPlaybackPaused(),
                            }}
                            title="Click to pause or resume the current step. Double-click to restart this step."
                          >
                            <Show when={isActive()}>
                              <div
                                class="showcase-rail-progress"
                                style={{
                                  animation: `showcase-rail-progress ${activeRailProgressDurationMs()}ms linear both`,
                                  'animation-play-state': isPlaybackPaused()
                                    ? 'paused'
                                    : 'running',
                                }}
                              />
                            </Show>
                            <div
                              class="showcase-rail-item-content"
                              classList={{
                                'is-active': isActive(),
                                'is-near':
                                  !isActive() && distance() === 1,
                                'is-far':
                                  !isActive() && distance() !== 1,
                              }}
                            >
                              <div class="showcase-rail-item-header">
                                <div class="showcase-rail-item-title">
                                  {item.title}
                                </div>
                                <Show when={item.type === 'story'}>
                                  <div class="showcase-rail-item-plugin">
                                    {item.pluginAlias}
                                  </div>
                                </Show>
                              </div>
                              <p class="showcase-rail-item-description">
                                {item.description}
                              </p>
                            </div>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </div>
            </Show>

            <div class="demo-frame-panel">
                  <div class="demo-frame-toolbar">
                    <span>Live app demo</span>
                    <button
                      type="button"
                      onClick={() => setIsAutoplayPaused((value) => !value)}
                      class="demo-playback-button"
                      aria-label={
                        isAutoplayPaused()
                          ? 'Resume autoplay demo'
                          : 'Pause autoplay demo'
                      }
                    >
                      <Show
                        when={isAutoplayPaused()}
                        fallback={
                          <svg
                            viewBox="0 0 24 24"
                            class="demo-playback-icon"
                            aria-hidden="true"
                          >
                            <path
                              d="M7 5h3v14H7zM14 5h3v14h-3z"
                              fill="currentColor"
                            />
                          </svg>
                        }
                      >
                        <svg
                          viewBox="0 0 24 24"
                          class="demo-playback-icon"
                          aria-hidden="true"
                        >
                          <path d="M8 5v14l11-7z" fill="currentColor" />
                        </svg>
                      </Show>
                      <span>{isPlaybackPaused() ? 'Paused' : 'Playing'}</span>
                    </button>
                  </div>
                  <div class="demo-frame-shell">
                    <iframe
                      title="AppWeaver autoplay demo"
                      ref={demoFrameEl}
                      onLoad={() => {
                        setIsFrameReady(true);
                        playShowcaseStory(activeShowcaseStory(), 0);
                        sendPlaybackPaused(isAutoplayPaused());
                        postLandingChromeWideToDemoFrame();
                      }}
                      src="/demo/app/?playback=passive"
                      tabIndex={-1}
                      class="demo-frame"
                    />
                  </div>
            </div>
          </section>
          </Show>

          <Show when={activeSection() === 'rest'}>
          <section class="rest-stage">
          <section class="pillar-grid">
            <For each={pillars}>
              {(item) => <div class="pillar-card">{item}</div>}
            </For>
          </section>

          <section id="plugins" class="content-section">
            <div class="section-heading-row">
              <div>
                <div class="section-eyebrow">Official plugins</div>
                <h2 class="section-title">
                  Start with a small set of focused apps.
                </h2>
              </div>
              <p class="section-summary">
                AppWeaver already ships with bookmarks, todos, jobs, and file
                workflows, while browser automation is being added next. Anyone
                can create and publish new plugins on top of the same core.
              </p>
            </div>
            <div class="plugin-grid">
              <For each={officialPlugins}>
                {(plugin) => (
                  <div class="plugin-card">
                    <div class="plugin-label">Plugin</div>
                    <div class="plugin-name">{plugin.name}</div>
                    <p class="plugin-summary">{plugin.summary}</p>
                  </div>
                )}
              </For>
            </div>
          </section>

          <section id="ownership" class="ownership-grid">
            <div class="ownership-panel">
              <div class="section-eyebrow">Open and permissionless</div>
              <h2 class="section-title">Own the stack instead of renting it.</h2>
              <p class="body-copy">
                AppWeaver is fully open-source and self-hostable. You can create
                bot accounts, install plugins, publish your own extensions, and
                run the platform on infrastructure you control without needing
                approval from a central service.
              </p>
            </div>
            <div class="ownership-panel">
              <div class="section-eyebrow">Provider flexibility</div>
              <h2 class="section-title">
                Bring your model setup, or Pay-per-request.
              </h2>
              <p class="body-copy">
                Under the hood, AppWeaver uses the OpenCode SDK so it can work
                with the model providers OpenCode supports today. It also
                includes a built-in Cashu wallet, which makes Pay-per-request
                usage possible through Routstr-supported models, with more
                provider options on the way.
              </p>
            </div>
          </section>

          <section id="deploy" class="deploy-section">
            <div class="section-eyebrow">What comes next</div>
            <h2 class="section-title">
              A simple open core now, a broader app ecosystem after that.
            </h2>
            <p class="body-copy">
              The platform is already useful as a personal assistant,
              automation layer, and bot runtime. The next phase is making
              plugin publishing, browser automation, and deployment flows even
              smoother while keeping the core open and self-hostable.
            </p>
            <div class="hero-actions">
              <a href="https://github.com/getappweaver" class="stage-primary-button">
                Follow development
              </a>
              <a href="mailto:hello@getappweaver.com" class="stage-secondary-button">
                Contact AppWeaver
              </a>
            </div>
          </section>
          </section>
          </Show>
        </main>
      </div>
    </div>
  );
}

render(() => <App />, document.getElementById('root')!);
