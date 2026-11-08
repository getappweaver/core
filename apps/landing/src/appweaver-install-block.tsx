import { For, Show, createSignal, onCleanup } from 'solid-js';

type Platform = 'unix' | 'windows';

type AppWeaverInstallBlockProps = {
  title: string | null;
};

type CopyableCommandBlockProps = {
  className: string;
  ariaLabel: string;
  lines: string[];
};

const installCommands: Record<Platform, string[]> = {
  unix: ['curl -fsSL https://getappweaver.com/install.sh | sh'],
  windows: ['irm https://getappweaver.com/install.ps1 | iex'],
};

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

export function AppWeaverInstallBlock(props: AppWeaverInstallBlockProps) {
  const isWindowsInitial =
    typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || '');
  const [platform, setPlatform] = createSignal<Platform>(
    isWindowsInitial ? 'windows' : 'unix',
  );

  return (
    <div class="hero-install-block">
      <Show when={props.title}>
        {(title) => <h3 class="hero-install-title">{title()}</h3>}
      </Show>
      <div class="hero-install-header">
        <span class="hero-install-label">Go to your project/workspace folder and run:</span>
        <div class="hero-install-tabs" role="tablist" aria-label="Select operating system">
          <button
            type="button"
            role="tab"
            aria-selected={platform() === 'unix'}
            class="hero-install-tab"
            classList={{ 'is-active': platform() === 'unix' }}
            onClick={() => setPlatform('unix')}
          >
            macOS / Linux
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={platform() === 'windows'}
            class="hero-install-tab"
            classList={{ 'is-active': platform() === 'windows' }}
            onClick={() => setPlatform('windows')}
          >
            Windows
          </button>
        </div>
      </div>
      <CopyableCommandBlock
        className="hero-install-command"
        ariaLabel="Install command"
        lines={installCommands[platform()]}
      />
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
  );
}
