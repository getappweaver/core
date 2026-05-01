import type { Accessor, JSX } from 'solid-js';
import { Show, createMemo, createSignal } from 'solid-js';

import { WebButton } from '../WebButton';
import type { WebTreeToolbarRegistration } from '../WebNodeRenderer';

import {
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

export function TimelineWebTreeToolbar(
  props: TimelineWebTreeToolbarProps,
): JSX.Element {
  const [filterOpen, setFilterOpen] = createSignal(false);
  let filterInputEl: HTMLInputElement | undefined;

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
