import type { JSX } from 'solid-js';
import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  For,
  useContext,
} from 'solid-js';

import type { WebElementNode, WebAction } from '@src/web/ui-schema';

import { registerStoryDomTarget } from '../../story/dom-targets';
import { emitStoryTargetClicked } from '../../story/events';

import { WebShadowUiBusyContext } from '../web-shadow-ui-busy-context';
import { WebButton } from '../WebButton';

import { useWebEntityPending } from './contexts';
import {
  elementClass,
  elementStyle,
  elementPropsClasses,
} from './element-helpers';
import { WebCheckboxControl } from './WebCheckboxControl';

const OVERFLOW_PANEL_GAP_PX = 8;

export function layoutParentElement(el: HTMLElement): HTMLElement | null {
  const p = el.parentNode;

  if (p instanceof ShadowRoot && p.host instanceof HTMLElement) {
    return p.host;
  }

  return el.parentElement;
}

export function getVisibleVerticalBoundsForElement(el: HTMLElement): {
  top: number;
  bottom: number;
} {
  let top = 0;
  let bottom = window.innerHeight;
  let n: HTMLElement | null = el;

  while (n && n !== document.documentElement) {
    const st = window.getComputedStyle(n);
    const oy = st.overflowY;

    if (oy === 'auto' || oy === 'scroll' || oy === 'hidden' || oy === 'clip') {
      const r = n.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }

    n = layoutParentElement(n);
  }

  return { top, bottom };
}

export function getVisibleHorizontalBoundsForElement(el: HTMLElement): {
  left: number;
  right: number;
} {
  let left = 0;
  let right = window.innerWidth;
  let n: HTMLElement | null = el;

  while (n && n !== document.documentElement) {
    const overflowX = window.getComputedStyle(n).overflowX;

    if (
      overflowX === 'auto' ||
      overflowX === 'scroll' ||
      overflowX === 'hidden' ||
      overflowX === 'clip'
    ) {
      const rect = n.getBoundingClientRect();
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
    }

    n = layoutParentElement(n);
  }

  return { left, right };
}

export function listScrollableAncestors(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let n: HTMLElement | null = el;

  while (n && n !== document.documentElement) {
    const st = window.getComputedStyle(n);
    const oy = st.overflowY;

    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
      out.push(n);
    }

    n = layoutParentElement(n);
  }

  return out;
}

export type WebOverflowMenuProps = {
  element: WebElementNode;
  runAction: (action: WebAction | undefined) => void;
  renderChild: (child: import('@src/web/ui-schema').WebNode) => JSX.Element;
};

