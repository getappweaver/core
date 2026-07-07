import type { Accessor, JSX } from 'solid-js';
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';

import { registerStoryDomTarget } from '../../story/dom-targets';
import { emitStoryTargetClicked } from '../../story/events';

import { WebButton } from '../WebButton';
import type { WebTreeToolbarRegistration } from '../WebNodeRenderer';

import {
  cardHeadAddIcon,
  cardHeadChecklistIcon,
  cardHeadCopyIcon,
  cardHeadDiffIcon,
  cardHeadEditIcon,
  cardHeadLogIcon,
  cardHeadOpenTimelineIcon,
  cardHeadSaveIcon,
  cardHeadSettingsIcon,
  cardHeadTreeCollapseAllIcon,
  cardHeadTreeExpandAllIcon,
  cardHeadTreeFilterIcon,
  cardHeadTreeRefreshIcon,
} from './timelineCardHeadIcons';

type TimelineWebTreeToolbarProps = {
  toolbar: Accessor<WebTreeToolbarRegistration | null>;
  /**
   * While the shadow `.web-tree-header` link row is visible in the timeline, hide these icons
   * so only the text links show; show icons once that row has scrolled away under the sticky head.
   */
  treeHeaderInView: Accessor<boolean>;
  onScrollToTop: () => void;
  /** Appended to each icon button (e.g. `card-head__control` for sticky head). */
  buttonClass?: string;
};

type TimelineToolbarAction = NonNullable<
  WebTreeToolbarRegistration['actions']
>[number];

