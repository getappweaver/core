// ---------------------------------------------------------------------------
// web/src/components/WebNodeShadowRoot.tsx — Shadow DOM island for WebNodeRoot
// ---------------------------------------------------------------------------

import hljsGithubDarkCss from 'highlight.js/styles/github-dark.css?raw';
import type { JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { render } from 'solid-js/web';

import type { WebAction, WebNodeRoot, WebStyleSheet } from '@src/web/ui-schema';

import type {
  RunWebActionParams,
  WebEntityPendingState,
} from '../commands/types';
import baseWebUiCss from '../webview/base-web-ui.css?raw';
import webOverflowPanelCss from '../webview/web-overflow-panel.css?raw';

import { applyOptimisticMutationsToRoot } from './web-node/optimistic';
import { reconcileWebNodeRoot } from './web-node/reconcile';
import { WebShadowUiBusyContext } from './web-shadow-ui-busy-context';
import {
  getTreeItemExpandedStateForScope,
  TreeItemExpandedStateContext,
  TreeTimeFilterStateContext,
  WebNodeRenderer,
  WebRevealContext,
  WebCurrentUserPubkeyContext,
  WebToggleContext,
  runLocalWebAction,
  type WebRevealContextValue,
  WebRenderMetaContext,
  WebRenderSurfaceContext,
  WebTreeHeaderElCallbackContext,
  WebTreeToolbarRegisterContext,
  type WebTreeToolbarRegistration,
  WebPendingEntityContext,
  type TreeTimeFilterState,
  type TreeTimeRange,
} from './WebNodeRenderer';

type WebNodeShadowRootProps = {
  root: WebNodeRoot;
  stateScopeId?: string;
  renderSurface?: 'dock' | 'modal' | 'timeline';
  busy?: boolean;
  getEntityPending?: (entityKey: string) => WebEntityPendingState;
  /** When set, root-level `tree` UI registers handlers so the host can render toolbar in light DOM. */
  onWebTreeToolbarChange?: (
    registration: WebTreeToolbarRegistration | null,
  ) => void;
  /** Root `tree` reports its `.web-tree-header` for timeline scroll / sticky duplicate controls. */
  onWebTreeHeaderEl?: (el: HTMLElement | null) => void;
  speechSentences?: string[];
  activeSpeechSentenceIndex?: number | null;
  onSpeechSentenceClick?: ((index: number) => void) | null;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  currentUserPubkey?: string | null;
  onError?: (message: string) => void;
  promptRequestId?: string;
  onRunAction?: (action: WebAction, params?: RunWebActionParams) => void;
};

const BASE_STYLE_TEXT = `${baseWebUiCss}\n${webOverflowPanelCss}\n${hljsGithubDarkCss}`;

type ShadowMountContext = {
  shadow: ShadowRoot;
  mount: HTMLDivElement;
};

type SyncPayloadStylesheetsProps = {
  shadow: ShadowRoot;
  mount: HTMLElement;
  stylesheets: WebStyleSheet[] | undefined;
};

function syncPayloadStylesheets(props: SyncPayloadStylesheetsProps): void {
  const { shadow, mount, stylesheets } = props;
  const desired = new Map<string, string>();

  for (const sheet of stylesheets ?? []) {
    desired.set(sheet.id, sheet.cssText);
  }

  for (const el of [...shadow.querySelectorAll('style[data-web-sheet]')]) {
    const id = el.getAttribute('data-web-sheet');

    if (!id || !desired.has(id)) {
      el.remove();
    }
  }

  for (const [id, cssText] of desired) {
    const existing = [...shadow.querySelectorAll('style[data-web-sheet]')].find(
      (e) => e.getAttribute('data-web-sheet') === id,
    );

    if (existing) {
      if (existing.textContent !== cssText) {
        existing.textContent = cssText;
      }
    } else {
      const style = document.createElement('style');
      style.setAttribute('data-web-sheet', id);
      style.textContent = cssText;
      shadow.insertBefore(style, mount);
    }
  }
}

export function WebNodeShadowRoot(props: WebNodeShadowRootProps): JSX.Element {
  let hostEl: HTMLDivElement | undefined;
  const [ctx, setCtx] = createSignal<ShadowMountContext | null>(null);
  const [currentRoot, setCurrentRoot] = createStore<WebNodeRoot>(props.root);
  const speechSentences = createMemo(() => props.speechSentences);

  const activeSpeechSentenceIndex = createMemo(
    () => props.activeSpeechSentenceIndex,
  );

  const onSpeechSentenceClick = createMemo(() => props.onSpeechSentenceClick);

  const treeItemExpandedById = getTreeItemExpandedStateForScope(
    props.stateScopeId,
  );

  const [revealedIds, setRevealedIds] = createSignal<Set<string>>(new Set());

  const [activeToggleKeys, setActiveToggleKeys] = createSignal<Set<string>>(
    new Set(),
  );

  const initializedTimeFilterGroups = new Set<string>();
  const initialTimeRangesByGroup = new Map<string, TreeTimeRange[]>();

  function sortedTimeRanges(ranges: TreeTimeRange[]): TreeTimeRange[] {
    return ranges
      .map((range) => ({ ...range }))
      .sort((left, right) => right.since - left.since);
  }

  function initializeTimeFilterGroups(root: WebNodeRoot): void {
    for (const [group, ranges] of Object.entries(
      root.initialTreeTimeRanges ?? {},
    )) {
      if (initializedTimeFilterGroups.has(group)) {
        continue;
      }

      initializedTimeFilterGroups.add(group);

      if (ranges.length > 0) {
        initialTimeRangesByGroup.set(group, sortedTimeRanges(ranges));
      }
    }
  }

  initializeTimeFilterGroups(props.root);

  for (const [group, ranges] of Object.entries(
    props.root.selectedTreeTimeRanges ?? {},
  )) {
    initializedTimeFilterGroups.add(group);

    if (ranges.length > 0) {
      initialTimeRangesByGroup.set(group, sortedTimeRanges(ranges));
    } else {
      initialTimeRangesByGroup.delete(group);
    }
  }

  const [timeRangesByGroup, setTimeRangesByGroup] = createSignal(
    initialTimeRangesByGroup,
  );

  const timeFilterState: TreeTimeFilterState = {
    ranges: (group) => timeRangesByGroup().get(group) ?? [],
    isActive: (group, key) =>
      (timeRangesByGroup().get(group) ?? []).some((range) => range.key === key),
    toggle: (group, range) => {
      initializedTimeFilterGroups.add(group);

      setTimeRangesByGroup((previous) => {
        const next = new Map(previous);
        const ranges = next.get(group) ?? [];
        const exists = ranges.some((entry) => entry.key === range.key);

        next.set(
          group,
          exists
            ? ranges.filter((entry) => entry.key !== range.key)
            : [...ranges, range].sort(
                (left, right) => right.since - left.since,
              ),
        );

        return next;
      });
    },
    setOnly: (group, range) => {
      initializedTimeFilterGroups.add(group);

      setTimeRangesByGroup((previous) => {
        const next = new Map(previous);
        next.set(group, [range]);

        return next;
      });
    },
    remove: (group, key) => {
      initializedTimeFilterGroups.add(group);

      setTimeRangesByGroup((previous) => {
        const next = new Map(previous);

        next.set(
          group,
          (next.get(group) ?? []).filter((range) => range.key !== key),
        );

        return next;
      });
    },
    clear: (group) => {
      initializedTimeFilterGroups.add(group);

      setTimeRangesByGroup((previous) => {
        const next = new Map(previous);
        next.delete(group);

        return next;
      });
    },
  };

  const revealContext: WebRevealContextValue = {
    isRevealed: (id) => revealedIds().has(id),
    reveal: (id) => {
      setRevealedIds((prev) => {
        if (prev.has(id)) {
          return prev;
        }

        const next = new Set(prev);
        next.add(id);

        return next;
      });
    },
    hideReveal: (id) => {
      setRevealedIds((prev) => {
        if (!prev.has(id)) {
          return prev;
        }

        const next = new Set(prev);
        next.delete(id);

        return next;
      });
    },
    toggleReveal: (id) => {
      setRevealedIds((prev) => {
        const next = new Set(prev);

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        return next;
      });
    },
  };

  const toggleContext = {
    isActive: (key: string) => activeToggleKeys().has(key),
    toggle: (key: string) => {
      setActiveToggleKeys((prev) => {
        const next = new Set(prev);

        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }

        return next;
      });
    },
  };

  const applyLocalOptimisticMutations: NonNullable<
    RunWebActionParams['applyOptimisticMutations']
  > = (mutations) => {
    setCurrentRoot(
      produce((root) => {
        applyOptimisticMutationsToRoot({ root, mutations });
      }),
    );
  };

  onMount(() => {
    const host = hostEl;

    if (!host) {
      return;
    }

    const shadow = host.attachShadow({ mode: 'open' });

    const baseStyle = document.createElement('style');
    baseStyle.setAttribute('data-web-base', '');
    baseStyle.textContent = BASE_STYLE_TEXT;

    const mount = document.createElement('div');
    shadow.append(baseStyle, mount);
    setCtx({ shadow, mount });
  });

  createEffect(() => {
    const previousInitialRanges = new Map(initialTimeRangesByGroup);

    initializeTimeFilterGroups(props.root);

    if (initialTimeRangesByGroup.size > previousInitialRanges.size) {
      setTimeRangesByGroup((previous) => {
        const next = new Map(previous);

        for (const [group, ranges] of initialTimeRangesByGroup) {
          if (!previousInitialRanges.has(group)) {
            next.set(group, ranges);
          }
        }

        return next;
      });
    }

    const selectedTreeTimeRanges = props.root.selectedTreeTimeRanges;

    if (selectedTreeTimeRanges !== undefined) {
      setTimeRangesByGroup((previous) => {
        const next = new Map(previous);

        for (const [group, ranges] of Object.entries(selectedTreeTimeRanges)) {
          initializedTimeFilterGroups.add(group);

          if (ranges.length > 0) {
            next.set(group, sortedTimeRanges(ranges));
          } else {
            next.delete(group);
          }
        }

        return next;
      });
    }

    setCurrentRoot(reconcileWebNodeRoot(props.root));
  });

  createEffect(() => {
    const tree = currentRoot.tree;

    if (tree.type !== 'element' || tree.tag === 'tree') {
      return;
    }

    const renderSurface = props.renderSurface ?? null;

    const actions = tree.props?.toolbarActions?.filter((action) => {
      if (action.visibleOnSurfaces == null) {
        return true;
      }

      return (
        renderSurface !== null &&
        action.visibleOnSurfaces.includes(renderSurface)
      );
    });

    if (actions == null || actions.length === 0) {
      return;
    }

    props.onWebTreeToolbarChange?.({
      showFilter: false,
      filterValue: () => '',
      filterPlaceholder: 'Filter',
      setFilterValue: () => {},
      showTreeControls: false,
      showRefresh: false,
      actions,
      runAction: (action) => {
        if (
          runLocalWebAction({
            action,
            expandedById: treeItemExpandedById,
            expandTreeItems: null,
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
          getWebRoot: () => currentRoot,
          applyOptimisticMutations: applyLocalOptimisticMutations,
          promptRequestId: props.promptRequestId,
        });
      },
      collapseAll: () => {},
      expandAll: () => {},
      refresh: () => {},
    });

    onCleanup(() => {
      props.onWebTreeToolbarChange?.(null);
    });
  });

  createEffect(() => {
    const initialRevealedIds = currentRoot.initialRevealedIds ?? [];

    if (initialRevealedIds.length === 0) {
      return;
    }

    setRevealedIds((prev) => {
      const next = new Set(prev);

      for (const id of initialRevealedIds) {
        next.add(id);
      }

      return next;
    });
  });

  createEffect(() => {
    const c = ctx();

    if (!c) {
      return;
    }

    syncPayloadStylesheets({
      shadow: c.shadow,
      mount: c.mount,
      stylesheets: currentRoot.stylesheets,
    });
  });

  createEffect(() => {
    const c = ctx();

    if (!c) {
      return;
    }

    const mountScrollY = currentRoot.shadowMountOverflow !== 'hidden';

    c.mount.className = mountScrollY
      ? 'web-shadow-mount web-shadow-mount--scroll-y'
      : 'web-shadow-mount';
  });

  createEffect(() => {
    const c = ctx();

    if (!c) {
      return;
    }

    const busyAccessor = () => props.busy === true;

    const dispose = render(
      () => (
        <WebShadowUiBusyContext.Provider value={busyAccessor}>
          <TreeItemExpandedStateContext.Provider value={treeItemExpandedById}>
            <WebRenderMetaContext.Provider value={() => currentRoot.meta}>
              <WebRenderSurfaceContext.Provider
                value={() => props.renderSurface ?? null}
              >
                <WebTreeToolbarRegisterContext.Provider
                  value={props.onWebTreeToolbarChange ?? null}
                >
                  <WebTreeHeaderElCallbackContext.Provider
                    value={props.onWebTreeHeaderEl ?? null}
                  >
                    <WebCurrentUserPubkeyContext.Provider
                      value={() => props.currentUserPubkey ?? null}
                    >
                      <WebRevealContext.Provider value={revealContext}>
                        <WebToggleContext.Provider value={toggleContext}>
                          <TreeTimeFilterStateContext.Provider
                            value={timeFilterState}
                          >
                            <WebPendingEntityContext.Provider
                              value={(entityKey) =>
                                props.getEntityPending?.(entityKey) ?? {
                                  pending: false,
                                  label: null,
                                }
                              }
                            >
                              <WebNodeRenderer
                                root={currentRoot}
                                onReplaceRoot={props.onReplaceRoot}
                                onError={props.onError}
                                promptRequestId={props.promptRequestId}
                                speechSentences={speechSentences}
                                activeSpeechSentenceIndex={
                                  activeSpeechSentenceIndex
                                }
                                onSpeechSentenceClick={onSpeechSentenceClick}
                                onRunAction={(action, params) =>
                                  props.onRunAction?.(action, {
                                    ...params,
                                    getWebRoot: () => currentRoot,
                                    applyOptimisticMutations:
                                      applyLocalOptimisticMutations,
                                    webTargetRoot: c.shadow,
                                  })
                                }
                              />
                            </WebPendingEntityContext.Provider>
                          </TreeTimeFilterStateContext.Provider>
                        </WebToggleContext.Provider>
                      </WebRevealContext.Provider>
                    </WebCurrentUserPubkeyContext.Provider>
                  </WebTreeHeaderElCallbackContext.Provider>
                </WebTreeToolbarRegisterContext.Provider>
              </WebRenderSurfaceContext.Provider>
            </WebRenderMetaContext.Provider>
          </TreeItemExpandedStateContext.Provider>
        </WebShadowUiBusyContext.Provider>
      ),
      c.mount,
    );

    onCleanup(() => {
      dispose();
    });
  });

  const busy = () => props.busy === true;

  return (
    <div
      classList={{
        'web-ui-shadow-host-wrap': true,
        'web-ui-shadow-host-wrap--busy': busy(),
      }}
      aria-busy={busy() ? 'true' : undefined}
    >
      <div
        class="web-ui-shadow-host"
        classList={{
          'web-ui-shadow-host--timeline': props.renderSurface === 'timeline',
          'web-ui-shadow-host--dock': props.renderSurface === 'dock',
          'web-ui-shadow-host--modal': props.renderSurface === 'modal',
        }}
        ref={(el) => {
          hostEl = el;
        }}
      />
      {busy() ? (
        <div class="web-ui-shadow-busy-overlay" aria-hidden="true">
          <span class="web-ui-shadow-busy-label">Working…</span>
        </div>
      ) : null}
    </div>
  );
}
