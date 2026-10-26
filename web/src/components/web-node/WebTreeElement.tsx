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

import {
  cardHeadTreeCollapseAllIcon,
  cardHeadTreeExpandAllIcon,
  cardHeadTreeRefreshIcon,
} from '../timeline/timelineCardHeadIcons';
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
  TreeWidgetBulkExpandContext,
  TreeDirectChildCountContext,
  TreeRootItemCountContext,
  TreeFilterStateContext,
  TreeTimeFilterStateContext,
  WebRootUpdateEpochContext,
  useWebRenderMeta,
} from './contexts';
import { elementClass, elementStyle, elementUi } from './element-helpers';
import {
  consumeScrollIntoViewOnceKey,
  focusAndScrollWebElement,
  setupWebElementRef,
} from './speech';
import {
  childTreeItems,
  isTreeBodyNodeExpandable,
  cachedTreeFilterIndex,
  normalizedFilterQuery,
  EMPTY_TREE_FILTER_INDEX,
} from './tree-filter';
import {
  applyFocusedTreeExpansion,
  collectFocusedTreeItemExpansion,
  runLocalWebAction,
  setTreeItemsExpanded,
} from './tree-state';

const TREE_FILTER_INITIAL_DEBOUNCE_MS = 1_000;
const TREE_FILTER_MIN_QUERY_LENGTH = 3;

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
  const widgetBulkExpand = useContext(TreeWidgetBulkExpandContext);
  const expandRequest = useContext(TreeExpandRequestContext);
  const filterState = useContext(TreeFilterStateContext);
  const rootUpdateEpoch = useContext(WebRootUpdateEpochContext);
  const treeItemId = () => props.element.props?.id ?? null;
  let summaryEl: HTMLDivElement | undefined;

  const hasActiveTextFilter = () =>
    normalizedFilterQuery(filterState?.query() ?? '').length > 0;

  const isFilterVisible = () => {
    const visibleIds = filterState?.visibleIds() ?? null;
    const id = treeItemId();

    return visibleIds === null || (id !== null && visibleIds.has(id));
  };

  const initialExpanded = () => {
    const id = treeItemId();
    const widgetBulk = widgetBulkExpand?.();

    const fallback =
      widgetBulk && widgetBulk.epoch > 0
        ? widgetBulk.expanded
        : (props.element.props?.defaultExpanded ?? true);

    if (!(id && expandedById)) {
      return fallback;
    }

    const saved = expandedById.get(id);

    return saved ?? fallback;
  };

  const [expanded, setExpanded] = createSignal(initialExpanded());
  const [lazyLoading, setLazyLoading] = createSignal(false);

  const directTreeItemCount = () =>
    body().filter(
      (child) => child.type === 'element' && child.tag === 'treeItem',
    ).length;

  const bulkExpand = useContext(TreeBulkExpandContext);
  let lastBulkEpochApplied = bulkExpand?.().epoch ?? 0;
  let lastWidgetBulkEpochApplied = widgetBulkExpand?.().epoch ?? 0;
  let lastExpandRequestEpochApplied = expandRequest?.()?.epoch ?? 0;

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
    if (hasActiveTextFilter()) {
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
    const bulk = widgetBulkExpand?.();

    if (bulk && bulk.epoch > lastWidgetBulkEpochApplied) {
      lastWidgetBulkEpochApplied = bulk.epoch;
      setExpanded(bulk.expanded);
    }
  });

  createEffect(() => {
    const request = expandRequest?.();
    const id = treeItemId();

    if (!request || !id) {
      return;
    }

    if (request.epoch > lastExpandRequestEpochApplied) {
      lastExpandRequestEpochApplied = request.epoch;

      if (request.ids.includes(id)) {
        setExpanded(true);
      } else if (request.collapseOthers === true) {
        setExpanded(false);
      }
    }
  });

  createEffect(() => {
    const epoch = rootUpdateEpoch();
    const isFocused = props.element.props?.focused === true;

    if (!isFocused) {
      return;
    }

    const onceKey = props.element.props?.scrollIntoViewOnceKey;

    if (typeof onceKey === 'string' && !consumeScrollIntoViewOnceKey(onceKey)) {
      return;
    }

    void epoch;

    queueMicrotask(() => {
      if (summaryEl) {
        focusAndScrollWebElement(summaryEl);
      }
    });
  });

  return (
    <TreeDirectChildCountContext.Provider value={directTreeItemCount}>
      <Show when={isFilterVisible()}>
        <div
          class={elementClass(props.element)}
          data-ui={elementUi(props.element)}
          data-web-node-id={treeItemId() ?? undefined}
          ref={(el) => setupWebElementRef({ element: props.element, el })}
        >
          <div
            ref={(el) => {
              summaryEl = el;
            }}
            class="web-tree-item-summary"
            onClick={handleSummaryClick}
            style={{
              cursor:
                hasChildren() && !hasActiveTextFilter() ? 'pointer' : 'default',
            }}
          >
            <Show
              when={hasChildren()}
              fallback={<span class="web-tree-toggle-spacer" />}
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
          <Show when={!hasActiveTextFilter() && (!hasChildren() || expanded())}>
            <div class="web-tree-item-children is-children">
              <Show when={lazyLoading() && body().length === 0}>
                <div class="web-tree-item-loading">
                  {props.element.props?.lazyLoadingLabel ?? 'Loading…'}
                </div>
              </Show>
              <For each={body()}>{(child) => props.renderChild(child)}</For>
            </div>
          </Show>
          <Show when={hasChildren() && hasActiveTextFilter()}>
            <div class="web-tree-item-children is-children is-filtered">
              <For each={body()}>{(child) => props.renderChild(child)}</For>
            </div>
          </Show>
        </div>
      </Show>
    </TreeDirectChildCountContext.Provider>
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
  const toolbarId = Symbol('tree-toolbar');
  const reportTreeHeaderEl = useContext(WebTreeHeaderElCallbackContext);
  const revealContext = useContext(WebRevealContext);
  const toggleContext = useContext(WebToggleContext);
  const timeFilterState = useContext(TreeTimeFilterStateContext);
  const rootUpdateEpoch = useContext(WebRootUpdateEpochContext);

  const expandedById =
    useContext(TreeItemExpandedStateContext) ?? new Map<string, boolean>();

  applyFocusedTreeExpansion({
    plan: collectFocusedTreeItemExpansion(props.element),
    expandedById,
  });

  const [bulk, setBulk] = createSignal<TreeBulkExpandState>({
    epoch: 0,
    expanded: true,
  });

  const setTreeExpanded = (expanded: boolean) => {
    setTreeItemsExpanded({
      node: props.element,
      expandedById,
      expanded,
    });

    setBulk((previous) => ({ epoch: previous.epoch + 1, expanded }));
  };

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

  const timeFilterGroup = () => props.element.props?.timeFilterGroup ?? null;

  const selectedTimeRanges = () => {
    const group = timeFilterGroup();

    return group ? (timeFilterState?.ranges(group) ?? []) : [];
  };

  const directRootTreeItemCount = () =>
    (props.element.children ?? []).filter(
      (child) => child.type === 'element' && child.tag === 'treeItem',
    ).length;

  const visibleFilterIds = createMemo<Set<string> | null>(() => {
    const hasTextFilter = normalizedFilterQuery(filterQuery()).length > 0;
    const ranges = selectedTimeRanges();

    if (!hasTextFilter && ranges.length === 0) {
      return null;
    }

    const textIds = hasTextFilter ? filterIndex().search(filterQuery()) : null;

    const timeIds =
      ranges.length > 0 ? filterIndex().searchTimeRanges(ranges) : null;

    if (textIds === null) {
      return timeIds;
    }

    if (timeIds === null) {
      return textIds;
    }

    return new Set([...textIds].filter((id) => timeIds.has(id)));
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

  function setFilterQueryIfQualified(value: string): void {
    if (filterDebounceTimer !== undefined) {
      clearTimeout(filterDebounceTimer);
      filterDebounceTimer = undefined;
    }

    if (normalizedFilterQuery(value).length < TREE_FILTER_MIN_QUERY_LENGTH) {
      setFilterQuery('');

      return;
    }

    if (
      normalizedFilterQuery(filterQuery()).length >=
      TREE_FILTER_MIN_QUERY_LENGTH
    ) {
      setFilterQuery(value);

      return;
    }

    filterDebounceTimer = setTimeout(() => {
      setFilterQuery(value);
      filterDebounceTimer = undefined;
    }, TREE_FILTER_INITIAL_DEBOUNCE_MS);
  }

  function setTreeFilterValue(value: string): void {
    setFilterInput(value);
    setFilterQueryIfQualified(value);
  }

  createEffect(() => {
    const epoch = rootUpdateEpoch();
    const plan = collectFocusedTreeItemExpansion(props.element);

    if (plan.focusedIds.length === 0) {
      return;
    }

    void epoch;

    applyFocusedTreeExpansion({ plan, expandedById });

    setExpandRequest((previous) => ({
      epoch: (previous?.epoch ?? 0) + 1,
      ids: [...plan.expandedIds],
      collapseOthers: true,
    }));

    const visible = visibleFilterIds();

    if (visible !== null && !plan.focusedIds.every((id) => visible.has(id))) {
      setTreeFilterValue('');
    }
  });

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
        filterState: null,
        timeFilterState,
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

    publish(
      {
        showFilter: filterEnabled(),
        filterValue: filterInput,
        filterPlaceholder: props.element.props?.filterPlaceholder ?? 'Filter',
        setFilterValue: setTreeFilterValue,
        showTreeControls: childTreeItems(props.element).length > 0,
        showRefresh: meta != null,
        actions: props.element.props?.toolbarActions,
        runAction: runTreeAction,
        collapseAll: () => setTreeExpanded(false),
        expandAll: () => setTreeExpanded(true),
        refresh: () => {
          runRefreshCommand();
        },
      },
      toolbarId,
    );
  });

  onCleanup(() => {
    if (parentBulk !== undefined) {
      return;
    }

    registerHoistedToolbar?.(null, toolbarId);
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
              value={{
                query: filterQuery,
                visibleIds: visibleFilterIds,
                setValue: setTreeFilterValue,
              }}
            >
              <TreeRootItemCountContext.Provider
                value={directRootTreeItemCount}
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
                          <Show when={filterOpen() || hasFilterValue()}>
                            <input
                              ref={(el) => {
                                filterInputEl = el;
                              }}
                              class="web-tree-filter-input"
                              type="search"
                              value={filterInput()}
                              placeholder={
                                props.element.props?.filterPlaceholder ??
                                'Filter'
                              }
                              onInput={(event) => {
                                setTreeFilterValue(event.currentTarget.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  setTreeFilterValue('');
                                  setFilterOpen(false);
                                }
                              }}
                            />
                          </Show>
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
                        </div>
                      </Show>
                      <WebButton
                        type="button"
                        class="web-button web-button--link web-tree-toolbar-button"
                        data-ui="tree-collapse-all"
                        title="Collapse all"
                        aria-label="Collapse all tree branches"
                        onClick={() => setTreeExpanded(false)}
                      >
                        {cardHeadTreeCollapseAllIcon({ width: 16, height: 16 })}
                      </WebButton>
                      <WebButton
                        type="button"
                        class="web-button web-button--link web-tree-toolbar-button"
                        data-ui="tree-expand-all"
                        title="Expand all"
                        aria-label="Expand all tree branches"
                        onClick={() => setTreeExpanded(true)}
                      >
                        {cardHeadTreeExpandAllIcon({ width: 16, height: 16 })}
                      </WebButton>
                      <Show when={renderMeta()}>
                        <WebButton
                          type="button"
                          class="web-button web-button--link web-tree-toolbar-button"
                          data-ui="tree-refresh"
                          title="Refresh"
                          aria-label="Refresh list"
                          onClick={() => {
                            runRefreshCommand();
                          }}
                        >
                          {cardHeadTreeRefreshIcon({ width: 16, height: 16 })}
                        </WebButton>
                      </Show>
                    </div>
                  </Show>
                  <For each={props.element.children ?? []}>
                    {(child) => props.renderChild(child)}
                  </For>
                </div>
              </TreeRootItemCountContext.Provider>
            </TreeFilterStateContext.Provider>
          </TreeBulkExpandContext.Provider>
        </TreeExpandRequestSetterContext.Provider>
      </TreeExpandRequestContext.Provider>
    </TreeItemExpandedStateContext.Provider>
  );
}
