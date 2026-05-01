import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';

import type { WebAction } from '@src/web/ui-schema';

import type { ComposerAiState } from '../commands/types';
import { buildModelOverrideMenuWebActions } from '../composer/buildModelOverrideMenuWebActions';

type ComposerModelOverrideButtonProps = {
  state: ComposerAiState;
  /** When false, control is disabled (pass `wsConnected()` from parent). */
  wsConnected: boolean;
  onRunWebAction: (action: WebAction) => void;
};

export function ComposerModelOverrideButton(
  props: ComposerModelOverrideButtonProps,
) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const menu = createMemo(() => buildModelOverrideMenuWebActions(props.state));

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
        class="composer-chip composer-chip--model-override"
        disabled={!props.wsConnected}
        aria-expanded={open()}
        aria-haspopup="menu"
        title={
          props.wsConnected
            ? 'Model override: set or clear (same as bot status)'
            : 'Connect WebSocket first'
        }
        onClick={() => setOpen((v) => !v)}
      >
        {props.state.effectiveModel}
      </button>
      <Show when={open()}>
        <div class="web-overflow-panel is-flip-up" role="menu">
          <button
            type="button"
            role="menuitem"
            class="web-button"
            onClick={() => {
              setOpen(false);
              props.onRunWebAction(menu().setOrChange);
            }}
          >
            {menu().setOrChangeLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            class="web-button"
            onClick={() => {
              setOpen(false);
              props.onRunWebAction(menu().clearOverride);
            }}
          >
            Clear override
          </button>
        </div>
      </Show>
    </div>
  );
}
