import { For, createSignal, onCleanup, onMount } from 'solid-js';
import { render } from 'solid-js/web';

import './styles.css';

const logoUrl = '/appweaver-logo.svg';

type NavItem = {
  sectionId: OnePageSectionId;
  label: string;
  href: string;
};

type OnePageSectionId = 'intro' | 'features' | 'demo' | 'install';

type HeaderProps = {
  onePageActiveSection: OnePageSectionId;
  onOnePageNavSelect: (sectionId: OnePageSectionId) => void;
};

type HomePageProps = {
  installHref: string;
  demoHref: string;
};

const onePageNavItems: NavItem[] = [
  { sectionId: 'intro', label: 'Intro', href: '#intro' },
  { sectionId: 'features', label: 'Features', href: '#features' },
  { sectionId: 'demo', label: 'Interactive Demo', href: '#demo' },
  { sectionId: 'install', label: 'Install', href: '#install' },
];

const features = [
  {
    title: 'Local-First App Hub',
    points: [
      'Run AppWeaver from a project or workspace folder you control.',
      'Use apps that can work with your local filesystem, create files, inspect project state, and show visual git diffs.',
      'Install many AppWeaver instances; each instance has its own workspace, local data, and Nostr bot identity.',
    ],
  },
  {
    title: 'Installable Apps And Plugin Manager',
    points: [
      'Browse apps in the plugin manager, then download and use the ones that belong in your hub.',
      'Install focused apps like todos, bookmarks, jobs, files, browser actions, journals, and publishing.',
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

function Header(props: HeaderProps) {
  return (
    <header class="stage-header">
      <a href="/" class="stage-brand">
        <img src={logoUrl} alt="AppWeaver" class="stage-brand-logo" />
        <span class="stage-brand-text" aria-hidden="true">
          AppWeaver
        </span>
      </a>
      <nav class="stage-nav-simple" aria-label="Landing pages">
        <For each={onePageNavItems}>
          {(item) => (
            <a
              href={item.href}
              class="stage-nav-simple-item"
              classList={{ 'is-active': props.onePageActiveSection === item.sectionId }}
              aria-current={
                props.onePageActiveSection === item.sectionId ? 'location' : undefined
              }
              onClick={() => {
                props.onOnePageNavSelect(item.sectionId);
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
        <h1 class="hero-title">
          An <span class="hero-title-ai">AI</span>-powered app hub on a computer{' '}
          <span class="hero-title-mark hero-title-mark--computer">you control</span>.
        </h1>
        <p class="hero-description">
          Your data stays <span class="hero-description-mark">local-first</span>.
          You choose which apps belong in your hub: Todo, Bookmarks, Jobs, Files,
          Scheduled Jobs, Browser Actions, Captain&apos;s Log, and more. Use them through{' '}
          <a href={props.demoHref} class="hero-description-link">
            desktop and mobile web UI
          </a>
          , prompts, local terminal input, WebSocket API, or your favourite Nostr
          chat app.
        </p>
        <div class="hero-install-block">
          <div class="hero-install-label">
            Go to your project/workspace folder and run:
          </div>
          <div class="hero-install-command" aria-label="Install command">
            <code>git clone https://github.com/getappweaver/core.git appweaver</code>
            <code>cd appweaver &amp;&amp; bun install &amp;&amp; bun run start</code>
          </div>
        </div>
        <div class="hero-actions">
          <a href={props.installHref} class="hero-install-guide-link">
            Installation Guide
          </a>
        </div>
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
          <details
            class="feature-panel"
            open={props.openFeatureIndex === index()}
            onToggle={(event) => {
              if (event.currentTarget.open) {
                props.setOpenFeatureIndex(index());
              }
            }}
          >
            <summary class="feature-panel-summary">
              <span class="feature-panel-mark" aria-hidden="true" />
              <span class="feature-panel-title">{feature.title}</span>
            </summary>
            <ul class="feature-panel-list">
              <For each={feature.points}>
                {(point) => <li class="feature-panel-point">{point}</li>}
              </For>
            </ul>
          </details>
        )}
      </For>
    </div>
  );
}

function InstallContent() {
  return (
    <div class="install-copy">
      <h1 class="install-title">Install AppWeaver inside your workspace.</h1>
      <p class="install-summary">
        AppWeaver is meant to live inside the project or workspace you want it to
        operate on. The recommended folder name is <code>appweaver</code>.
      </p>

      <div class="install-command" aria-label="Native install command">
        <code>git clone https://github.com/getappweaver/core.git appweaver</code>
        <code>cd appweaver</code>
        <code>bun install</code>
        <code>bun run start</code>
      </div>

      <div class="install-notes">
        <p>
          On first start, AppWeaver prints a setup URL in the terminal. Open it in
          your browser, follow the setup interface, then restart when setup says it
          is ready.
        </p>
        <p>
          After restart, AppWeaver listens for Nostr DMs, serves the web UI, and
          accepts local terminal chat from the same terminal process.
        </p>
        <p>
          The default workspace is the parent folder. For example, if AppWeaver is
          installed at <code>~/Projects/my-project/appweaver</code>, the default AI
          workspace is <code>~/Projects/my-project</code>.
        </p>
      </div>

      <div class="install-docker-note">
        <span class="install-docker-label">Docker / VPS path</span>
        <p>
          Docker is useful when you want runtime dependencies packaged for a VPS or
          server install. Keep the full container setup separate so the main install
          path stays short.
        </p>
        <a
          class="install-link"
          href="https://github.com/getappweaver/core/blob/main/DOCKER.md"
        >
          Read Docker setup on GitHub
        </a>
      </div>
    </div>
  );
}

function OnePage(props: {
  onActiveSectionChange: (sectionId: OnePageSectionId) => void;
}) {
  const [openFeatureIndex, setOpenFeatureIndex] = createSignal(0);

  onMount(() => {
    const root = document.querySelector('.one-page-stage');

    if (!(root instanceof HTMLElement)) {
      return;
    }

    const sectionIds: OnePageSectionId[] = ['intro', 'features', 'demo', 'install'];
    let frameId: number | null = null;

    const updateActiveSection = () => {
      frameId = null;
      const rootRect = root.getBoundingClientRect();
      const activationY = rootRect.top + rootRect.height * 0.3;
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
        <HomePage installHref="#install" demoHref="#demo" />
      </section>
      <section id="features" class="one-page-section">
        <FeatureAccordion
          openFeatureIndex={openFeatureIndex()}
          setOpenFeatureIndex={setOpenFeatureIndex}
        />
      </section>
      <section id="demo" class="one-page-section one-page-section--demo">
        <iframe title="AppWeaver interactive demo" src="/demo/app/" class="one-page-demo-frame" />
      </section>
      <section id="install" class="one-page-section one-page-section--install">
        <InstallContent />
      </section>
    </div>
  );
}

function App() {
  const [onePageActiveSection, setOnePageActiveSection] =
    createSignal<OnePageSectionId>('intro');

  return (
    <div class="stage-page">
      <div class="stage-background" />
      <div class="stage-shell">
        <Header
          onePageActiveSection={onePageActiveSection()}
          onOnePageNavSelect={setOnePageActiveSection}
        />

        <main class="page-sections">
          <OnePage onActiveSectionChange={setOnePageActiveSection} />
        </main>
      </div>
    </div>
  );
}

render(() => <App />, document.getElementById('root')!);
