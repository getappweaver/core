import hljs from 'highlight.js';
import type { Accessor, JSX } from 'solid-js';
import {
  For,
  Switch,
  Match,
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from 'solid-js';

import type {
  WebAction,
  WebElementNode,
  WebNode,
  WebNodeRoot,
  WebRenderMeta,
} from '@src/web/ui-schema';

import { registerStoryDomTarget } from '../story/dom-targets';
import {
  emitStoryTargetClicked,
  emitStoryTargetHovered,
  onStoryFillForm,
} from '../story/events';

import { WebShadowUiBusyContext } from './web-shadow-ui-busy-context';
import { WebButton } from './WebButton';

type WebNodeRendererProps = {
  root?: WebNodeRoot;
  node?: WebNode;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  speechSentences?: string[];
  activeSpeechSentenceIndex?: number | null;
  onSpeechSentenceClick?: ((index: number) => void) | null;
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

type HljsHighlightedSpanProps = {
  element: WebElementNode;
  language: string | null;
};

type SentenceRange = {
  index: number;
  start: number;
  end: number;
};

const WEB_SPEECH_HIGHLIGHT_NAME = 'web-speech-active';
const WEB_SPEECH_HOVER_HIGHLIGHT_NAME = 'web-speech-hover';

function sentenceRangesInText(
  text: string,
  sentences: string[],
): SentenceRange[] {
  const ranges: SentenceRange[] = [];
  let cursor = 0;

  sentences.forEach((sentence, index) => {
    const start = text.indexOf(sentence, cursor);

    if (start < 0) {
      return;
    }

    const end = start + sentence.length;
    ranges.push({ index, start, end });
    cursor = end;
  });

  return ranges;
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };

  if (doc.caretRangeFromPoint) {
    return doc.caretRangeFromPoint(x, y);
  }

  const position = doc.caretPositionFromPoint?.(x, y);

  if (!position) {
    return null;
  }

  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);

  return range;
}

function highlightApi(): Map<string, Highlight> | null {
  const api = CSS as typeof CSS & { highlights?: Map<string, Highlight> };

  return api.highlights ?? null;
}

type SpeechTextSegment = {
  node: Text;
  start: number;
  end: number;
};

function textNodesUnder(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node != null) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }

  return nodes;
}

function speechTextSegments(root: HTMLElement): SpeechTextSegment[] {
  const codeTextEls = [...root.querySelectorAll('.web-file-view-code-text')];
  const segments: SpeechTextSegment[] = [];
  let offset = 0;

  if (codeTextEls.length > 0) {
    codeTextEls.forEach((codeEl, index) => {
      for (const node of textNodesUnder(codeEl as HTMLElement)) {
        const start = offset;
        offset += node.data.length;
        segments.push({ node, start, end: offset });
      }

      if (index + 1 < codeTextEls.length) {
        offset += 1;
      }
    });

    return segments;
  }

  for (const node of textNodesUnder(root)) {
    const start = offset;
    offset += node.data.length;
    segments.push({ node, start, end: offset });
  }

  return segments;
}

function speechTextForElement(root: HTMLElement): string {
  const codeTextEls = [...root.querySelectorAll('.web-file-view-code-text')];

  if (codeTextEls.length > 0) {
    return codeTextEls.map((el) => el.textContent ?? '').join('\n');
  }

  return root.textContent ?? '';
}

function boundaryForSpeechOffset(
  segments: SpeechTextSegment[],
  offset: number,
  preferPrevious: boolean,
): { node: Text; offset: number } | null {
  for (const segment of segments) {
    if (offset >= segment.start && offset <= segment.end) {
      return { node: segment.node, offset: offset - segment.start };
    }
  }

  if (preferPrevious) {
    const previous = [...segments]
      .reverse()
      .find((segment) => segment.end < offset);

    return previous == null
      ? null
      : { node: previous.node, offset: previous.node.data.length };
  }

  const next = segments.find((segment) => segment.start > offset);

  return next == null ? null : { node: next.node, offset: 0 };
}

function domRangeForSpeechOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const segments = speechTextSegments(root);
  const startBoundary = boundaryForSpeechOffset(segments, start, false);
  const endBoundary = boundaryForSpeechOffset(segments, end, true);

  if (startBoundary == null || endBoundary == null) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);

  return range;
}

function textOffsetForSpeechRange(
  root: HTMLElement,
  target: Range,
): number | null {
  for (const segment of speechTextSegments(root)) {
    if (segment.node === target.startContainer) {
      return segment.start + target.startOffset;
    }
  }

  return null;
}

function HljsHighlightedSpan(props: HljsHighlightedSpanProps): JSX.Element {
  let spanEl: HTMLSpanElement | undefined;

  createEffect(() => {
    const el = spanEl;
    const child = props.element.children?.[0];
    const txt = child?.type === 'text' ? child.value : '';
    const lang = props.language;

    if (!el) {
      return;
    }

    if (txt.length === 0) {
      el.textContent = '';

      return;
    }

    try {
      if (lang !== null && hljs.getLanguage(lang)) {
        const { value } = hljs.highlight(txt, {
          language: lang,
          ignoreIllegals: true,
        });

        el.innerHTML = value;
        el.classList.add('hljs');
      } else {
        el.textContent = txt;
      }
    } catch {
      el.textContent = txt;
    }
  });

  return (
    <span
      ref={(el) => {
        spanEl = el;
      }}
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    />
  );
}

type SpeechHighlightBoxProps = {
  element: WebElementNode;
  onRunAction: WebNodeRendererProps['onRunAction'];
  onReplaceRoot: WebNodeRendererProps['onReplaceRoot'];
  onError: WebNodeRendererProps['onError'];
  promptRequestId: string | undefined;
  speechSentences: string[] | undefined;
  activeSpeechSentenceIndex: number | null | undefined;
  onSpeechSentenceClick: ((index: number) => void) | null | undefined;
};

