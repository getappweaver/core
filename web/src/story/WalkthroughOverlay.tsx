import { createEffect, createSignal, onCleanup } from 'solid-js';

import { getStoryDomTarget } from './dom-targets';
import { emitStoryFillForm, emitStoryTargetClicked } from './events';
import type { StoryWalkthroughState } from './types';
import { STORY_FILL_FORM_TARGET_ID } from './types';

type WalkthroughOverlayProps = {
  state: StoryWalkthroughState;
  targetEl: HTMLElement | null;
  onQuit: () => void;
  onStartStory: (storyId: string) => void;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function viewportRect(): TargetRect {
  return {
    top: 0,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function elementRect(el: HTMLElement | null): TargetRect {
  if (!el) {
    return viewportRect();
  }

  const rect = el.getBoundingClientRect();
  const pad = 8;

  return {
    top: Math.max(0, rect.top - pad),
    left: Math.max(0, rect.left - pad),
    width: Math.min(window.innerWidth, rect.width + pad * 2),
    height: Math.min(window.innerHeight, rect.height + pad * 2),
  };
}

function contextElementForTarget(el: HTMLElement | null): HTMLElement | null {
  if (!el) {
    return null;
  }

  const root = el.getRootNode();

  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    return root.host.closest('.card') ?? root.host.parentElement ?? root.host;
  }

  return el.closest('.card') ?? el;
}

function rectAround(outer: TargetRect, inner: TargetRect) {
  return {
    top: {
      top: `${outer.top}px`,
      left: `${outer.left}px`,
      width: `${outer.width}px`,
      height: `${Math.max(0, inner.top - outer.top)}px`,
    },
    bottom: {
      top: `${inner.top + inner.height}px`,
      left: `${outer.left}px`,
      width: `${outer.width}px`,
      height: `${Math.max(0, outer.top + outer.height - inner.top - inner.height)}px`,
    },
    left: {
      top: `${inner.top}px`,
      left: `${outer.left}px`,
      width: `${Math.max(0, inner.left - outer.left)}px`,
      height: `${inner.height}px`,
    },
    right: {
      top: `${inner.top}px`,
      left: `${inner.left + inner.width}px`,
      width: `${Math.max(0, outer.left + outer.width - inner.left - inner.width)}px`,
      height: `${inner.height}px`,
    },
  };
}

export function WalkthroughOverlay(props: WalkthroughOverlayProps) {
  const [rect, setRect] = createSignal<TargetRect>(elementRect(props.targetEl));

  const [contextRect, setContextRect] =
    createSignal<TargetRect>(viewportRect());

  const [fillButtonEl, setFillButtonEl] =
    createSignal<HTMLButtonElement | null>(null);

  const [quitButtonEl, setQuitButtonEl] =
    createSignal<HTMLButtonElement | null>(null);

  const [fillButtonRect, setFillButtonRect] = createSignal<TargetRect | null>(
    null,
  );

  const targetEl = () => {
    const target = props.state.target;

    if (target?.type === 'web_node') {
      return getStoryDomTarget(target.targetId) ?? props.targetEl;
    }

    return props.targetEl;
  };

  createEffect(() => {
    const update = () => {
      const currentTargetEl = targetEl();

      setRect(
        props.state.target === null
          ? viewportRect()
          : elementRect(currentTargetEl),
      );

      setContextRect(
        props.state.target === null
          ? viewportRect()
          : elementRect(contextElementForTarget(currentTargetEl)),
      );

      setFillButtonRect(
        props.state.fillFormValues ? elementRect(fillButtonEl()) : null,
      );

      raf = requestAnimationFrame(update);
    };

    let raf = requestAnimationFrame(update);

    const onLayout = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
    });
  });

  createEffect(() => {
    if (!props.state.fillFormValues) {
      return;
    }

    requestAnimationFrame(() => fillButtonEl()?.focus());
  });

  createEffect(() => {
    if (!props.state.complete) {
      return;
    }

    requestAnimationFrame(() => quitButtonEl()?.focus());
  });

  const targetStyle = () => {
    const r = rect();

    return {
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    };
  };

  const blockerStyles = () => {
    const viewport = viewportRect();

    return rectAround(viewport, contextRect());
  };

  const contextBlockerStyles = () => {
    const r = rect();
    const c = contextRect();

    return rectAround(c, r);
  };

  const panelClass = () => {
    const r = rect();
    const viewport = viewportRect();
    const targetCenterX = r.left + r.width / 2;
    const targetCenterY = r.top + r.height / 2;
    const vertical = targetCenterY < viewport.height / 2 ? 'bottom' : 'top';
    const horizontal = targetCenterX < viewport.width / 2 ? 'right' : 'left';

    return `story-walkthrough__panel story-walkthrough__panel--${vertical}-${horizontal}`;
  };

  return (
    <div class="story-walkthrough" aria-live="polite">
      <div class="story-walkthrough__blocker" style={blockerStyles().top} />
      <div class="story-walkthrough__blocker" style={blockerStyles().bottom} />
      <div class="story-walkthrough__blocker" style={blockerStyles().left} />
      <div class="story-walkthrough__blocker" style={blockerStyles().right} />
      {props.state.target === null ? null : (
        <>
          <div
            class="story-walkthrough__blocker story-walkthrough__blocker--context"
            style={contextBlockerStyles().top}
          />
          <div
            class="story-walkthrough__blocker story-walkthrough__blocker--context"
            style={contextBlockerStyles().bottom}
          />
          <div
            class="story-walkthrough__blocker story-walkthrough__blocker--context"
            style={contextBlockerStyles().left}
          />
          <div
            class="story-walkthrough__blocker story-walkthrough__blocker--context"
            style={contextBlockerStyles().right}
          />
        </>
      )}
      {props.state.target === null ? null : (
        <div class="story-walkthrough__hole" style={targetStyle()} />
      )}
      {fillButtonRect() ? (
        <div
          class="story-walkthrough__hole story-walkthrough__hole--panel"
          style={{
            top: `${fillButtonRect()!.top}px`,
            left: `${fillButtonRect()!.left}px`,
            width: `${fillButtonRect()!.width}px`,
            height: `${fillButtonRect()!.height}px`,
          }}
        />
      ) : null}
      <div class={panelClass()}>
        <div class="story-walkthrough__eyebrow">
          {props.state.complete ? 'Story complete' : 'Story mode'}
        </div>
        <div class="story-walkthrough__instruction">
          {props.state.instruction}
        </div>
        <div class="story-walkthrough__actions">
          {props.state.fillFormValues ? (
            <button
              ref={setFillButtonEl}
              type="button"
              class="story-walkthrough__quit story-walkthrough__fill"
              onClick={() => {
                emitStoryFillForm(props.state.fillFormValues!);
                emitStoryTargetClicked(STORY_FILL_FORM_TARGET_ID);
              }}
            >
              Fill
            </button>
          ) : null}
          {props.state.complete && props.state.nextStoryId ? (
            <button
              type="button"
              class="story-walkthrough__quit"
              onClick={() => props.onStartStory(props.state.nextStoryId!)}
            >
              Continue
            </button>
          ) : null}
          <button
            ref={setQuitButtonEl}
            type="button"
            classList={{
              'story-walkthrough__quit': true,
              'story-walkthrough__quit--focused': props.state.complete === true,
            }}
            onClick={props.onQuit}
          >
            Quit story
          </button>
        </div>
      </div>
    </div>
  );
}
