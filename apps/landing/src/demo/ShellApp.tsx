import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from 'solid-js';

const logoUrl = '/appweaver-logo.svg';

type DemoStoryEntry = {
  pluginAlias: string;
  pluginName: string;
  sourceType: 'command' | 'ai';
  sourceName: string;
  story: {
    id: string;
    title: string;
    description?: string;
    showcase?: {
      title: string;
      description: string;
      timing?: {
        initialDelayMs?: number;
        stepDelayMs?: number;
        storyDelayMs?: number;
      };
    };
    kind: 'command' | 'ai';
  };
};

async function loadStories(): Promise<DemoStoryEntry[]> {
  const response = await fetch('/demo/stories.json');

  if (!response.ok) {
    throw new Error('Failed to load demo stories');
  }

  return (await response.json()) as DemoStoryEntry[];
}

function normalizePluginLabel(alias: string): string {
  return alias === 'bm'
    ? 'Bookmarks'
    : alias.charAt(0).toUpperCase() + alias.slice(1);
}

function storyShowcaseTitle(entry: DemoStoryEntry): string {
  return entry.story.showcase?.title ?? entry.story.title;
}

function storyShowcaseDescription(entry: DemoStoryEntry): string | undefined {
  return entry.story.showcase?.description ?? entry.story.description;
}

export function DemoShellApp() {
  let appFrameEl: HTMLIFrameElement | undefined;
  const [stories, setStories] = createSignal<DemoStoryEntry[]>([]);
  const [selectedStoryId, setSelectedStoryId] = createSignal<string | null>(
    null,
  );
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const loadedStories = await loadStories();
      setStories(loadedStories);
      setSelectedStoryId(loadedStories[0]?.story.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  });

  const groupedStories = createMemo(() => {
    const groups = new Map<string, DemoStoryEntry[]>();

    for (const story of stories()) {
      const current = groups.get(story.pluginAlias) ?? [];
      current.push(story);
      groups.set(story.pluginAlias, current);
    }

    return Array.from(groups.entries()).map(([pluginAlias, entries]) => ({
      pluginAlias,
      pluginLabel: normalizePluginLabel(pluginAlias),
      entries,
    }));
  });

  const selectedStory = createMemo(
    () =>
      stories().find((story) => story.story.id === selectedStoryId()) ?? null,
  );

  function syncSelectedStoryToFrame(storyId: string | null): void {
    appFrameEl?.contentWindow?.postMessage(
      {
        type: 'demo.select_story',
        storyId,
      },
      window.location.origin,
    );
  }

  createEffect(() => {
    syncSelectedStoryToFrame(selectedStoryId());
  });

  return (
    <div class="min-h-screen bg-[#0a0d14] text-zinc-100 antialiased">
      <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(78,205,196,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(124,92,255,0.18),_transparent_32%),linear-gradient(180deg,_#0d111a,_#090b11_60%,_#07090d)]" />
      <div class="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6">
        <header class="flex items-center justify-between border-b border-white/8 pb-4">
          <div class="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="AppWeaver"
              class="h-8 w-8 rounded-sm invert"
            />
            <div>
              <div class="text-sm font-semibold tracking-[0.18em] text-zinc-300 uppercase">
                AppWeaver Demo
              </div>
              <div class="text-sm text-zinc-500">
                Story navigator on the left, exact web UI on the right.
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <a
              href="/"
              class="rounded-full border border-white/10 px-4 py-2 text-zinc-300 hover:bg-white/6"
            >
              Home
            </a>
            <a
              href="/demo/app/"
              class="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-cyan-100 hover:bg-cyan-300/16"
            >
              Open app only
            </a>
          </div>
        </header>

        <main class="grid min-h-0 flex-1 gap-4 py-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside class="overflow-auto rounded-[1.5rem] border border-white/8 bg-white/[0.04] p-4">
            <div class="border-b border-white/8 pb-4">
              <div class="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Stories
              </div>
              <div class="mt-2 text-lg font-semibold text-white">
                Generated from plugin definitions
              </div>
              <div class="mt-2 text-sm text-zinc-400">
                Use these as the guided entry points for the demo. The exact app
                UI stays untouched on the right.
              </div>
            </div>

            <Show when={error()}>
              {(message) => (
                <div class="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
                  {message()}
                </div>
              )}
            </Show>

            <div class="mt-4 space-y-5">
              <For each={groupedStories()}>
                {(group) => (
                  <section>
                    <div class="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                      {group.pluginLabel}
                    </div>
                    <div class="space-y-3">
                      <For each={group.entries}>
                        {(entry) => {
                          const isSelected = () =>
                            selectedStoryId() === entry.story.id;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStoryId(entry.story.id);
                              }}
                              class={`w-full rounded-[1.25rem] border p-4 text-left transition ${isSelected() ? 'border-cyan-300/30 bg-cyan-300/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'}`}
                            >
                              <div class="flex items-center justify-between gap-3">
                                <div class="text-sm font-semibold text-white">
                                  {storyShowcaseTitle(entry)}
                                </div>
                                <div class="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                  {entry.sourceType}
                                </div>
                              </div>
                              <div class="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                                {entry.story.title}
                              </div>
                              <Show when={storyShowcaseDescription(entry)}>
                                <div class="mt-3 text-sm leading-6 text-zinc-300">
                                  {storyShowcaseDescription(entry)}
                                </div>
                              </Show>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </aside>

          <section class="min-h-[75vh] rounded-[1.5rem] border border-white/8 bg-black/20 p-2 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div class="mb-2 flex items-center justify-between px-3 py-2 text-sm text-zinc-400">
              <div>
                <span class="font-medium text-white">Exact UI</span>
                <Show when={selectedStory()}>
                  {(story) => (
                    <span class="ml-2 text-zinc-500">
                      Selected story: {storyShowcaseTitle(story())}
                    </span>
                  )}
                </Show>
              </div>
              <div>Demo-safe transport stubs active</div>
            </div>
            <iframe
              title="AppWeaver demo app"
              ref={appFrameEl}
              onLoad={() => syncSelectedStoryToFrame(selectedStoryId())}
              src="/demo/app/"
              class="h-[calc(100vh-10rem)] w-full rounded-[1rem] border border-white/8 bg-[#111]"
            />
          </section>
        </main>
      </div>
    </div>
  );
}