function SpeechHighlightBox(props: SpeechHighlightBoxProps): JSX.Element {
  let el: HTMLDivElement | undefined;

  const sentenceAtEvent = (event: MouseEvent): SentenceRange | null => {
    if (el == null || !props.speechSentences?.length) {
      return null;
    }

    const range = caretRangeFromPoint(event.clientX, event.clientY);

    if (range == null || !el.contains(range.startContainer)) {
      return null;
    }

    const offset = textOffsetForSpeechRange(el, range);

    if (offset == null) {
      return null;
    }

    return (
      sentenceRangesInText(
        speechTextForElement(el),
        props.speechSentences,
      ).find(
        (candidate) => offset >= candidate.start && offset <= candidate.end,
      ) ?? null
    );
  };

  const setHighlight = (name: string, sentence: SentenceRange | null): void => {
    const highlights = highlightApi();

    if (highlights == null || el == null || sentence == null) {
      highlights?.delete(name);

      return;
    }

    const range = domRangeForSpeechOffsets(el, sentence.start, sentence.end);

    if (range == null) {
      highlights.delete(name);

      return;
    }

    highlights.set(name, new Highlight(range));
  };

  createEffect(() => {
    const highlights = highlightApi();
    const activeIndex = props.activeSpeechSentenceIndex;
    const sentences = props.speechSentences ?? [];

    highlights?.delete(WEB_SPEECH_HIGHLIGHT_NAME);

    if (el == null || activeIndex == null || sentences.length === 0) {
      return;
    }

    const sentence = sentenceRangesInText(
      speechTextForElement(el),
      sentences,
    ).find((candidate) => candidate.index === activeIndex);

    setHighlight(WEB_SPEECH_HIGHLIGHT_NAME, sentence ?? null);
  });

  onCleanup(() => {
    const highlights = highlightApi();
    highlights?.delete(WEB_SPEECH_HIGHLIGHT_NAME);
    highlights?.delete(WEB_SPEECH_HOVER_HIGHLIGHT_NAME);
  });

  return (
    <div
      ref={el}
      class={elementClass(props.element)}
      classList={{
        'web-speech-clickable': Boolean(props.onSpeechSentenceClick),
      }}
      data-ui={elementUi(props.element)}
      data-story-target={props.element.props?.storyTargetId}
      style={elementStyle(props.element)}
      onMouseMove={(event) => {
        setHighlight(WEB_SPEECH_HOVER_HIGHLIGHT_NAME, sentenceAtEvent(event));
      }}
      onMouseLeave={() => {
        highlightApi()?.delete(WEB_SPEECH_HOVER_HIGHLIGHT_NAME);
      }}
      onClick={(event) => {
        const sentence = sentenceAtEvent(event);

        if (sentence != null && props.onSpeechSentenceClick != null) {
          props.onSpeechSentenceClick(sentence.index);
        }
      }}
    >
      <For each={props.element.children ?? []}>
        {(child) => (
          <WebNodeRenderer
            node={child}
            onReplaceRoot={props.onReplaceRoot}
            onError={props.onError}
            promptRequestId={props.promptRequestId}
            speechSentences={props.speechSentences}
            activeSpeechSentenceIndex={props.activeSpeechSentenceIndex}
            onSpeechSentenceClick={props.onSpeechSentenceClick}
            onRunAction={props.onRunAction}
          />
        )}
      </For>
    </div>
  );
}

/** Tone, className, size, weight from element props (no `web-node` / `web-${tag}`). */
function elementPropsClasses(
  props: WebElementNode['props'] | undefined,
): string[] {
  const classes: string[] = [];

  if (!props) {
    return classes;
  }

  if (props.tone) {
    classes.push(`tone-${props.tone}`);
  }

  if (props.className) {
    classes.push(props.className);
  }

  if (props.size) {
    classes.push(`size-${props.size}`);
  }

  if (props.weight) {
    classes.push(`weight-${props.weight}`);
  }

  return classes;
}

function elementClass(node: WebElementNode): string {
  const classes = [
    'web-node',
    `web-${node.tag}`,
    ...elementPropsClasses(node.props),
  ];

  return classes.join(' ');
}

const GAP_REM: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: '0.25rem',
  sm: '0.35rem',
  md: '0.5rem',
  lg: '0.85rem',
};

const PADDING_REM: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: '0.35rem 0.45rem',
  sm: '0.45rem 0.55rem',
  md: '0.55rem 0.65rem',
  lg: '0.75rem 0.85rem',
};

const ROW_JUSTIFY: Record<'start' | 'center' | 'end' | 'between', string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

const FLEX_ALIGN: Record<
  'start' | 'center' | 'end' | 'stretch' | 'baseline',
  string
> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

type WebCheckboxControlProps = {
  className: string;
  style: string | undefined;
  checked: boolean;
  disabled: boolean;
  indeterminate: boolean;
  onChange: () => void;
  dataUi?: string;
};

type WebOverflowMenuProps = {
  element: WebElementNode;
  runAction: (action: WebAction | undefined) => void;
};

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
};

/** Bulk expand/collapse from the tree header; epoch increments on each user action. */
type TreeBulkExpandState = {
  epoch: number;
  expanded: boolean;
};

const TreeBulkExpandContext = createContext<
  Accessor<TreeBulkExpandState> | undefined
>(undefined);

export type WebRevealContextValue = {
  isRevealed: (id: string) => boolean;
  reveal: (id: string) => void;
  hideReveal: (id: string) => void;
};

export const WebRevealContext = createContext<
  WebRevealContextValue | undefined
>(undefined);

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

export const TreeItemExpandedStateContext = createContext<
  Map<string, boolean> | undefined
>(undefined);

type TreeFilterState = {
  query: Accessor<string>;
  visibleIds: Accessor<Set<string> | null>;
};

const TreeFilterStateContext = createContext<TreeFilterState | undefined>(
  undefined,
);

