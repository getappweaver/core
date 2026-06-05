import type { JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  For,
  useContext,
} from 'solid-js';

import type {
  WebElementNode,
  WebAction,
  WebNodeRoot,
} from '@src/web/ui-schema';

import { registerStoryDomTarget } from '../../story/dom-targets';
import { emitStoryTargetClicked } from '../../story/events';

import { WebButton } from '../WebButton';

import type { TreeBulkExpandState, TreeExpandRequest } from './contexts';
import {
  WebRenderSurfaceContext,
  WebTreeToolbarRegisterContext,
  WebTreeHeaderElCallbackContext,
  WebRevealContext,
  WebToggleContext,
  TreeItemExpandedStateContext,
  TreeExpandRequestContext,
  TreeExpandRequestSetterContext,
  TreeBulkExpandContext,
  TreeFilterStateContext,
  useWebRenderMeta,
} from './contexts';
import { elementClass, elementStyle, elementUi } from './element-helpers';
import {
  childTreeItems,
  isTreeBodyNodeExpandable,
  cachedTreeFilterIndex,
  normalizedFilterQuery,
  EMPTY_TREE_FILTER_INDEX,
} from './tree-filter';
import { runLocalWebAction } from './tree-state';

type WebTreeItemProps = {
  element: WebElementNode;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  onRunAction?: (
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
      uiExecutionPolicy?: {
        recordInTimeline?: boolean;
        suppressSystemMessage?: boolean;
      };
    },
  ) => void;
  renderChild: (child: import('@src/web/ui-schema').WebNode) => JSX.Element;
};

