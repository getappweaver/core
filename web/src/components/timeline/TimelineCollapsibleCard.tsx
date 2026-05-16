import type { JSX } from 'solid-js';
import { Show, createEffect, createSignal } from 'solid-js';

import { WebButton } from '../WebButton';

import {
  cardHeadCloseIcon,
  cardHeadSquareIcon,
  cardHeadUnderscoreIcon,
} from './timelineCardHeadIcons';

type TimelineCollapsibleCardProps = {
  class?: string;
  classList?: Record<string, boolean | undefined>;
  ref?: (el: HTMLDivElement) => void;
  /** e.g. command form identity for focus / DOM queries */
  dataFormId?: string;
  /** Appended to `.card-head` when expanded (e.g. `card-head--timeline-sticky`). */
  expandedHeadClass?: string;
  expandedHead: JSX.Element;
  /**
   * Optional JSX after `expandedHead` (e.g. tree toolbar). Omit entirely when the card has
   * nothing to contribute — same idea as a slot, but Solid only has props/`children`, not `<slot>`.
   */
  expandedHeadToolbar?: JSX.Element;
  expandedTrailingMiddle?: JSX.Element;
  onDismiss: () => void;
  dismissAriaLabel?: string;
  children: JSX.Element;
  /**
   * Appended to minimize / dismiss in the expanded header (e.g. `card-head__control`
   * with `card-head--timeline-sticky` so controls sit above the scroll ledge).
   */
  expandedTrailingButtonClass?: string;
  /** Shown left of expand/dismiss when minimized (e.g. mode / command tags). */
  collapsedHeadSummary?: JSX.Element;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onHeadClick?: () => void;
};

/**
 * Timeline result / form card shell: expand/collapse body, shared dismiss.
 * Collapse hides the body in the DOM (display) so shadow-root web UI keeps state.
 */
export function TimelineCollapsibleCard(
  props: TimelineCollapsibleCardProps,
): JSX.Element {
  let bodyEl: HTMLDivElement | undefined;
  const [localCollapsed, setLocalCollapsed] = createSignal(false);
  const dismissLabel = () => props.dismissAriaLabel ?? 'Remove';
  const trailBtn = () => props.expandedTrailingButtonClass ?? '';
  const isControlled = () => props.collapsed !== undefined;
  const collapsed = () => props.collapsed ?? localCollapsed();

  const setCollapsed = (next: boolean) => {
    if (!isControlled()) {
      setLocalCollapsed(next);
    }

    props.onCollapsedChange?.(next);
  };

  const stopChromeClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const onHeadClick: JSX.EventHandler<HTMLDivElement, MouseEvent> = (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('button')) {
      return;
    }

    props.onHeadClick?.();
  };

  createEffect(() => {
    if (collapsed()) {
      return;
    }

    requestAnimationFrame(() => {
      for (const textarea of bodyEl?.querySelectorAll('textarea') ?? []) {
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    });
  });

  return (
    <div
      class={props.class}
      classList={props.classList}
      ref={props.ref}
      data-form-id={props.dataFormId}
    >
      <Show
        when={collapsed()}
        fallback={
          <div
            onClick={onHeadClick}
            classList={{
              'card-head': true,
              ...(props.expandedHeadClass
                ? { [props.expandedHeadClass]: true }
                : {}),
            }}
          >
            {props.expandedHead}
            <div class="card-head-right-cluster" onClick={stopChromeClick}>
              {props.expandedHeadToolbar}
              <span class="card-head-trailing-actions">
                <WebButton
                  type="button"
                  class={`tag tag-button card-head-chrome-btn card-head-minimize ${trailBtn()}`}
                  aria-label="Minimize card"
                  title="Minimize"
                  onClick={(event) => {
                    stopChromeClick(event);
                    setCollapsed(true);
                  }}
                >
                  {cardHeadUnderscoreIcon()}
                </WebButton>
                {props.expandedTrailingMiddle}
                <WebButton
                  type="button"
                  class={`tag tag-button card-head-chrome-btn card-head-dismiss ${trailBtn()}`}
                  aria-label={dismissLabel()}
                  onClick={(event) => {
                    stopChromeClick(event);
                    props.onDismiss();
                  }}
                >
                  {cardHeadCloseIcon()}
                </WebButton>
              </span>
            </div>
          </div>
        }
      >
        <div
          onClick={onHeadClick}
          classList={{
            'card-head': true,
            'card-head--collapsed': true,
            ...(props.expandedHeadClass
              ? { [props.expandedHeadClass]: true }
              : {}),
          }}
        >
          <Show when={props.collapsedHeadSummary}>
            <div class="card-head-collapsed-summary">
              {props.collapsedHeadSummary}
            </div>
          </Show>
          <span class="card-head-trailing-actions">
            <WebButton
              type="button"
              class={`tag tag-button card-head-chrome-btn card-head-expand ${trailBtn()}`}
              aria-label="Expand card"
              title="Expand"
              onClick={(event) => {
                stopChromeClick(event);
                setCollapsed(false);
              }}
            >
              {cardHeadSquareIcon()}
            </WebButton>
            <WebButton
              type="button"
              class={`tag tag-button card-head-chrome-btn card-head-dismiss ${trailBtn()}`}
              aria-label={dismissLabel()}
              onClick={(event) => {
                stopChromeClick(event);
                props.onDismiss();
              }}
            >
              {cardHeadCloseIcon()}
            </WebButton>
          </span>
        </div>
      </Show>

      <div
        ref={(el) => {
          bodyEl = el;
        }}
        class="timeline-card-body"
        classList={{ 'timeline-card-body--collapsed': collapsed() }}
      >
        {props.children}
      </div>
    </div>
  );
}