const treeItemExpandedByScope = new Map<string, Map<string, boolean>>();

export function getTreeItemExpandedStateForScope(
  scopeId: string | undefined,
): Map<string, boolean> {
  if (!scopeId) {
    return new Map<string, boolean>();
  }

  const existing = treeItemExpandedByScope.get(scopeId);

  if (existing) {
    return existing;
  }

  const created = new Map<string, boolean>();
  treeItemExpandedByScope.set(scopeId, created);

  return created;
}

export function clearTreeItemExpandedStateForScope(scopeId: string): void {
  treeItemExpandedByScope.delete(scopeId);
}

/** Command that produced this WebNode tree; set in `WebNodeShadowRoot` for Refresh. */
export const WebRenderMetaContext = createContext<
  Accessor<WebRenderMeta | null> | undefined
>(undefined);

export const WebRenderSurfaceContext = createContext<
  Accessor<'modal' | 'timeline' | null> | undefined
>(undefined);

function useWebRenderMeta(): Accessor<WebRenderMeta | null> {
  const ctx = useContext(WebRenderMetaContext);

  return () => (ctx !== undefined ? ctx() : null);
}

type WebTreeElementProps = {
  element: WebElementNode;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  onRunAction?: WebNodeRendererProps['onRunAction'];
};

function normalizedFilterQuery(value: string): string {
  return value.trim().toLowerCase();
}

type TreeFilterIndexEntry = {
  id: string;
  text: string;
  name: string;
  path: string;
  ancestorIds: string[];
  descendantIds: string[];
};

type TreeFilterIndex = {
  entries: TreeFilterIndexEntry[];
  search: (query: string) => Set<string>;
};

const treeFilterIndexCache = new Map<string, TreeFilterIndex>();
const MAX_TREE_FILTER_INDEX_CACHE_SIZE = 20;

const EMPTY_TREE_FILTER_INDEX: TreeFilterIndex = {
  entries: [],
  search: () => new Set(),
};

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(pattern: string): RegExp {
  let source = '';

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    const next = pattern[i + 1];

    if (ch === '*' && next === '*') {
      source += '.*';
      i += 1;
    } else if (ch === '*') {
      source += '[^/]*';
    } else if (ch === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(ch);
    }
  }

  return new RegExp(`^${source}$`);
}

function isGlobQuery(query: string): boolean {
  return /[*?]/.test(query);
}

function childTreeItems(node: WebNode): WebElementNode[] {
  if (node.type !== 'element') {
    return [];
  }

  return (node.children ?? []).flatMap((child) => {
    if (child.type !== 'element') {
      return [];
    }

    if (child.tag === 'treeItem') {
      return [child];
    }

    return childTreeItems(child);
  });
}

function buildTreeFilterIndex(tree: WebElementNode): TreeFilterIndex {
  const entries: TreeFilterIndexEntry[] = [];

  function visit(item: WebElementNode, ancestorIds: string[]): string[] {
    const id = item.props?.id;

    if (typeof id !== 'string' || id.length === 0) {
      return [];
    }

    const text = item.props?.filterText ?? '';
    const name = item.props?.filterName ?? '';
    const path = item.props?.filterPath ?? '';
    const descendantIds: string[] = [];

    for (const child of childTreeItems(item)) {
      descendantIds.push(...visit(child, [...ancestorIds, id]));
    }

    entries.push({
      id,
      text: text.toLowerCase(),
      name: name.toLowerCase(),
      path: path.toLowerCase(),
      ancestorIds,
      descendantIds,
    });

    return [id, ...descendantIds];
  }

  for (const item of childTreeItems(tree)) {
    visit(item, []);
  }

  return {
    entries,
    search(query: string): Set<string> {
      const normalized = normalizedFilterQuery(query);
      const visibleIds = new Set<string>();

      if (normalized.length === 0) {
        return visibleIds;
      }

      const globRegex = isGlobQuery(normalized)
        ? globToRegex(normalized)
        : null;

      const queryHasSlash = normalized.includes('/');

      for (const entry of entries) {
        const matched =
          globRegex !== null
            ? queryHasSlash
              ? globRegex.test(entry.path)
              : globRegex.test(entry.name)
            : entry.text.includes(normalized);

        if (!matched) {
          continue;
        }

        visibleIds.add(entry.id);

        for (const ancestorId of entry.ancestorIds) {
          visibleIds.add(ancestorId);
        }

        for (const descendantId of entry.descendantIds) {
          visibleIds.add(descendantId);
        }
      }

      return visibleIds;
    },
  };
}

function cachedTreeFilterIndex(tree: WebElementNode): TreeFilterIndex {
  const key = tree.props?.filterIndexKey;

  if (typeof key === 'string' && key.length > 0) {
    const cached = treeFilterIndexCache.get(key);

    if (cached !== undefined) {
      treeFilterIndexCache.delete(key);
      treeFilterIndexCache.set(key, cached);

      return cached;
    }

    const built = buildTreeFilterIndex(tree);
    treeFilterIndexCache.set(key, built);

    if (treeFilterIndexCache.size > MAX_TREE_FILTER_INDEX_CACHE_SIZE) {
      const oldestKey = treeFilterIndexCache.keys().next().value;

      if (typeof oldestKey === 'string') {
        treeFilterIndexCache.delete(oldestKey);
      }
    }

    return built;
  }

  return buildTreeFilterIndex(tree);
}

/** Margin from clipping edges when deciding flip-up (not a substitute for correct bounds). */
const OVERFLOW_PANEL_GAP_PX = 8;

/** Next layout parent: light-DOM parent, or shadow host when parent is a ShadowRoot. */
function layoutParentElement(el: HTMLElement): HTMLElement | null {
  const p = el.parentNode;

  if (p instanceof ShadowRoot && p.host instanceof HTMLElement) {
    return p.host;
  }

  return el.parentElement;
}