export function WebTreeItemElement(props: WebTreeItemProps) {
  const children = () => props.element.children ?? [];
  const summary = () => props.element.summary ?? children()[0] ?? null;

  const body = () =>
    props.element.summary === undefined ? children().slice(1) : children();

  const lazyLoadAction = () => props.element.props?.lazyLoadAction ?? null;
  const isLazyLoaded = () => props.element.props?.lazyLoaded === true;

  const hasChildren = () =>
    body().some(isTreeBodyNodeExpandable) || lazyLoadAction() !== null;

  const expandedById = useContext(TreeItemExpandedStateContext);
  const expandRequest = useContext(TreeExpandRequestContext);
  const filterState = useContext(TreeFilterStateContext);
  const treeItemId = () => props.element.props?.id ?? null;

  const activeFilter = () =>
    normalizedFilterQuery(filterState !== undefined ? filterState.query() : '');

  const isFilterVisible = () => {
    const visibleIds = filterState?.visibleIds() ?? null;
    const id = treeItemId();

    return visibleIds === null || (id !== null && visibleIds.has(id));
  };

  const initialExpanded = () => {
    const id = treeItemId();

    if (!(id && expandedById)) {
      return props.element.props?.defaultExpanded ?? true;
    }

    const saved = expandedById.get(id);

    return saved ?? props.element.props?.defaultExpanded ?? true;
  };

  const [expanded, setExpanded] = createSignal(initialExpanded());
  const [lazyLoading, setLazyLoading] = createSignal(false);

  const bulkExpand = useContext(TreeBulkExpandContext);
  let lastBulkEpochApplied = 0;
  let lastExpandRequestEpochApplied = 0;

  createEffect(() => {
    const id = treeItemId();

    if (!id || !expandedById) {
      return;
    }

    expandedById.set(id, expanded());
  });

  function loadLazyChildrenIfNeeded(): void {
    const action = lazyLoadAction();

    if (!action || isLazyLoaded() || lazyLoading()) {
      return;
    }

    setLazyLoading(true);

    props.onRunAction?.(action, {
      onReplaceRoot: props.onReplaceRoot,
      uiExecutionPolicy: {
        recordInTimeline: false,
        suppressSystemMessage: true,
      },
    });
  }

  function toggleExpanded(): void {
    if (activeFilter().length > 0) {
      return;
    }

    if (!hasChildren()) {
      return;
    }

    const next = !expanded();
    setExpanded(next);

    if (next) {
      loadLazyChildrenIfNeeded();
    }
  }

  function handleSummaryClick(event: MouseEvent): void {
    const selector = props.element.props?.toggleSelector;

    if (selector && !(event.target as Element | null)?.closest(selector)) {
      return;
    }

    toggleExpanded();
  }

  createEffect(() => {
    const bulk = bulkExpand?.();

    if (!bulk) {
      return;
    }

    if (bulk.epoch > lastBulkEpochApplied) {
      lastBulkEpochApplied = bulk.epoch;
      setExpanded(bulk.expanded);
    }
  });

  createEffect(() => {
    const request = expandRequest?.();
    const id = treeItemId();

    if (!request || !id) {
      return;
    }

    if (
      request.epoch > lastExpandRequestEpochApplied &&
      request.ids.includes(id)
    ) {
      lastExpandRequestEpochApplied = request.epoch;
      setExpanded(true);
    }
  });

  return (
    <Show when={isFilterVisible()}>
      <div
        class={elementClass(props.element)}
        data-ui={elementUi(props.element)}
      >
        <div
          class="web-tree-item-summary"
          onClick={handleSummaryClick}
          style={{
            cursor:
              hasChildren() && activeFilter().length === 0
                ? 'pointer'
                : 'default',
          }}
        >
          <Show
            when={hasChildren()}
            fallback={<span class="web-tree-toggle web-tree-toggle-spacer" />}
          >
            <button
              type="button"
              class="web-tree-toggle"
              data-ui="tree-item-toggle"
              data-story-target={props.element.props?.storyTargetId}
              ref={(el) =>
                props.element.props?.storyTargetId
                  ? registerStoryDomTarget(
                      props.element.props.storyTargetId,
                      el,
                    )
                  : undefined
              }
              aria-expanded={expanded()}
              onClick={(e) => {
                e.stopPropagation();

                if (props.element.props?.storyTargetId) {
                  emitStoryTargetClicked(props.element.props.storyTargetId);
                }

                toggleExpanded();
              }}
            >
              {expanded() ? '▾' : '▸'}
            </button>
          </Show>
          <Show when={summary()}>{(node) => props.renderChild(node())}</Show>
        </div>
        <Show
          when={activeFilter().length === 0 && (!hasChildren() || expanded())}
        >
          <div class="web-tree-item-children is-children">
            <Show when={lazyLoading() && body().length === 0}>
              <div class="web-tree-item-loading">
                {props.element.props?.lazyLoadingLabel ?? 'Loading…'}
              </div>
            </Show>
            <For each={body()}>{(child) => props.renderChild(child)}</For>
          </div>
        </Show>
        <Show when={hasChildren() && activeFilter().length > 0}>
          <div class="web-tree-item-children is-children is-filtered">
            <For each={body()}>{(child) => props.renderChild(child)}</For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

type WebTreeElementProps = {
  element: WebElementNode;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  onRunAction?: (
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
      uiExecutionPolicy?: {
        recordInTimeline?: boolean;
        suppressSystemMessage?: boolean;
      };
    },
  ) => void;
  renderChild: (child: import('@src/web/ui-schema').WebNode) => JSX.Element;
};

export function WebTreeElement(props: WebTreeElementProps) {
  const parentBulk = useContext(TreeBulkExpandContext);
  const renderMeta = useWebRenderMeta();
  const renderSurface = useContext(WebRenderSurfaceContext);
  const registerHoistedToolbar = useContext(WebTreeToolbarRegisterContext);
  const reportTreeHeaderEl = useContext(WebTreeHeaderElCallbackContext);
  const revealContext = useContext(WebRevealContext);
  const toggleContext = useContext(WebToggleContext);

  const expandedById =
    useContext(TreeItemExpandedStateContext) ?? new Map<string, boolean>();

  const [bulk, setBulk] = createSignal<TreeBulkExpandState>({
    epoch: 0,
    expanded: true,
  });

  const [expandRequest, setExpandRequest] =
    createSignal<TreeExpandRequest | null>(null);

  const [filterOpen, setFilterOpen] = createSignal(false);
  const [filterInput, setFilterInput] = createSignal('');
  const [filterQuery, setFilterQuery] = createSignal('');
  let filterInputEl: HTMLInputElement | undefined;
  let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  const filterEnabled = () => props.element.props?.filterable === true;
  const hasFilterValue = () => normalizedFilterQuery(filterInput()).length > 0;

  const showInlineHeader = () => {
    const surface = renderSurface?.() ?? null;

    return surface !== 'timeline' && surface !== 'dock';
  };

  const filterIndex = createMemo(() =>
    filterEnabled()
      ? cachedTreeFilterIndex(props.element)
      : EMPTY_TREE_FILTER_INDEX,
  );

  const visibleFilterIds = createMemo<Set<string> | null>(() => {
    if (normalizedFilterQuery(filterQuery()).length === 0) {
      return null;
    }

    return filterIndex().search(filterQuery());
  });

  createEffect(() => {
    if (!filterEnabled()) {
      return;
    }

    const build = () => {
      filterIndex();
    };

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(build, { timeout: 800 });

      onCleanup(() => window.cancelIdleCallback(idleId));

      return;
    }

    const timeoutId = setTimeout(build, 0);

    onCleanup(() => clearTimeout(timeoutId));
  });

  function setDebouncedFilterQuery(value: string): void {
    if (filterDebounceTimer !== undefined) {
      clearTimeout(filterDebounceTimer);
    }

    filterDebounceTimer = setTimeout(() => {
      setFilterQuery(value);
      filterDebounceTimer = undefined;
    }, 140);
  }

  function setTreeFilterValue(value: string): void {
    setFilterInput(value);
    setDebouncedFilterQuery(value);
  }

  function requestTreeItemExpansion(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }

    setExpandRequest((prev) => ({
      epoch: (prev?.epoch ?? 0) + 1,
      ids,
    }));
  }

  onCleanup(() => {
    if (filterDebounceTimer !== undefined) {
      clearTimeout(filterDebounceTimer);
    }
  });

  const runRefreshCommand = () => {
    const meta = renderMeta();

    if (!meta) {
      return;
    }

    props.onRunAction?.(
      {
        type: 'command',
        command: meta.command,
        subcommand: meta.subcommand,
        arguments: meta.arguments ?? {},
        options: meta.options ?? {},
        recordInTimeline: false,
      },
      {
        onReplaceRoot: props.onReplaceRoot,
        promptRequestId: props.promptRequestId,
      },
    );
  };

  const runTreeAction = (action: WebAction) => {
    if (
      runLocalWebAction({
        action,
        expandedById,
        expandTreeItems: requestTreeItemExpansion,
        revealContext,
        toggleContext,
      })
    ) {
      return;
    }

    props.onRunAction?.(action, {
      onReplaceRoot: props.onReplaceRoot,
      promptRequestId: props.promptRequestId,
    });
  };

  createEffect(() => {
    if (parentBulk !== undefined) {
      return;
    }

    const publish = registerHoistedToolbar;

    if (publish == null) {
      return;
    }

    const meta = renderMeta();

    publish({
      showFilter: filterEnabled(),
      filterValue: filterInput,
      filterPlaceholder: props.element.props?.filterPlaceholder ?? 'Filter',
      setFilterValue: setTreeFilterValue,
      showTreeControls: childTreeItems(props.element).length > 0,
      showRefresh: meta != null,
      actions: props.element.props?.toolbarActions,
      runAction: runTreeAction,
      collapseAll: () =>
        setBulk((prev) => ({
          epoch: prev.epoch + 1,
          expanded: false,
        })),
      expandAll: () =>
        setBulk((prev) => ({
          epoch: prev.epoch + 1,
          expanded: true,
        })),
      refresh: () => {
        runRefreshCommand();
      },
    });
  });

  onCleanup(() => {
    if (parentBulk !== undefined) {
      return;
    }

    registerHoistedToolbar?.(null);
  });

  if (parentBulk !== undefined) {
    return (
      <div
        class={elementClass(props.element)}
        data-ui={elementUi(props.element)}
        style={elementStyle(props.element)}
      >
        <For each={props.element.children ?? []}>
          {(child) => props.renderChild(child)}
        </For>
      </div>
    );
  }

  return (
    <TreeItemExpandedStateContext.Provider value={expandedById}>
      <TreeExpandRequestContext.Provider value={expandRequest}>
        <TreeExpandRequestSetterContext.Provider
          value={requestTreeItemExpansion}
        >
          <TreeBulkExpandContext.Provider value={bulk}>
            <TreeFilterStateContext.Provider
              value={{ query: filterQuery, visibleIds: visibleFilterIds }}
            >
              <div
                class={elementClass(props.element)}
                data-ui={elementUi(props.element)}
                style={elementStyle(props.element)}
              >
                <Show when={showInlineHeader()}>
                  <div
                    class="web-tree-header"
                    ref={(el) => {
                      reportTreeHeaderEl?.(el ?? null);
                    }}
                  >
                    <Show when={filterEnabled()}>
                      <div
                        class="web-tree-filter"
                        classList={{
                          'is-open': filterOpen() || hasFilterValue(),
                        }}
                      >
                        <WebButton
                          type="button"
                          class="web-button web-button--link web-tree-filter-toggle"
                          data-ui="tree-filter-toggle"
                          aria-label="Filter tree"
                          title="Filter"
                          onClick={() => {
                            setFilterOpen((open) => !open);
                            queueMicrotask(() => filterInputEl?.focus());
                          }}
                        >
                          Search
                        </WebButton>
                        <Show when={filterOpen() || hasFilterValue()}>
                          <input
                            ref={(el) => {
                              filterInputEl = el;
                            }}
                            class="web-tree-filter-input"
                            type="search"
                            value={filterInput()}
                            placeholder={
                              props.element.props?.filterPlaceholder ?? 'Filter'
                            }
                            onInput={(event) => {
                              const value = event.currentTarget.value;

                              setFilterInput(value);
                              setDebouncedFilterQuery(value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                if (filterDebounceTimer !== undefined) {
                                  clearTimeout(filterDebounceTimer);
                                  filterDebounceTimer = undefined;
                                }

                                setFilterInput('');
                                setFilterQuery('');
                                setFilterOpen(false);
                              }
                            }}
                          />
                        </Show>
                      </div>
                    </Show>
                    <WebButton
                      type="button"
                      class="web-button web-button--link"
                      data-ui="tree-collapse-all"
                      aria-label="Collapse all tree branches"
                      onClick={() =>
                        setBulk((prev) => ({
                          epoch: prev.epoch + 1,
                          expanded: false,
                        }))
                      }
                    >
                      Collapse all
                    </WebButton>
                    <WebButton
                      type="button"
                      class="web-button web-button--link"
                      data-ui="tree-expand-all"
                      aria-label="Expand all tree branches"
                      onClick={() =>
                        setBulk((prev) => ({
                          epoch: prev.epoch + 1,
                          expanded: true,
                        }))
                      }
                    >
                      Expand all
                    </WebButton>
                    <Show when={renderMeta()}>
                      <WebButton
                        type="button"
                        class="web-button web-button--link"
                        data-ui="tree-refresh"
                        aria-label="Refresh list"
                        onClick={() => {
                          runRefreshCommand();
                        }}
                      >
                        Refresh
                      </WebButton>
                    </Show>
                  </div>
                </Show>
                <For each={props.element.children ?? []}>
                  {(child) => props.renderChild(child)}
                </For>
              </div>
            </TreeFilterStateContext.Provider>
          </TreeBulkExpandContext.Provider>
        </TreeExpandRequestSetterContext.Provider>
      </TreeExpandRequestContext.Provider>
    </TreeItemExpandedStateContext.Provider>
  );
}
