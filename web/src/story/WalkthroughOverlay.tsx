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

type PanelVertical = 'bottom' | 'top';

type PanelHorizontal = 'left' | 'right';

const PANEL_MARGIN_PX = 16;

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

function rectsIntersect(params: { a: TargetRect; b: TargetRect }): boolean {
  return (
    params.a.left < params.b.left + params.b.width &&
    params.a.left + params.a.width > params.b.left &&
    params.a.top < params.b.top + params.b.height &&
    params.a.top + params.a.height > params.b.top
  );
}

function panelRectForPlacement(params: {
  panelEl: HTMLElement;
  vertical: PanelVertical;
  horizontal: PanelHorizontal;
}): TargetRect {
  const panelRect = params.panelEl.getBoundingClientRect();
  const width = panelRect.width;
  const height = panelRect.height;

  const top =
    params.vertical === 'bottom'
      ? window.innerHeight - height - PANEL_MARGIN_PX
      : PANEL_MARGIN_PX;

  const left =
    params.horizontal === 'right'
      ? window.innerWidth - width - PANEL_MARGIN_PX
      : PANEL_MARGIN_PX;

  return { top, left, width, height };
}

function otherPanelVertical(vertical: PanelVertical): PanelVertical {
  return vertical === 'bottom' ? 'top' : 'bottom';
}

export function WalkthroughOverlay(props: WalkthroughOverlayProps) {
  let panelEl: HTMLDivElement | undefined;

  const [rect, setRect] = createSignal<TargetRect>(elementRect(props.targetEl));

  const [panelVertical, setPanelVertical] = createSignal<'bottom' | 'top'>(
    'bottom',
  );

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

  const panelHorizontal = (targetRect: TargetRect): PanelHorizontal => {
    const targetCenterX = targetRect.left + targetRect.width / 2;

    return targetCenterX < window.innerWidth / 2 ? 'right' : 'left';
  };

  const avoidPanelTargetCollision = (targetRect: TargetRect): void => {
    if (!panelEl || props.state.target === null) {
      return;
    }

    const horizontal = panelHorizontal(targetRect);
    const currentVertical = panelVertical();
    const nextVertical = otherPanelVertical(currentVertical);

    const currentPanelRect = panelRectForPlacement({
      panelEl,
      vertical: currentVertical,
      horizontal,
    });

    const nextPanelRect = panelRectForPlacement({
      panelEl,
      vertical: nextVertical,
      horizontal,
    });

    if (
      rectsIntersect({ a: currentPanelRect, b: targetRect }) &&
      !rectsIntersect({ a: nextPanelRect, b: targetRect })
    ) {
      setPanelVertical(nextVertical);
    }
  };

  createEffect(() => {
    const update = () => {
      const currentTargetEl = targetEl();

      const nextRect =
        props.state.target === null
          ? viewportRect()
          : elementRect(currentTargetEl);

      setRect(nextRect);

      setContextRect(
        props.state.target === null
          ? viewportRect()
          : elementRect(contextElementForTarget(currentTargetEl)),
      );

      setFillButtonRect(
        props.state.fillFormValues ? elementRect(fillButtonEl()) : null,
      );

      avoidPanelTargetCollision(nextRect);

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
    const horizontal = panelHorizontal(r);

    return `story-walkthrough__panel story-walkthrough__panel--${panelVertical()}-${horizontal}`;
  };

  const togglePanelVertical = () => {
    setPanelVertical((current) => (current === 'bottom' ? 'top' : 'bottom'));
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
      <div
        ref={(el) => {
          panelEl = el;
        }}
        class={panelClass()}
      >
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
            type="button"
            class="story-walkthrough__quit"
            onClick={togglePanelVertical}
          >
            Move panel {panelVertical() === 'bottom' ? 'top' : 'bottom'}
          </button>
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
