import { render } from 'solid-js/web';

import './styles.css';

const logoUrl = '/appweaver-logo.svg';

function App() {
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
    'Chat through the web or over Nostr, then use commands provided by the plugins you have installed.',
    'Choose model providers through OpenCode support, with a built-in Cashu wallet for Pay-per-request Routstr usage.',
    'Create bot accounts, build plugins, and publish them without asking permission from a hosted platform.',
  ];

  return (
    <div class="min-h-screen bg-[#0a0d14] text-zinc-100 antialiased">
      <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(78,205,196,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(124,92,255,0.18),_transparent_32%),linear-gradient(180deg,_#0d111a,_#090b11_60%,_#07090d)]" />
      <div class="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-12">
        <header class="flex items-center justify-between border-b border-white/8 pb-5">
          <a
            href="/"
            class="flex items-center gap-3 text-sm font-medium tracking-[0.22em] text-zinc-300 uppercase"
          >
            <img
              src={logoUrl}
              alt="AppWeaver"
              class="h-7 w-7 rounded-sm invert"
            />
            AppWeaver
          </a>
          <nav class="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
            <a href="#plugins" class="transition hover:text-white">
              Plugins
            </a>
            <a href="#ownership" class="transition hover:text-white">
              Ownership
            </a>
            <a href="#deploy" class="transition hover:text-white">
              Deploy
            </a>
          </nav>
        </header>

        <main class="flex-1 py-14 sm:py-20">
          <section class="grid gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-end">
            <div>
              <div class="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-cyan-200">
                AI-first micro app platform
              </div>
              <h1 class="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Installable apps, automation, and bots that live in your own
                environment.
              </h1>
              <p class="mt-6 max-w-3xl text-lg leading-8 text-zinc-300 sm:text-xl">
                AppWeaver is an open-source platform for running plugin-powered
                workflows from a project or workspace folder you control. Use it
                through the web or over Nostr, choose the AI providers you want,
                and compose focused apps into one shared system.
              </p>
              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="https://github.com/getappweaver"
                  class="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-cyan-200"
                >
                  <span class="text-black">Explore the code</span>
                </a>
                <a
                  href="#plugins"
                  class="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/4 px-6 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-white/8"
                >
                  See official plugins
                </a>
              </div>
            </div>

            <div class="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur">
              <div class="rounded-[1.6rem] border border-white/8 bg-[#0d1220] p-5">
                <div class="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-zinc-500">
                  <span>Workspace layer</span>
                  <span>OpenCode powered</span>
                </div>
                <div class="mt-5 rounded-2xl border border-white/8 bg-black/30 p-4 font-mono text-sm text-zinc-300">
                  <div class="text-zinc-500">workspace/</div>
                  <div class="mt-2 pl-4 text-zinc-400">your-project-files</div>
                  <div class="pl-4 text-cyan-300">appweaver/</div>
                  <div class="pl-8 text-zinc-400">src/</div>
                  <div class="pl-8 text-zinc-400">plugins/</div>
                </div>
                <p class="mt-5 text-sm leading-7 text-zinc-300">
                  AppWeaver sits inside your workspace as a shared app layer.
                  Installed plugins add commands, storage, automations, and AI
                  tools around the project you already have.
                </p>
                <div class="mt-6 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-2xl border border-white/8 bg-white/4 p-4">
                    <div class="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Inputs
                    </div>
                    <div class="mt-2 text-sm text-white">
                      Web chat, Nostr chat, plugin commands
                    </div>
                  </div>
                  <div class="rounded-2xl border border-white/8 bg-white/4 p-4">
                    <div class="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Models
                    </div>
                    <div class="mt-2 text-sm text-white">
                      Any provider OpenCode supports
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="mt-18 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {pillars.map((item) => (
              <div class="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5 text-sm leading-7 text-zinc-300">
                {item}
              </div>
            ))}
          </section>

          <section id="plugins" class="mt-24">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div class="text-sm uppercase tracking-[0.24em] text-cyan-200">
                  Official plugins
                </div>
                <h2 class="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                  Start with a small set of focused apps.
                </h2>
              </div>
              <p class="max-w-2xl text-sm leading-7 text-zinc-400 sm:text-right">
                AppWeaver already ships with bookmarks, todos, jobs, and file
                workflows, while browser automation is being added next. Anyone
                can create and publish new plugins on top of the same core.
              </p>
            </div>
            <div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {officialPlugins.map((plugin) => (
                <div class="rounded-[1.6rem] border border-white/8 bg-gradient-to-b from-white/7 to-white/[0.02] p-5">
                  <div class="text-xs uppercase tracking-[0.24em] text-zinc-500">
                    Plugin
                  </div>
                  <div class="mt-3 text-2xl font-semibold text-white">
                    {plugin.name}
                  </div>
                  <p class="mt-3 text-sm leading-7 text-zinc-300">
                    {plugin.summary}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section id="ownership" class="mt-24 grid gap-8 lg:grid-cols-2">
            <div class="rounded-[2rem] border border-white/8 bg-[#111522] p-8">
              <div class="text-sm uppercase tracking-[0.24em] text-violet-200">
                Open and permissionless
              </div>
              <h2 class="mt-4 text-3xl font-semibold text-white">
                Own the stack instead of renting it.
              </h2>
              <p class="mt-4 text-base leading-8 text-zinc-300">
                AppWeaver is fully open-source and self-hostable. You can create
                bot accounts, install plugins, publish your own extensions, and
                run the platform on infrastructure you control without needing
                approval from a central service.
              </p>
            </div>
            <div class="rounded-[2rem] border border-white/8 bg-[#0d1520] p-8">
              <div class="text-sm uppercase tracking-[0.24em] text-cyan-200">
                Provider flexibility
              </div>
              <h2 class="mt-4 text-3xl font-semibold text-white">
                Bring your model setup, or Pay-per-request.
              </h2>
              <p class="mt-4 text-base leading-8 text-zinc-300">
                Under the hood, AppWeaver uses the OpenCode SDK so it can work
                with the model providers OpenCode supports today. It also
                includes a built-in Cashu wallet, which makes Pay-per-request
                usage possible through Routstr-supported models, with more
                provider options on the way.
              </p>
            </div>
          </section>

          <section
            id="deploy"
            class="mt-24 rounded-[2rem] border border-white/8 bg-white/[0.035] p-8 sm:p-10"
          >
            <div class="max-w-3xl">
              <div class="text-sm uppercase tracking-[0.24em] text-zinc-400">
                What comes next
              </div>
              <h2 class="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                A simple open core now, a broader app ecosystem after that.
              </h2>
              <p class="mt-5 text-base leading-8 text-zinc-300">
                The platform is already useful as a personal assistant,
                automation layer, and bot runtime. The next phase is making
                plugin publishing, browser automation, and deployment flows even
                smoother while keeping the core open and self-hostable.
              </p>
              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="https://github.com/getappweaver"
                  class="inline-flex items-center justify-center rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-black transition hover:bg-cyan-200"
                >
                  Follow development
                </a>
                <a
                  href="mailto:hello@getappweaver.com"
                  class="inline-flex items-center justify-center rounded-full border border-white/14 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:border-white/24 hover:bg-white/6"
                >
                  Contact AppWeaver
                </a>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

render(() => <App />, document.getElementById('root')!);