export function WebOverflowMenuElement(props: WebOverflowMenuProps) {
  const [open, setOpen] = createSignal(false);
  const [flipUp, setFlipUp] = createSignal(false);
  const [flipRight, setFlipRight] = createSignal(false);
  const getBusy = useContext(WebShadowUiBusyContext);
  const entityPending = useWebEntityPending();
  let rootEl: HTMLDivElement | undefined;
  let panelEl: HTMLDivElement | undefined;
  const triggerProps = () => props.element.props;

  const checkboxTrigger = () =>
    typeof triggerProps()?.checked === 'boolean' ||
    triggerProps()?.indeterminate === true;

  createEffect(() => {
    if (!open()) {
      setFlipUp(false);
      setFlipRight(false);

      return;
    }

    const updatePlacement = () => {
      const root = rootEl;
      const panel = panelEl;

      if (!root || !panel) {
        return;
      }

      const trigger = root.querySelector<HTMLElement>('.web-overflow-trigger');

      if (!trigger) {
        return;
      }

      const { top: vTop, bottom: vBottom } =
        getVisibleVerticalBoundsForElement(root);

      const { left: vLeft, right: vRight } =
        getVisibleHorizontalBoundsForElement(root);

      const t = trigger.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const gap = OVERFLOW_PANEL_GAP_PX;
      const spaceBelow = vBottom - t.bottom - gap;
      const spaceAbove = t.top - vTop - gap;
      const needHeight = p.height;

      if (needHeight <= spaceBelow) {
        setFlipUp(false);
      } else if (spaceAbove >= needHeight) {
        setFlipUp(true);
      } else if (spaceAbove > spaceBelow) {
        setFlipUp(true);
      } else {
        setFlipUp(false);
      }

      const spaceLeft = t.right - vLeft - gap;
      const spaceRight = vRight - t.left - gap;
      const needWidth = p.width;

      if (needWidth <= spaceLeft) {
        setFlipRight(false);
      } else if (spaceRight >= needWidth) {
        setFlipRight(true);
      } else {
        setFlipRight(spaceRight > spaceLeft);
      }
    };

    let ro: ResizeObserver | undefined;
    let raf1 = 0;
    let raf2 = 0;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        updatePlacement();

        ro = new ResizeObserver(() => {
          updatePlacement();
        });

        if (panelEl) {
          ro.observe(panelEl);
        }
      });
    });

    const onLayout = () => {
      updatePlacement();
    };

    window.addEventListener('resize', onLayout);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onLayout);
      window.visualViewport.addEventListener('scroll', onLayout);
    }

    const scrollRoots: HTMLElement[] = rootEl
      ? listScrollableAncestors(rootEl)
      : [];

    for (const el of scrollRoots) {
      el.addEventListener('scroll', onLayout, { passive: true });
    }

    onCleanup(() => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro?.disconnect();
      window.removeEventListener('resize', onLayout);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onLayout);
        window.visualViewport.removeEventListener('scroll', onLayout);
      }

      for (const el of scrollRoots) {
        el.removeEventListener('scroll', onLayout);
      }
    });
  });

  const triggerPresentation: WebElementNode = {
    type: 'element',
    tag: 'button',
    props: props.element.props,
  };

  const menuItems = () =>
    (props.element.children ?? []).filter(
      (n): n is WebElementNode => n.type === 'element' && n.tag === 'menuItem',
    );

  return (
    <div
      class="web-overflow-menu"
      data-ui={props.element.props?.ui}
      classList={{
        'is-open': open(),
        'is-link-trigger': props.element.props?.className?.includes(
          'status-value-trigger',
        ),
      }}
      ref={(el) => {
        rootEl = el;
      }}
    >
      <Show when={open()}>
        <div
          class="web-overflow-backdrop"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        />
      </Show>
      <Show
        when={checkboxTrigger()}
        fallback={
          <WebButton
            type="button"
            class={`web-overflow-trigger ${elementClass(triggerPresentation)}`}
            data-ui={props.element.props?.ui ?? 'three-dot-item-button'}
            data-story-target={props.element.props?.storyTargetId}
            ref={(el) =>
              props.element.props?.storyTargetId
                ? registerStoryDomTarget(props.element.props.storyTargetId, el)
                : undefined
            }
            style={elementStyle(props.element)}
            aria-expanded={open()}
            aria-haspopup="true"
            aria-label={props.element.props?.label ?? 'More actions'}
            disabled={getBusy() || entityPending().pending}
            onClick={(e) => {
              e.stopPropagation();

              if (props.element.props?.storyTargetId) {
                emitStoryTargetClicked(props.element.props.storyTargetId);
              }

              setOpen(!open());
            }}
          >
            {props.element.props?.label ?? '\u22EE'}
          </WebButton>
        }
      >
        <WebCheckboxControl
          className={[
            'web-overflow-trigger',
            'web-checkbox',
            ...elementPropsClasses(props.element.props),
          ].join(' ')}
          dataUi={props.element.props?.ui ?? 'overflow-checkbox-trigger'}
          style={elementStyle(props.element)}
          checked={triggerProps()?.checked === true}
          indeterminate={triggerProps()?.indeterminate === true}
          disabled={
            triggerProps()?.disabled === true ||
            getBusy() ||
            entityPending().pending
          }
          onChange={() => setOpen((v) => !v)}
        />
      </Show>
      <Show when={open()}>
        <div
          class="web-overflow-panel"
          classList={{
            'is-flip-up': flipUp(),
            'is-flip-right': flipRight(),
          }}
          role="menu"
          ref={(el) => {
            panelEl = el;
          }}
        >
          <For each={menuItems()}>
            {(mi) => {
              const content = (
                <Show
                  when={(mi.children ?? []).length > 0}
                  fallback={mi.props?.label ?? ''}
                >
                  <For each={mi.children ?? []}>
                    {(child) => props.renderChild(child)}
                  </For>
                </Show>
              );

              return (
                <Show
                  when={mi.props?.href}
                  fallback={
                    <WebButton
                      type="button"
                      role="menuitem"
                      class={`${elementClass(mi)} web-button`}
                      data-story-target={mi.props?.storyTargetId}
                      disabled={
                        mi.props?.disabled === true ||
                        getBusy() === true ||
                        entityPending().pending
                      }
                      ref={(el) =>
                        mi.props?.storyTargetId
                          ? registerStoryDomTarget(mi.props.storyTargetId, el)
                          : undefined
                      }
                      onClick={(e) => {
                        e.stopPropagation();

                        if (mi.props?.storyTargetId) {
                          emitStoryTargetClicked(mi.props.storyTargetId);
                        }

                        setOpen(false);
                        props.runAction(mi.props?.action);
                      }}
                    >
                      {content}
                    </WebButton>
                  }
                >
                  {(href) => (
                    <a
                      role="menuitem"
                      class={`${elementClass(mi)} web-button`}
                      data-story-target={mi.props?.storyTargetId}
                      href={href()}
                      target={mi.props?.external ? '_blank' : undefined}
                      rel={
                        mi.props?.external ? 'noopener noreferrer' : undefined
                      }
                      onClick={(e) => {
                        e.stopPropagation();

                        if (
                          mi.props?.disabled === true ||
                          getBusy() === true ||
                          entityPending().pending
                        ) {
                          e.preventDefault();

                          return;
                        }

                        if (mi.props?.storyTargetId) {
                          emitStoryTargetClicked(mi.props.storyTargetId);
                        }

                        setOpen(false);
                      }}
                    >
                      {content}
                    </a>
                  )}
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
