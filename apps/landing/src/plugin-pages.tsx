import { Show, createSignal, onMount } from 'solid-js';

type PluginPage = {
  command: string;
  subcommand: string;
  title: string;
  eyebrow: string;
  description: string;
  demoQuery: string;
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
  const slug = pathname.replace(/^\/+|\/+$/g, '');

  if (!slug) {
    return null;
  }

  const commandToken = pluginRouteAliases[slug] ?? slug;
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

  const displayName = subcommand.webWidget.modalTitle || titleCaseSlug(slug);

  return {
    command: command.name,
    subcommand: subcommand.name,
    title: `${displayName} for your AppWeaver workspace.`,
    eyebrow: displayName,
    description: command.summary,
    demoQuery: `widget=${encodeURIComponent(command.name)}:${encodeURIComponent(subcommand.name)}`,
  };
}

function demoAppSrc(query: string): string {
  return `/demo/app/index.html?${query}`;
}

function PluginLandingPage(props: { page: PluginPage }) {
  return (
    <div class="plugin-page-stage">
      <section class="plugin-page-demo" aria-label={`${props.page.eyebrow} demo`}>
        <iframe
          title={`${props.page.eyebrow} AppWeaver demo`}
          src={demoAppSrc(props.page.demoQuery)}
          class="plugin-page-demo-frame"
        />
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

export function PluginRoute(props: { pathname: string }) {
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
        {(resolvedPage) => <PluginLandingPage page={resolvedPage()} />}
      </Show>
    </Show>
  );
}

export function isPluginRoute(pathname: string): boolean {
  return pathname !== '/';
}
