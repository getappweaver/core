import type { Accessor, JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';

import { WebButton } from '../components/WebButton';

type HeaderChromeWidget = {
  command: string;
  subcommand: string;
  source: 'builtin' | 'plugin';
  pluginAlias?: string;
  surface: 'modal' | 'timeline_singleton';
  label: string;
  modalTitle: string;
  icon?: string;
  order?: number;
};

type HeaderChromeProps = {
  widgets: Accessor<HeaderChromeWidget[]>;
  rightWidgets: Accessor<HeaderChromeWidget[]>;
  isWidgetActive: (widget: HeaderChromeWidget) => boolean;
  wsConnected: Accessor<boolean>;
  isConnected: Accessor<boolean>;
  isDisconnected: Accessor<boolean>;
  connectLabel: Accessor<string>;
  manageTitle: Accessor<string>;
  pushBusy: Accessor<boolean>;
  piperTtsBusy?: Accessor<boolean>;
  piperTtsEnabled?: Accessor<boolean>;
  hasCoreUpdate: Accessor<boolean>;
  onOpenWidget: (widget: HeaderChromeWidget) => void;
  onWidgetElement?: (
    widget: HeaderChromeWidget,
    el: HTMLElement | null,
  ) => void;
  onConnect: () => void;
  onLogout: () => void;
  onEnablePush: () => void;
  onEnablePiperTts?: () => void;
  onOpenNostrSearchRelays: () => void;
  onOpenLayoutSettings?: () => void;
  onRestartBot: () => void;
  onAnyMenuOpenChange?: (open: boolean) => void;
};

function resolveWidgetIconUrl(widget: {
  source: 'builtin' | 'plugin';
  pluginAlias?: string;
  icon?: string;
}): string | null {
  const raw = widget.icon?.trim();

  if (!raw) {
    return null;
  }

  const lower = raw.toLowerCase();

  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:')
  ) {
    return raw;
  }

  const flatten = (value: string): string => value.replace(/[\\/]/g, '__');
  const asset = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

  if (widget.source === 'plugin') {
    const alias = widget.pluginAlias?.trim();

    if (!alias) {
      return null;
    }

    if (raw.startsWith('/plugins/')) {
      const rel = raw.slice('/plugins/'.length);
      const slashIdx = rel.indexOf('/');

      if (slashIdx <= 0) {
        return asset(`plugin-icons/${alias}/${flatten(rel)}`);
      }

      const relAlias = rel.slice(0, slashIdx);
      const relIcon = rel.slice(slashIdx + 1);

      if (relAlias.length === 0) {
        return null;
      }

      return asset(`plugin-icons/${relAlias}/${flatten(relIcon)}`);
    }

    const rel = raw.startsWith('/') ? raw.slice(1) : raw;

    return asset(`plugin-icons/${alias}/${flatten(rel)}`);
  }

  if (!raw.startsWith('/')) {
    return null;
  }

  return asset(`builtin-icons/${flatten(raw.slice(1))}`);
}

function IconGlyph(props: {
  icon?: string;
  source?: 'builtin' | 'plugin';
  pluginAlias?: string;
  fallback: 'widget' | 'account';
}): JSX.Element {
  const resolvedIcon = () =>
    resolveWidgetIconUrl({
      source: props.source ?? 'builtin',
      pluginAlias: props.pluginAlias,
      icon: props.icon,
    });

  if (props.fallback === 'account') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" class="topbar-menu-icon">
        <path
          d="M12 13c2.76 0 5-2.24 5-5S14.76 3 12 3 7 5.24 7 8s2.24 5 5 5Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (resolvedIcon()) {
    return (
      <img
        src={resolvedIcon()!}
        alt=""
        aria-hidden="true"
        class="topbar-menu-icon topbar-menu-icon--image"
      />
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" class="topbar-menu-icon">
      <path
        d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"
        fill="currentColor"
      />
    </svg>
  );
}

function LayoutIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" class="topbar-menu-icon">
      <path d="M4 5h6v14H4zm9 0h7v6h-7zm0 9h7v5h-7z" fill="currentColor" />
    </svg>
  );
}

