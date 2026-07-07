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
import { render } from 'solid-js/web';

import type { WebAction, WebNodeRoot, WebStyleSheet } from '@src/web/ui-schema';

import baseWebUiCss from '../webview/base-web-ui.css?raw';
import webOverflowPanelCss from '../webview/web-overflow-panel.css?raw';

import { WebShadowUiBusyContext } from './web-shadow-ui-busy-context';
import {
  getTreeItemExpandedStateForScope,
  TreeItemExpandedStateContext,
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
} from './WebNodeRenderer';

type WebNodeShadowRootProps = {
  root: WebNodeRoot;
  stateScopeId?: string;
  renderSurface?: 'dock' | 'modal' | 'timeline';
  busy?: boolean;
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
  onRunAction?: (
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
      uiExecutionPolicy?: {
        recordInTimeline?: boolean;
        suppressSystemMessage?: boolean;
      };
      webCommandSourceId?: string;
    },
  ) => void;
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
  const [currentRoot, setCurrentRoot] = createSignal<WebNodeRoot>(props.root);
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
    setCurrentRoot(props.root);
  });

  createEffect(() => {
    const tree = currentRoot().tree;

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
          })
        ) {
          return;
        }

        props.onRunAction?.(action, {
          onReplaceRoot: props.onReplaceRoot,
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
    const initialRevealedIds = currentRoot().initialRevealedIds ?? [];

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
      stylesheets: currentRoot().stylesheets,
    });
  });

  createEffect(() => {
    const c = ctx();

    if (!c) {
      return;
    }

    const mountScrollY = currentRoot().shadowMountOverflow !== 'hidden';

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
            <WebRenderMetaContext.Provider value={() => currentRoot().meta}>
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
                          <WebNodeRenderer
                            root={currentRoot()}
                            onReplaceRoot={props.onReplaceRoot}
                            onError={props.onError}
                            promptRequestId={props.promptRequestId}
                            speechSentences={speechSentences}
                            activeSpeechSentenceIndex={
                              activeSpeechSentenceIndex
                            }
                            onSpeechSentenceClick={onSpeechSentenceClick}
                            onRunAction={props.onRunAction}
                          />
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