/** Intersection of the viewport with overflow clipping ancestors — space available inside a card or scroll region. */
function getVisibleVerticalBoundsForElement(el: HTMLElement): {
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

function listScrollableAncestors(el: HTMLElement): HTMLElement[] {
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

function WebOverflowMenuElement(props: WebOverflowMenuProps) {
  const [open, setOpen] = createSignal(false);
  const [flipUp, setFlipUp] = createSignal(false);
  let rootEl: HTMLDivElement | undefined;
  let panelEl: HTMLDivElement | undefined;
  const triggerProps = () => props.element.props;

  const checkboxTrigger = () =>
    typeof triggerProps()?.checked === 'boolean' ||
    triggerProps()?.indeterminate === true;

  /** Prefer opening below the trigger; flip above when the viewport has no room below. */
  createEffect(() => {
    if (!open()) {
      setFlipUp(false);

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

      const t = trigger.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const gap = OVERFLOW_PANEL_GAP_PX;
      const spaceBelow = vBottom - t.bottom - gap;
      const spaceAbove = t.top - vTop - gap;
      const needHeight = p.height;

      if (needHeight <= spaceBelow) {
        setFlipUp(false);

        return;
      }

      if (spaceAbove >= needHeight) {
        setFlipUp(true);

        return;
      }

      if (spaceAbove > spaceBelow) {
        setFlipUp(true);

        return;
      }

      setFlipUp(false);
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
          disabled={triggerProps()?.disabled === true}
          onChange={() => setOpen((v) => !v)}
        />
      </Show>
      <Show when={open()}>
        <div
          class="web-overflow-panel"
          classList={{ 'is-flip-up': flipUp() }}
          role="menu"
          ref={(el) => {
            panelEl = el;
          }}
        >
          <For each={menuItems()}>
            {(mi) => (
              <WebButton
                type="button"
                role="menuitem"
                class={`${elementClass(mi)} web-button`}
                data-story-target={mi.props?.storyTargetId}
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
                {mi.props?.label ?? ''}
              </WebButton>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function WebTreeItemElement(props: WebTreeItemProps) {
  const children = () => props.element.children ?? [];
  const summary = () => props.element.summary ?? children()[0] ?? null;

  const body = () =>
    props.element.summary === undefined ? children().slice(1) : children();

  const lazyLoadAction = () => props.element.props?.lazyLoadAction ?? null;
  const isLazyLoaded = () => props.element.props?.lazyLoaded === true;
  const hasChildren = () => body().length > 0 || lazyLoadAction() !== null;
  const expandedById = useContext(TreeItemExpandedStateContext);
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

    if (!id || !expandedById) {
      return props.element.props?.defaultExpanded ?? true;
    }

    const saved = expandedById.get(id);

    return saved ?? props.element.props?.defaultExpanded ?? true;
  };

  const [expanded, setExpanded] = createSignal(initialExpanded());
  const [lazyLoading, setLazyLoading] = createSignal(false);

  const bulkExpand = useContext(TreeBulkExpandContext);
  let lastBulkEpochApplied = 0;

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
              aria-expanded={expanded()}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded();
              }}
            >
              {expanded() ? '▾' : '▸'}
            </button>
          </Show>
          <Show when={summary()}>
            {(node) => (
              <WebNodeRenderer
                node={node()}
                onReplaceRoot={props.onReplaceRoot}
                onError={props.onError}
                promptRequestId={props.promptRequestId}
                onRunAction={props.onRunAction}
              />
            )}
          </Show>
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
            <For each={body()}>
              {(child) => (
                <WebNodeRenderer
                  node={child}
                  onReplaceRoot={props.onReplaceRoot}
                  onError={props.onError}
                  promptRequestId={props.promptRequestId}
                  onRunAction={props.onRunAction}
                />
              )}
            </For>
          </div>
        </Show>
        <Show when={hasChildren() && activeFilter().length > 0}>
          <div class="web-tree-item-children is-children is-filtered">
            <For each={body()}>
              {(child) => (
                <WebNodeRenderer
                  node={child}
                  onReplaceRoot={props.onReplaceRoot}
                  onError={props.onError}
                  promptRequestId={props.promptRequestId}
                  onRunAction={props.onRunAction}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

function WebCheckboxControl(props: WebCheckboxControlProps) {
  let inputEl: HTMLInputElement | undefined;

  createEffect(() => {
    if (inputEl) {
      inputEl.indeterminate = props.indeterminate;
    }
  });

  return (
    <input
      ref={(el) => {
        inputEl = el;

        if (el) {
          el.indeterminate = props.indeterminate;
        }
      }}
      type="checkbox"
      class={props.className}
      data-ui={props.dataUi}
      style={props.style}
      checked={props.checked}
      disabled={props.disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onChange();
      }}
      onChange={(e) => {
        e.preventDefault();
      }}
    />
  );
}

function elementStyle(node: WebElementNode): string | undefined {
  const p = node.props;
  const parts: string[] = [];

  if (typeof p?.indent === 'number') {
    parts.push(`margin-left:${p.indent * 1.25}rem`);
  }

  if (p?.gap) {
    parts.push(`gap:${GAP_REM[p.gap]}`);
  }

  if (p?.padding) {
    parts.push(`padding:${PADDING_REM[p.padding]}`);
  }

  if (node.tag === 'row' && p?.align) {
    parts.push(`justify-content:${ROW_JUSTIFY[p.align]}`);
  }

  if (node.tag === 'row' && p?.itemAlign) {
    parts.push(`align-items:${FLEX_ALIGN[p.itemAlign]}`);
  }

  if (node.tag === 'stack' && p?.align) {
    if (p.align === 'between') {
      parts.push('justify-content:space-between');
    } else {
      parts.push(`align-items:${FLEX_ALIGN[p.align]}`);
    }
  }

  if (p?.fill === true) {
    parts.push('flex:1', 'min-width:0');
  }

  if (p?.whiteSpace === 'pre-wrap') {
    parts.push('white-space:pre-wrap');
  }

  if (
    (node.tag === 'button' || node.tag === 'overflowMenu') &&
    p?.buttonVariant === 'icon'
  ) {
    parts.push(
      'flex-shrink:0',
      'min-width:2rem',
      'line-height:1',
      'padding:0.2rem 0.45rem',
      'font-size:1.15rem',
      'font-weight:600',
    );
  }

  return parts.length > 0 ? parts.join(';') : undefined;
}

function elementUi(node: WebElementNode): string | undefined {
  return node.props?.ui;
}

function WebTreeElement(props: WebTreeElementProps) {
  /** Nested `tree` nodes (e.g. older todo UI JSON) must not get their own header or provider. */
  const parentBulk = useContext(TreeBulkExpandContext);
  const renderMeta = useWebRenderMeta();
  const renderSurface = useContext(WebRenderSurfaceContext);
  const registerHoistedToolbar = useContext(WebTreeToolbarRegisterContext);
  const reportTreeHeaderEl = useContext(WebTreeHeaderElCallbackContext);
  const revealContext = useContext(WebRevealContext);

  const [bulk, setBulk] = createSignal<TreeBulkExpandState>({
    epoch: 0,
    expanded: true,
  });

  const [filterOpen, setFilterOpen] = createSignal(false);
  const [filterInput, setFilterInput] = createSignal('');
  const [filterQuery, setFilterQuery] = createSignal('');
  let filterInputEl: HTMLInputElement | undefined;
  let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  const filterEnabled = () => props.element.props?.filterable === true;
  const hasFilterValue = () => normalizedFilterQuery(filterInput()).length > 0;
  const showInlineHeader = () => renderSurface?.() !== 'timeline';

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
        arguments: {},
        options: {},
      },
      {
        onReplaceRoot: props.onReplaceRoot,
        promptRequestId: props.promptRequestId,
      },
    );
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
      runAction: (action) => {
        if (action.type === 'reveal') {
          revealContext?.reveal(action.targetId);

          return;
        }

        if (action.type === 'hideReveal') {
          revealContext?.hideReveal(action.targetId);

          return;
        }

        props.onRunAction?.(action, {
          onReplaceRoot: props.onReplaceRoot,
          promptRequestId: props.promptRequestId,
        });
      },
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
          {(child) => (
            <WebNodeRenderer
              node={child}
              onReplaceRoot={props.onReplaceRoot}
              onError={props.onError}
              promptRequestId={props.promptRequestId}
              onRunAction={props.onRunAction}
            />
          )}
        </For>
      </div>
    );
  }

  /**
   * Do not hoist tree children into JSX stored outside `<Provider>` — in Solid that can leave
   * `useContext(TreeBulkExpandContext)` undefined under `treeItem`. Keep `For` inside Provider.
   */
  return (
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
                  classList={{ 'is-open': filterOpen() || hasFilterValue() }}
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
            {(child) => (
              <WebNodeRenderer
                node={child}
                onReplaceRoot={props.onReplaceRoot}
                onError={props.onError}
                promptRequestId={props.promptRequestId}
                onRunAction={props.onRunAction}
              />
            )}
          </For>
        </div>
      </TreeFilterStateContext.Provider>
    </TreeBulkExpandContext.Provider>
  );
}

type WebFormElementProps = {
  element: WebElementNode;
  onRunAction: WebNodeRendererProps['onRunAction'];
  onReplaceRoot: WebNodeRendererProps['onReplaceRoot'];
  onError: WebNodeRendererProps['onError'];
  promptRequestId: WebNodeRendererProps['promptRequestId'];
};

function WebFormElement(props: WebFormElementProps): JSX.Element {
  let formEl: HTMLFormElement | undefined;

  createEffect(() => {
    if (props.element.props?.hiddenUntilRevealed !== true || !formEl) {
      return;
    }

    requestAnimationFrame(() => {
      formEl?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });
  });

  const onSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault();
    const action = props.element.props?.action;

    if (action == null) {
      props.onError?.('Form has no action.');

      return;
    }

    const formEl = event.currentTarget;
    const fd = new FormData(formEl);

    if (action.type === 'prompt_answer') {
      const fieldName = action.valueFromField;

      const fieldValue =
        typeof fieldName === 'string' ? fd.get(fieldName) : null;

      const suffix = typeof fieldValue === 'string' ? fieldValue.trim() : '';

      props.onRunAction?.(
        {
          ...action,
          type: 'prompt_answer',
          value:
            suffix.length > 0
              ? `${action.value} ${suffix}`.trim()
              : action.value,
        },
        {
          onReplaceRoot: props.onReplaceRoot,
          promptRequestId: props.promptRequestId,
        },
      );

      return;
    }

    if (action.type === 'clientAction') {
      const mergedPayload: Record<string, unknown> = {
        ...(action.payload ?? {}),
      };

      for (const [key, value] of fd.entries()) {
        if (typeof value === 'string') {
          mergedPayload[key] = value;
        }
      }

      props.onRunAction?.(
        {
          ...action,
          payload: mergedPayload,
        },
        {
          onReplaceRoot: props.onReplaceRoot,
          promptRequestId: props.promptRequestId,
        },
      );

      return;
    }

    if (action.type !== 'command') {
      props.onError?.(
        'Form action must be a command, clientAction, or prompt_answer WebAction.',
      );

      return;
    }

    const mergedArgs: Record<string, unknown> = {
      ...(action.arguments ?? {}),
    };

    for (const [key, value] of fd.entries()) {
      if (typeof value === 'string') {
        mergedArgs[key] = value;
      }
    }

    const merged: WebAction = {
      ...action,
      type: 'command',
      arguments: mergedArgs,
    };

    props.onRunAction?.(merged, {
      onReplaceRoot: props.onReplaceRoot,
      promptRequestId: props.promptRequestId,
    });
  };

  return (
    <form
      ref={(el) => {
        formEl = el;
      }}
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
      onSubmit={onSubmit}
      novalidate
    >
      <For each={props.element.children ?? []}>
        {(child) => (
          <WebNodeRenderer
            node={child}
            onReplaceRoot={props.onReplaceRoot}
            onError={props.onError}
            promptRequestId={props.promptRequestId}
            onRunAction={props.onRunAction}
          />
        )}
      </For>
    </form>
  );
}

type WebTextFieldNodeProps = {
  element: WebElementNode;
};

function WebTextFieldNode(props: WebTextFieldNodeProps): JSX.Element {
  const getBusy = useContext(WebShadowUiBusyContext);
  const name = props.element.props?.formFieldName;
  let inputEl: HTMLInputElement | undefined;

  createEffect(() => {
    const targetId = props.element.props?.storyTargetId;

    if (!targetId || !inputEl) {
      return;
    }

    registerStoryDomTarget(targetId, inputEl);
    onCleanup(() => registerStoryDomTarget(targetId, null));
  });

  createEffect(() => {
    const stop = onStoryFillForm((values) => {
      if (!inputEl || !name) {
        return;
      }

      const value = values.arguments[name] ?? values.options[name];

      if (typeof value === 'string' || typeof value === 'number') {
        inputEl.value = String(value);
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    });

    onCleanup(stop);
  });

  createEffect(() => {
    if (props.element.props?.autoFocus !== true || inputEl == null) {
      return;
    }

    queueMicrotask(() => {
      inputEl?.focus({ preventScroll: true });
    });
  });

  if (name == null || name.length === 0) {
    return null;
  }

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <input
        ref={(el) => {
          inputEl = el;
        }}
        class="web-textField__input"
        type="text"
        name={name}
        placeholder={props.element.props?.inputPlaceholder}
        disabled={props.element.props?.disabled === true || getBusy() === true}
        autocomplete="off"
      />
    </div>
  );
}

function resizeAutoGrowTextArea(
  el: HTMLTextAreaElement,
  maxRows: number,
): void {
  el.style.height = 'auto';

  const computed = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
  const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;

  const maxHeight =
    lineHeight * maxRows +
    borderTop +
    borderBottom +
    paddingTop +
    paddingBottom;

  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function WebTextAreaNode(props: WebTextFieldNodeProps): JSX.Element {
  const getBusy = useContext(WebShadowUiBusyContext);
  const name = props.element.props?.formFieldName;
  const maxRows = () => props.element.props?.maxRows ?? 4;
  let textareaEl: HTMLTextAreaElement | undefined;

  const resize = () => {
    if (!textareaEl) {
      return;
    }

    resizeAutoGrowTextArea(textareaEl, maxRows());
  };

  createEffect(() => {
    const targetId = props.element.props?.storyTargetId;

    if (!targetId || !textareaEl) {
      return;
    }

    registerStoryDomTarget(targetId, textareaEl);
    onCleanup(() => registerStoryDomTarget(targetId, null));
  });

  createEffect(() => {
    const stop = onStoryFillForm((values) => {
      if (!textareaEl || !name) {
        return;
      }

      const value = values.arguments[name] ?? values.options[name];

      if (typeof value === 'string' || typeof value === 'number') {
        textareaEl.value = String(value);
        textareaEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
        queueMicrotask(resize);
      }
    });

    onCleanup(stop);
  });

  createEffect(() => {
    if (props.element.props?.autoFocus !== true || textareaEl == null) {
      return;
    }

    queueMicrotask(() => {
      textareaEl?.focus({ preventScroll: true });
      resize();
    });
  });

  if (name == null || name.length === 0) {
    return null;
  }

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <textarea
        ref={(el) => {
          textareaEl = el;
          queueMicrotask(resize);
        }}
        class="web-textArea__input"
        name={name}
        rows={1}
        placeholder={props.element.props?.inputPlaceholder}
        disabled={props.element.props?.disabled === true || getBusy() === true}
        autocomplete="off"
        onInput={resize}
      />
    </div>
  );
}

function WebSelectNode(props: WebTextFieldNodeProps): JSX.Element {
  const getBusy = useContext(WebShadowUiBusyContext);
  const name = props.element.props?.formFieldName;
  let selectEl: HTMLSelectElement | undefined;

  createEffect(() => {
    const targetId = props.element.props?.storyTargetId;

    if (!targetId || !selectEl) {
      return;
    }

    registerStoryDomTarget(targetId, selectEl);
    onCleanup(() => registerStoryDomTarget(targetId, null));
  });

  createEffect(() => {
    if (props.element.props?.autoFocus !== true || selectEl == null) {
      return;
    }

    queueMicrotask(() => {
      selectEl?.focus({ preventScroll: true });
    });
  });

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <select
        ref={(el) => {
          selectEl = el;
        }}
        class="web-select__input"
        name={name}
        disabled={props.element.props?.disabled === true || getBusy() === true}
        value={
          props.element.props?.value ?? props.element.props?.choices?.[0] ?? ''
        }
      >
        <For each={props.element.props?.choices ?? []}>
          {(choice) => <option value={choice}>{choice}</option>}
        </For>
      </select>
    </div>
  );
}

function WebChoiceFieldNode(props: WebTextFieldNodeProps): JSX.Element {
  const choices = () => props.element.props?.choices ?? [];
  const customChoice = () => props.element.props?.customChoice ?? 'custom';

  const [selected, setSelected] = createSignal(
    props.element.props?.value ?? choices()[0] ?? '',
  );

  const name = props.element.props?.formFieldName;
  let customInputEl: HTMLInputElement | undefined;

  createEffect(() => {
    if (selected() !== customChoice() || customInputEl == null) {
      return;
    }

    queueMicrotask(() => customInputEl?.focus({ preventScroll: true }));
  });

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <Show when={selected() !== customChoice()}>
        <input type="hidden" name={name} value={selected()} />
      </Show>
      <div class="web-choiceField__choices">
        <For each={choices()}>
          {(choice) => (
            <WebButton
              type="button"
              class="web-choiceField__choice"
              classList={{ 'is-selected': selected() === choice }}
              onClick={() => setSelected(choice)}
            >
              {choice}
            </WebButton>
          )}
        </For>
      </div>
      <Show when={selected() === customChoice()}>
        <input
          ref={(el) => {
            customInputEl = el;
          }}
          class="web-choiceField__custom-input"
          name={name}
          type="number"
          min="1"
          inputMode="numeric"
          placeholder={props.element.props?.inputPlaceholder ?? 'Amount'}
          autocomplete="off"
        />
      </Show>
    </div>
  );
}