export function TimelineWebTreeToolbar(
  props: TimelineWebTreeToolbarProps,
): JSX.Element {
  const [filterOpen, setFilterOpen] = createSignal(false);

  const [copiedActionLabel, setCopiedActionLabel] = createSignal<string | null>(
    null,
  );

  const [activeToggleKeys, setActiveToggleKeys] = createSignal<Set<string>>(
    new Set(),
  );

  let filterInputEl: HTMLInputElement | undefined;
  let copiedTimer: number | undefined;

  const btnClass = () =>
    [
      'tag',
      'tag-button',
      'card-head-chrome-btn',
      'card-head-tree-toolbar-btn',
      props.buttonClass ?? '',
    ]
      .filter(Boolean)
      .join(' ');

  const iconToolbarReg = createMemo(() => {
    const reg = props.toolbar();

    if (reg == null) {
      return null;
    }

    return reg;
  });

  onCleanup(() => {
    if (copiedTimer !== undefined) {
      window.clearTimeout(copiedTimer);
    }
  });

  const actionKey = (item: TimelineToolbarAction) =>
    item.toggleKey ?? item.label;

  const actionIsActive = (item: TimelineToolbarAction) =>
    activeToggleKeys().has(actionKey(item));

  const actionLabel = (item: TimelineToolbarAction) =>
    actionIsActive(item) ? (item.activeLabel ?? item.label) : item.label;

  const actionIcon = (item: TimelineToolbarAction) =>
    actionIsActive(item) ? (item.activeIcon ?? item.icon) : item.icon;

  const renderActionIcon = (
    icon: TimelineToolbarAction['icon'],
    label: string,
  ) =>
    icon === 'add'
      ? cardHeadAddIcon()
      : icon === 'checklist'
        ? cardHeadChecklistIcon()
        : icon === 'copy'
          ? cardHeadCopyIcon()
          : icon === 'diff'
            ? cardHeadDiffIcon()
            : icon === 'edit'
              ? cardHeadEditIcon()
              : icon === 'log'
                ? cardHeadLogIcon()
                : icon === 'openTimeline'
                  ? cardHeadOpenTimelineIcon()
                  : icon === 'save'
                    ? cardHeadSaveIcon()
                    : icon === 'settings'
                      ? cardHeadSettingsIcon()
                      : label;

  /*
   * `when` must be a boolean or data value — never pass `when={() => ...}` here:
   * Solid's Show treats `props.when` as-is; a function is always truthy.
   */
  return (
    <Show when={iconToolbarReg()} keyed>
      {(reg) => (
        <div class="card-head-tree-toolbar" role="toolbar" aria-label="Tree">
          <Show when={reg.showFilter}>
            <div
              class="card-head-tree-filter"
              classList={{
                'is-open': filterOpen() || reg.filterValue().trim().length > 0,
              }}
            >
              <WebButton
                type="button"
                class={btnClass()}
                data-ui="tree-filter-toggle"
                title="Filter"
                aria-label="Filter tree"
                onClick={() => {
                  setFilterOpen((open) => !open);
                  queueMicrotask(() => filterInputEl?.focus());
                }}
              >
                {cardHeadTreeFilterIcon()}
              </WebButton>
              <Show when={filterOpen() || reg.filterValue().trim().length > 0}>
                <input
                  ref={(el) => {
                    filterInputEl = el;
                  }}
                  class="card-head-tree-filter-input"
                  type="search"
                  value={reg.filterValue()}
                  placeholder={reg.filterPlaceholder}
                  onInput={(event) => {
                    reg.setFilterValue(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      reg.setFilterValue('');
                      setFilterOpen(false);
                    }
                  }}
                />
              </Show>
            </div>
          </Show>
          <For each={reg.actions ?? []}>
            {(item) => (
              <WebButton
                type="button"
                class={`${btnClass()}${item.className ? ` ${item.className}` : ''}${actionIcon(item) === 'copy' ? ' chat-copy-btn' : ''}${copiedActionLabel() === item.label ? ' chat-copy-btn--show-text' : ''}`}
                data-ui={`toolbar-${actionIcon(item) ?? 'action'}`}
                data-story-target={item.storyTargetId}
                ref={(el) => {
                  if (item.storyTargetId) {
                    registerStoryDomTarget(item.storyTargetId, el);
                  }
                }}
                title={
                  copiedActionLabel() === item.label
                    ? 'Copied'
                    : actionLabel(item)
                }
                aria-label={
                  copiedActionLabel() === item.label
                    ? 'Copied'
                    : actionLabel(item)
                }
                aria-pressed={
                  item.activeIcon != null || item.activeLabel != null
                    ? actionIsActive(item)
                    : undefined
                }
                onClick={() => {
                  if (item.storyTargetId) {
                    emitStoryTargetClicked(item.storyTargetId);
                  }

                  const runActiveAction = actionIsActive(item);

                  if (item.activeIcon != null || item.activeLabel != null) {
                    const key = actionKey(item);

                    setActiveToggleKeys((prev) => {
                      const next = new Set(prev);

                      if (next.has(key)) {
                        next.delete(key);
                      } else {
                        next.add(key);
                      }

                      return next;
                    });
                  }

                  reg.runAction(
                    runActiveAction
                      ? (item.activeAction ?? item.action)
                      : item.action,
                  );

                  if (item.icon === 'copy') {
                    setCopiedActionLabel(item.label);

                    if (copiedTimer !== undefined) {
                      window.clearTimeout(copiedTimer);
                    }

                    copiedTimer = window.setTimeout(() => {
                      setCopiedActionLabel(null);
                      copiedTimer = undefined;
                    }, 1200);
                  }
                }}
              >
                {renderActionIcon(actionIcon(item), actionLabel(item))}
                {copiedActionLabel() === item.label && <span>copied</span>}
              </WebButton>
            )}
          </For>
          <Show when={reg.showTreeControls}>
            <WebButton
              type="button"
              class={btnClass()}
              data-ui="tree-collapse-all"
              title="Collapse all"
              aria-label="Collapse all tree branches"
              onClick={() => {
                reg.collapseAll();
                props.onScrollToTop();
              }}
            >
              {cardHeadTreeCollapseAllIcon()}
            </WebButton>
            <WebButton
              type="button"
              class={btnClass()}
              data-ui="tree-expand-all"
              title="Expand all"
              aria-label="Expand all tree branches"
              onClick={() => {
                reg.expandAll();
                props.onScrollToTop();
              }}
            >
              {cardHeadTreeExpandAllIcon()}
            </WebButton>
          </Show>
          <Show when={reg.showRefresh}>
            <WebButton
              type="button"
              class={btnClass()}
              data-ui="tree-refresh"
              title="Refresh"
              aria-label="Refresh list"
              onClick={() => reg.refresh()}
            >
              {cardHeadTreeRefreshIcon()}
            </WebButton>
          </Show>
        </div>
      )}
    </Show>
  );
}
