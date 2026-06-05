import { createEffect, createSignal, For, onCleanup, onMount } from 'solid-js';

const SQUARES = 6;
// full bounce cycle: 0→5→0 = 10 steps, period in ms
const PERIOD_MS = 1400;

const UNLIT_OPACITY = 0.18;

function squareOpacity(pos: number, idx: number): number {
  const dist = Math.abs(pos - idx);

  if (dist === 0) {
    return 1;
  }

  if (dist <= 1) {
    return Math.max(UNLIT_OPACITY, 0.38 - 0.1 * (dist - 1));
  }

  return UNLIT_OPACITY;
}

type ComposerWorkingButtonProps = {
  working: boolean;
  onStop: () => void;
};

export function ComposerWorkingButton(props: ComposerWorkingButtonProps) {
  const [open, setOpen] = createSignal(false);
  // animated position 0..SQUARES-1 (fractional for smooth sweep)
  const [pos, setPos] = createSignal(0);
  let root: HTMLDivElement | undefined;
  let rafId: number | null = null;
  let startTime: number | null = null;

  function tick(now: number): void {
    if (startTime === null) {
      startTime = now;
    }

    const elapsed = now - startTime;
    // triangle wave over PERIOD_MS: 0→1→0
    const t = (elapsed % PERIOD_MS) / PERIOD_MS;
    const triangle = t < 0.5 ? t * 2 : 2 - t * 2;
    setPos(triangle * (SQUARES - 1));
    rafId = requestAnimationFrame(tick);
  }

  createEffect(() => {
    if (props.working) {
      startTime = null;
      rafId = requestAnimationFrame(tick);
    } else {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      startTime = null;
      setPos(0);
    }
  });

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
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('keydown', onDocKeyDown, true);
    });
  });

  return (
    <div
      class="composer-working-btn-wrap"
      classList={{ 'is-working': props.working }}
      ref={root}
    >
      <button
        type="button"
        class="composer-working-bar"
        aria-label="AI working — click to stop"
        aria-expanded={open()}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="composer-working-squares" aria-hidden="true">
          <For each={Array.from({ length: SQUARES }, (_, i) => i)}>
            {(i) => (
              <span
                class="composer-working-sq"
                style={{ opacity: String(squareOpacity(pos(), i)) }}
              />
            )}
          </For>
        </span>
      </button>
      {open() && (
        <div class="web-overflow-panel is-flip-up" role="menu">
          <button
            type="button"
            role="menuitem"
            class="web-button"
            onClick={() => {
              setOpen(false);
              props.onStop();
            }}
          >
            Stop AI
          </button>
        </div>
      )}
    </div>
  );
}
