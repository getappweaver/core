import { createSignal, onCleanup, onMount, Show } from 'solid-js';

type ComposerContextMenuButtonProps = {
  backend: string;
  label: string;
  wsConnected: boolean;
  compacting: boolean;
  onCompact: () => void;
  onCreateNewSession: () => void;
};

export function ComposerContextMenuButton(
  props: ComposerContextMenuButtonProps,
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

  const showCompact = () => props.backend === 'opencode';

  const buttonLabel = () =>
    props.compacting ? `Compacting… ${props.label}` : props.label;

  return (
    <div
      class="composer-meta-dropdown composer-meta-dropdown--context"
      ref={root}
    >
      <button
        type="button"
        class="composer-meta-text composer-meta-text--muted composer-meta-text--context"
        classList={{ 'is-compacting': props.compacting }}
        disabled={!props.wsConnected}
        aria-expanded={open()}
        aria-haspopup="menu"
        title={
          props.wsConnected
            ? 'Session context actions'
            : 'Connect WebSocket first'
        }
        onClick={() => setOpen((v) => !v)}
      >
        {buttonLabel()}
      </button>
      <Show when={open()}>
        <div class="web-overflow-panel is-flip-up" role="menu">
          <Show when={showCompact()}>
            <button
              type="button"
              role="menuitem"
              class="web-button"
              disabled={props.compacting}
              onClick={() => {
                if (props.compacting) {
                  return;
                }

                setOpen(false);
                props.onCompact();
              }}
            >
              {props.compacting ? 'Compacting…' : 'Compact'}
            </button>
          </Show>
          <button
            type="button"
            role="menuitem"
            class="web-button"
            onClick={() => {
              setOpen(false);
              props.onCreateNewSession();
            }}
          >
            Create new session
          </button>
        </div>
      </Show>
    </div>
  );
}