export function HeaderChrome(props: HeaderChromeProps): JSX.Element {
  let accountButtonEl: HTMLButtonElement | undefined;
  let accountMenuPanelEl: HTMLDivElement | undefined;

  const [accountMenuOpen, setAccountMenuOpen] = createSignal(false);
  const [accountNostrOpen, setAccountNostrOpen] = createSignal(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = createSignal(false);

  const sortedWidgets = createMemo(() => {
    return [...props.widgets()].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return a.label.localeCompare(b.label);
    });
  });

  const anyMenuOpen = createMemo(
    () => accountMenuOpen() || accountNostrOpen() || accountSettingsOpen(),
  );

  createEffect(() => {
    props.onAnyMenuOpenChange?.(anyMenuOpen());
  });

  function closeAccountMenus(): void {
    setAccountNostrOpen(false);
    setAccountSettingsOpen(false);
    setAccountMenuOpen(false);
  }

  function closeAllMenus(): void {
    closeAccountMenus();
  }

  function openWidget(widget: HeaderChromeWidget): void {
    closeAllMenus();
    props.onOpenWidget(widget);
  }

  function widgetKey(widget: HeaderChromeWidget): string {
    return `${widget.command}:${widget.subcommand}`;
  }

  onMount(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (accountMenuOpen() || accountNostrOpen() || accountSettingsOpen()) {
        const insideExpandedAccount =
          accountMenuPanelEl?.contains(target) === true;

        const insideAccountButton = accountButtonEl?.contains(target) === true;

        if (!insideExpandedAccount && !insideAccountButton) {
          closeAccountMenus();
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (accountSettingsOpen()) {
        setAccountSettingsOpen(false);

        return;
      }

      if (accountNostrOpen()) {
        setAccountNostrOpen(false);

        return;
      }

      if (accountMenuOpen()) {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    onCleanup(() => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    });
  });

  return (
    <header class="topbar compact">
      <h1>
        <a
          class="topbar-logo-link"
          href="https://getappweaver.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open AppWeaver website"
        >
          <img
            class="topbar-logo"
            src={`${import.meta.env.BASE_URL}appweaver-logo.svg`}
            alt="AppWeaver"
          />
        </a>
      </h1>
      <div class="topbar-actions">
        <For each={sortedWidgets()}>
          {(widget) => (
            <WebButton
              type="button"
              class="connect-btn topbar-menu-btn topbar-icon-btn"
              data-story-target={`header-widget:${widgetKey(widget)}`}
              ref={(el) => props.onWidgetElement?.(widget, el)}
              classList={{
                'topbar-widget-active': props.isWidgetActive(widget),
                'topbar-widget-update-available':
                  widget.command === 'bot' &&
                  widget.subcommand === 'status' &&
                  props.hasCoreUpdate(),
              }}
              disabled={!props.wsConnected()}
              onClick={() => openWidget(widget)}
              title={
                props.wsConnected()
                  ? `${widget.label} (/${widget.command} ${widget.subcommand})`
                  : 'Connect Nostr first — waiting for WebSocket'
              }
              aria-label={widget.label}
            >
              <IconGlyph
                icon={widget.icon}
                source={widget.source}
                pluginAlias={widget.pluginAlias}
                fallback="widget"
              />
            </WebButton>
          )}
        </For>
        <Show when={props.onOpenLayoutSettings}>
          {(onOpenLayoutSettings) => (
            <WebButton
              type="button"
              class="connect-btn topbar-menu-btn topbar-icon-btn"
              onClick={() => onOpenLayoutSettings()()}
              title="Open desktop layout settings"
              aria-label="Open desktop layout settings"
            >
              <LayoutIcon />
            </WebButton>
          )}
        </Show>
        <For each={props.rightWidgets()}>
          {(widget) => (
            <WebButton
              type="button"
              class="connect-btn topbar-menu-btn topbar-icon-btn topbar-widget-right"
              data-story-target={`header-widget:${widgetKey(widget)}`}
              ref={(el) => props.onWidgetElement?.(widget, el)}
              classList={{
                'topbar-widget-active': props.isWidgetActive(widget),
              }}
              disabled={!props.wsConnected()}
              onClick={() => openWidget(widget)}
              title={
                props.wsConnected()
                  ? `${widget.label} (/${widget.command} ${widget.subcommand})`
                  : 'Connect Nostr first — waiting for WebSocket'
              }
              aria-label={widget.label}
            >
              <IconGlyph
                icon={widget.icon}
                source={widget.source}
                pluginAlias={widget.pluginAlias}
                fallback="widget"
              />
            </WebButton>
          )}
        </For>
        <WebButton
          type="button"
          class="connect-btn topbar-menu-btn topbar-icon-btn"
          ref={(el) => {
            accountButtonEl = el;
          }}
          aria-label="Open account menu"
          aria-expanded={accountMenuOpen()}
          aria-haspopup="menu"
          onClick={() => {
            setAccountMenuOpen((open) => {
              if (!open) {
                setAccountNostrOpen(false);
                setAccountSettingsOpen(false);
              }

              return !open;
            });
          }}
        >
          <IconGlyph fallback="account" />
        </WebButton>
      </div>
      <Show when={accountMenuOpen()}>
        <div
          class="topbar-menu-panel topbar-account-panel panel"
          ref={(el) => {
            accountMenuPanelEl = el;
          }}
        >
          <WebButton
            type="button"
            class="connect-btn"
            onClick={() => {
              closeAllMenus();
              props.onConnect();
            }}
            title={props.manageTitle()}
          >
            {props.connectLabel()}
          </WebButton>
          <Show when={!props.isDisconnected()}>
            <WebButton
              type="button"
              class="connect-btn"
              onClick={() => {
                closeAllMenus();
                props.onLogout();
              }}
              title="Clear all Nostr signer data stored in this browser"
            >
              Log out
            </WebButton>
          </Show>
          <WebButton
            type="button"
            class="connect-btn topbar-submenu-toggle"
            aria-expanded={accountNostrOpen()}
            onClick={() => {
              setAccountSettingsOpen(false);
              setAccountNostrOpen((open) => !open);
            }}
          >
            Nostr
            <span class="topbar-submenu-chevron" aria-hidden="true">
              {accountNostrOpen() ? '▾' : '▸'}
            </span>
          </WebButton>
          <Show when={accountNostrOpen()}>
            <div class="topbar-submenu-section topbar-submenu-section--nested">
              <WebButton
                type="button"
                class="connect-btn"
                disabled={!props.isConnected()}
                onClick={() => {
                  closeAllMenus();
                  props.onOpenNostrSearchRelays();
                }}
              >
                Search relays
              </WebButton>
            </div>
          </Show>
          <WebButton
            type="button"
            class="connect-btn topbar-submenu-toggle"
            aria-expanded={accountSettingsOpen()}
            onClick={() => {
              setAccountNostrOpen(false);
              setAccountSettingsOpen((open) => !open);
            }}
          >
            Settings
            <span class="topbar-submenu-chevron" aria-hidden="true">
              {accountSettingsOpen() ? '▾' : '▸'}
            </span>
          </WebButton>
          <Show when={accountSettingsOpen()}>
            <div class="topbar-submenu-section topbar-submenu-section--nested">
              <Show when={props.onEnablePiperTts != null}>
                <WebButton
                  type="button"
                  class="connect-btn"
                  disabled={props.piperTtsBusy?.() ?? false}
                  onClick={() => {
                    closeAllMenus();
                    props.onEnablePiperTts?.();
                  }}
                  title="Enable Piper TTS for local speech playback"
                >
                  {props.piperTtsBusy?.()
                    ? 'Piper TTS …'
                    : props.piperTtsEnabled?.()
                      ? 'Piper TTS ✓'
                      : 'Piper TTS'}
                </WebButton>
              </Show>
              <WebButton
                type="button"
                class="connect-btn"
                disabled={
                  !props.isConnected() ||
                  !props.wsConnected() ||
                  props.pushBusy()
                }
                onClick={() => {
                  closeAllMenus();
                  props.onEnablePush();
                }}
                title="Enable browser notifications when the bot receives a DM (tap after connecting Nostr and WebSocket)"
              >
                {props.pushBusy() ? '…' : 'Push'}
              </WebButton>
            </div>
          </Show>
          <WebButton
            type="button"
            class="connect-btn"
            disabled={!props.wsConnected()}
            onClick={() => {
              closeAllMenus();
              props.onRestartBot();
            }}
            title="Run /bot restart"
          >
            Restart
          </WebButton>
        </div>
      </Show>
    </header>
  );
}