export function WebNodeRenderer(props: WebNodeRendererProps) {
  const getBusy = useContext(WebShadowUiBusyContext);
  const revealContext = useContext(WebRevealContext);
  const node = () => props.node ?? props.root?.tree;

  const runAction = (action: WebAction | undefined) => {
    if (!action) {
      return;
    }

    if (action.type === 'reveal') {
      revealContext?.reveal(action.targetId);

      return;
    }

    if (action.type === 'hideReveal') {
      revealContext?.hideReveal(action.targetId);

      return;
    }

    props.onRunAction?.(action, {
      onReplaceRoot: props.onReplaceRoot,
      promptRequestId: props.promptRequestId,
    });
  };

  return (
    <Switch fallback={null}>
      <Match when={node()?.type === 'text'}>
        {(node() as Extract<WebNode, { type: 'text' }>).value}
      </Match>

      <Match when={node()?.type === 'element'}>
        {(() => {
          const element = node() as WebElementNode;
          const revealId = element.props?.revealId;

          if (
            element.props?.hiddenUntilRevealed === true &&
            (!revealId || revealContext?.isRevealed(revealId) !== true)
          ) {
            return null;
          }

          return (
            <Switch>
              <Match when={element.tag === 'divider'}>
                <hr
                  class={elementClass(element)}
                  data-ui={elementUi(element)}
                />
              </Match>

              <Match when={element.tag === 'button'}>
                {(() => {
                  const htmlType = element.props?.htmlType ?? 'button';

                  const disabled =
                    element.props?.disabled === true || getBusy() === true;

                  if (htmlType === 'submit') {
                    return (
                      <WebButton
                        type="submit"
                        class={elementClass(element)}
                        data-ui={elementUi(element)}
                        data-story-target={element.props?.storyTargetId}
                        ref={(el) =>
                          element.props?.storyTargetId
                            ? registerStoryDomTarget(
                                element.props.storyTargetId,
                                el,
                              )
                            : undefined
                        }
                        style={elementStyle(element)}
                        disabled={disabled}
                        onClick={() => {
                          if (element.props?.storyTargetId) {
                            emitStoryTargetClicked(element.props.storyTargetId);
                          }
                        }}
                      >
                        {element.props?.label ?? ''}
                      </WebButton>
                    );
                  }

                  return (
                    <WebButton
                      type="button"
                      class={elementClass(element)}
                      data-ui={elementUi(element)}
                      data-story-target={element.props?.storyTargetId}
                      ref={(el) =>
                        element.props?.storyTargetId
                          ? registerStoryDomTarget(
                              element.props.storyTargetId,
                              el,
                            )
                          : undefined
                      }
                      style={elementStyle(element)}
                      disabled={disabled}
                      onClick={(e) => {
                        if (element.props?.stopPropagation) {
                          e.stopPropagation();
                        }

                        if (element.props?.storyTargetId) {
                          emitStoryTargetClicked(element.props.storyTargetId);
                        }

                        runAction(element.props?.action);
                      }}
                    >
                      {element.props?.label ?? ''}
                    </WebButton>
                  );
                })()}
              </Match>

              <Match when={element.tag === 'link'}>
                <a
                  class={elementClass(element)}
                  data-ui={elementUi(element)}
                  style={elementStyle(element)}
                  href={element.props?.href ?? '#'}
                  target={element.props?.external ? '_blank' : undefined}
                  rel={
                    element.props?.external ? 'noopener noreferrer' : undefined
                  }
                >
                  <For each={element.children ?? []}>
                    {(child) => (
                      <WebNodeRenderer
                        node={child}
                        onReplaceRoot={props.onReplaceRoot}
                        onError={props.onError}
                        promptRequestId={props.promptRequestId}
                        onRunAction={props.onRunAction}
                      />
                    )}
                  </For>
                </a>
              </Match>

              <Match when={element.tag === 'checkbox'}>
                <Show
                  when={element.props?.formFieldName}
                  fallback={
                    <WebCheckboxControl
                      className={elementClass(element)}
                      style={elementStyle(element)}
                      checked={Boolean(element.props?.checked)}
                      indeterminate={element.props?.indeterminate === true}
                      disabled={
                        element.props?.disabled ??
                        (element.props?.action ? false : true)
                      }
                      onChange={() => runAction(element.props?.action)}
                    />
                  }
                >
                  {(name) => (
                    <input
                      class={elementClass(element)}
                      data-ui={elementUi(element)}
                      style={elementStyle(element)}
                      type="checkbox"
                      name={name()}
                      value="true"
                      checked={element.props?.checked === true}
                      disabled={element.props?.disabled === true}
                    />
                  )}
                </Show>
              </Match>

              <Match when={element.tag === 'overflowMenu'}>
                <WebOverflowMenuElement
                  element={element}
                  runAction={runAction}
                />
              </Match>

              <Match when={element.tag === 'tree'}>
                <WebTreeElement
                  element={element}
                  onReplaceRoot={props.onReplaceRoot}
                  onError={props.onError}
                  promptRequestId={props.promptRequestId}
                  onRunAction={props.onRunAction}
                />
              </Match>

              <Match when={element.tag === 'treeItem'}>
                <WebTreeItemElement
                  element={element}
                  onReplaceRoot={props.onReplaceRoot}
                  onError={props.onError}
                  promptRequestId={props.promptRequestId}
                  onRunAction={props.onRunAction}
                />
              </Match>

              <Match when={element.tag === 'menuItem'}>
                <WebButton
                  type="button"
                  role="menuitem"
                  class={`${elementClass(element)} web-button`}
                  data-ui={elementUi(element)}
                  data-story-target={element.props?.storyTargetId}
                  ref={(el) =>
                    element.props?.storyTargetId
                      ? registerStoryDomTarget(element.props.storyTargetId, el)
                      : undefined
                  }
                  style={elementStyle(element)}
                  disabled={
                    element.props?.disabled === true || getBusy() === true
                  }
                  onClick={(e) => {
                    if (element.props?.stopPropagation) {
                      e.stopPropagation();
                    }

                    if (element.props?.storyTargetId) {
                      emitStoryTargetClicked(element.props.storyTargetId);
                    }

                    runAction(element.props?.action);
                  }}
                >
                  {element.props?.label ?? ''}
                </WebButton>
              </Match>

              <Match when={element.tag === 'form'}>
                <WebFormElement
                  element={element}
                  onRunAction={props.onRunAction}
                  onReplaceRoot={props.onReplaceRoot}
                  onError={props.onError}
                  promptRequestId={props.promptRequestId}
                />
              </Match>

              <Match when={element.tag === 'textField'}>
                <WebTextFieldNode element={element} />
              </Match>

              <Match when={element.tag === 'select'}>
                <WebSelectNode element={element} />
              </Match>

              <Match when={element.tag === 'choiceField'}>
                <WebChoiceFieldNode element={element} />
              </Match>

              <Match when={element.tag === 'textArea'}>
                <WebTextAreaNode element={element} />
              </Match>

              <Match when={element.tag === 'badge'}>
                <span
                  class={elementClass(element)}
                  data-ui={elementUi(element)}
                  style={elementStyle(element)}
                >
                  {element.props?.label ?? ''}
                </span>
              </Match>

              <Match when={element.tag === 'image'}>
                <img
                  class={elementClass(element)}
                  data-ui={elementUi(element)}
                  style={elementStyle(element)}
                  src={element.props?.src ?? ''}
                  alt={element.props?.alt ?? ''}
                  aria-hidden={element.props?.alt ? undefined : 'true'}
                />
              </Match>

              <Match when={element.tag === 'text'}>
                {(() => {
                  const ui = element.props?.ui ?? '';

                  if (ui.startsWith('hljs-code')) {
                    const langPart = ui.includes(':') ? ui.split(':')[1] : null;

                    const language =
                      langPart !== null && langPart.length > 0
                        ? langPart
                        : null;

                    return (
                      <HljsHighlightedSpan
                        element={element}
                        language={language}
                      />
                    );
                  }

                  return (
                    <span
                      class={elementClass(element)}
                      data-ui={elementUi(element)}
                      style={elementStyle(element)}
                    >
                      <For each={element.children ?? []}>
                        {(child) => (
                          <WebNodeRenderer
                            node={child}
                            onReplaceRoot={props.onReplaceRoot}
                            onError={props.onError}
                            promptRequestId={props.promptRequestId}
                            onRunAction={props.onRunAction}
                          />
                        )}
                      </For>
                    </span>
                  );
                })()}
              </Match>

              <Match when={true}>
                {(() => {
                  if (element.props?.ttsText != null) {
                    return (
                      <SpeechHighlightBox
                        element={element}
                        onReplaceRoot={props.onReplaceRoot}
                        onError={props.onError}
                        promptRequestId={props.promptRequestId}
                        speechSentences={props.speechSentences}
                        activeSpeechSentenceIndex={
                          props.activeSpeechSentenceIndex
                        }
                        onSpeechSentenceClick={props.onSpeechSentenceClick}
                        onRunAction={props.onRunAction}
                      />
                    );
                  }

                  return (
                    <div
                      class={elementClass(element)}
                      data-ui={elementUi(element)}
                      data-story-target={element.props?.storyTargetId}
                      ref={(el) => {
                        if (element.props?.storyTargetId) {
                          registerStoryDomTarget(
                            element.props.storyTargetId,
                            el,
                          );
                        }

                        if (element.props?.autoFocus === true) {
                          queueMicrotask(() => el.focus());
                        }
                      }}
                      style={elementStyle(element)}
                      role={element.props?.action ? 'button' : undefined}
                      tabIndex={
                        element.props?.action ||
                        element.props?.autoFocus === true
                          ? 0
                          : undefined
                      }
                      onMouseEnter={() => {
                        if (element.props?.storyTargetId) {
                          emitStoryTargetHovered(element.props.storyTargetId);
                        }
                      }}
                      onClick={() => {
                        if (element.props?.storyTargetId) {
                          emitStoryTargetClicked(element.props.storyTargetId);
                        }

                        runAction(element.props?.action);
                      }}
                      onKeyDown={(e) => {
                        if (!element.props?.action) {
                          return;
                        }

                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          runAction(element.props.action);
                        }
                      }}
                    >
                      <For each={element.children ?? []}>
                        {(child) => (
                          <WebNodeRenderer
                            node={child}
                            onReplaceRoot={props.onReplaceRoot}
                            onError={props.onError}
                            promptRequestId={props.promptRequestId}
                            speechSentences={props.speechSentences}
                            activeSpeechSentenceIndex={
                              props.activeSpeechSentenceIndex
                            }
                            onSpeechSentenceClick={props.onSpeechSentenceClick}
                            onRunAction={props.onRunAction}
                          />
                        )}
                      </For>
                    </div>
                  );
                })()}
              </Match>
            </Switch>
          );
        })()}
      </Match>
    </Switch>
  );
}
