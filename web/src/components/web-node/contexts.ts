import type { Accessor } from 'solid-js';
import { createContext, useContext } from 'solid-js';

import type {
  WebAction,
  WebElementNode,
  WebNode,
  WebNodeRoot,
  WebRenderMeta,
} from '@src/web/ui-schema';

// ---------------------------------------------------------------------------
// Reveal context
// ---------------------------------------------------------------------------

export type WebRevealContextValue = {
  isRevealed: (id: string) => boolean;
  reveal: (id: string) => void;
  hideReveal: (id: string) => void;
  toggleReveal: (id: string) => void;
};

export const WebRevealContext = createContext<WebRevealContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// Toggle context
// ---------------------------------------------------------------------------

export type WebToggleContextValue = {
  isActive: (key: string) => boolean;
  toggle: (key: string) => void;
};

export const WebToggleContext = createContext<WebToggleContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// Tree toolbar registration (hoist into light-DOM slot)
// ---------------------------------------------------------------------------

/** Hoist tree chrome into a light-DOM slot (e.g. timeline sticky card head). */
export type WebTreeToolbarRegistration = {
  showFilter: boolean;
  filterValue: Accessor<string>;
  filterPlaceholder: string;
  setFilterValue: (value: string) => void;
  showTreeControls: boolean;
  showRefresh: boolean;
  actions: NonNullable<WebElementNode['props']>['toolbarActions'];
  runAction: (
    action: NonNullable<NonNullable<WebElementNode['props']>['action']>,
  ) => void;
  collapseAll: () => void;
  expandAll: () => void;
  refresh: () => void;
};

/** Web UI renders in a shadow root; timeline chrome is light DOM — publish controls here. */
export const WebTreeToolbarRegisterContext = createContext<
  ((registration: WebTreeToolbarRegistration | null) => void) | null
>(null);

/** Root `.web-tree-header` node for timeline intersection (icon toolbar vs inline links). */
export const WebTreeHeaderElCallbackContext = createContext<
  ((el: HTMLElement | null) => void) | null
>(null);

// ---------------------------------------------------------------------------
// Tree item expanded state
// ---------------------------------------------------------------------------

export const TreeItemExpandedStateContext = createContext<Map<
  string,
  boolean
> | null>(null);

// ---------------------------------------------------------------------------
// Tree bulk expand / collapse
// ---------------------------------------------------------------------------

/** Bulk expand/collapse from the tree header; epoch increments on each user action. */
export type TreeBulkExpandState = {
  epoch: number;
  expanded: boolean;
};

export const TreeBulkExpandContext = createContext<
  Accessor<TreeBulkExpandState> | undefined
>(undefined);

// ---------------------------------------------------------------------------
// Tree expand request (programmatic per-id expansion)
// ---------------------------------------------------------------------------

export type TreeExpandRequest = {
  epoch: number;
  ids: string[];
};

export const TreeExpandRequestContext =
  createContext<Accessor<TreeExpandRequest | null> | null>(null);

export const TreeExpandRequestSetterContext = createContext<
  ((ids: string[]) => void) | null
>(null);

// ---------------------------------------------------------------------------
// Tree filter state
// ---------------------------------------------------------------------------

export type TreeFilterState = {
  query: Accessor<string>;
  visibleIds: Accessor<Set<string> | null>;
  setValue: (value: string) => void;
};

export const TreeFilterStateContext = createContext<TreeFilterState | null>(
  null,
);

// ---------------------------------------------------------------------------
// Render meta / surface / user pubkey
// ---------------------------------------------------------------------------

/** Command that produced this WebNode tree; set in `WebNodeShadowRoot` for Refresh. */
export const WebRenderMetaContext = createContext<
  Accessor<WebRenderMeta | null> | undefined
>(undefined);

export const WebRenderSurfaceContext = createContext<
  Accessor<'dock' | 'modal' | 'timeline' | null> | undefined
>(undefined);

export const WebCurrentUserPubkeyContext = createContext<
  Accessor<string | null> | undefined
>(undefined);

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useWebRenderMeta(): Accessor<WebRenderMeta | null> {
  const ctx = useContext(WebRenderMetaContext);

  return () => (ctx !== undefined ? ctx() : null);
}

export function useWebCurrentUserPubkey(): Accessor<string | null> {
  const ctx = useContext(WebCurrentUserPubkeyContext);

  return () => (ctx !== undefined ? ctx() : null);
}

// ---------------------------------------------------------------------------
// Renderer props type (shared across sub-components)
// ---------------------------------------------------------------------------

export type WebNodeRendererProps = {
  root?: WebNodeRoot;
  node?: WebNode;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  speechSentences?: Accessor<string[] | undefined>;
  activeSpeechSentenceIndex?: Accessor<number | null | undefined>;
  onSpeechSentenceClick?: Accessor<
    ((index: number) => void) | null | undefined
  >;
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
};
