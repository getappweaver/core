import { createSignal, onCleanup, onMount, Show } from 'solid-js';

import type { WebAction } from '@src/web/ui-schema';

import type { RunWebActionParams } from '../commands/types';

type ComposerProviderMenuButtonProps = {
  provider: string;
  wsConnected: boolean;
  onRunWebAction: (action: WebAction, params?: RunWebActionParams) => void;
};

const PROVIDERS = ['local', 'routstr'] as const;

function providerAction(provider: (typeof PROVIDERS)[number]): WebAction {
  return {
    type: 'command',
    command: 'ai',
    subcommand: 'provider',
    arguments: { name: provider },
    options: {},
    recordInTimeline: false,
  };
}

function routstrStatusAction(): WebAction {
  return {
    type: 'command',
    command: 'routstr',
    subcommand: 'status',
    arguments: {},
    options: {},
    surface: 'modal',
    modalTitle: 'Routstr Status',
    recordInTimeline: false,
  };
}

export function ComposerProviderMenuButton(
  props: ComposerProviderMenuButtonProps,
) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  onMount(() => {
    function onDocPointerDown(event: PointerEvent): void {
      if (!open()) {
        return;
      }

      const t = event.target;

      if (root && t instanceof Node && !root.contains(t)) {
        setOpen(false);
      }
    }

    function onDocKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && open()) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);

    onCleanup(() => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('keydown', onDocKeyDown, true);
    });
  });

  return (
    <div class="composer-meta-dropdown" ref={root}>
      <button
        type="button"
        class="composer-meta-text composer-meta-text--muted composer-meta-text--link"
        disabled={!props.wsConnected}
        aria-expanded={open()}
        aria-haspopup="menu"
        title={
          props.wsConnected ? 'Switch AI provider' : 'Connect WebSocket first'
        }
        onClick={() => setOpen((v) => !v)}
      >
        {props.provider}
      </button>
      <Show when={open()}>
        <div class="web-overflow-panel is-flip-up" role="menu">
          {PROVIDERS.map((provider) => (
            <button
              type="button"
              role="menuitem"
              class="web-button"
              disabled={props.provider === provider}
              onClick={() => {
                setOpen(false);

                props.onRunWebAction(providerAction(provider), {
                  uiExecutionPolicy: {
                    recordInTimeline: false,
                    suppressSystemMessage: true,
                  },
                });
              }}
            >
              {provider}
            </button>
          ))}
          <Show when={props.provider === 'routstr'}>
            <button
              type="button"
              role="menuitem"
              class="web-button"
              onClick={() => {
                setOpen(false);
                props.onRunWebAction(routstrStatusAction());
              }}
            >
              Routstr status
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
