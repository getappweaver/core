import hljs from 'highlight.js';
import {
  For,
  Switch,
  Match,
  Show,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
} from 'solid-js';
import type { Accessor, JSX } from 'solid-js';

import type {
  WebAction,
  WebElementNode,
  WebNode,
  WebNodeRoot,
} from '@src/web/ui-schema';

type WebNodeRendererProps = {
  root?: WebNodeRoot;
  node?: WebNode;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  onRunAction?: (
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
    },
  ) => void;
};

type HljsHighlightedSpanProps = {
  element: WebElementNode;
  language: string | null;
};

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

function elementClass(node: WebElementNode): string {
  const classes = ['web-node', `web-${node.tag}`];
  const tone = node.props?.tone;

  if (tone) {
    classes.push(`tone-${tone}`);
  }

  if (node.props?.className) {
    classes.push(node.props.className);
  }

  if (node.props?.size) {
    classes.push(`size-${node.props.size}`);
  }

  if (node.props?.weight) {
    classes.push(`weight-${node.props.weight}`);
  }

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

type WebTreeElementProps = {
  element: WebElementNode;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  onRunAction?: WebNodeRendererProps['onRunAction'];
};

const OVERFLOW_PANEL_GAP_PX = 6;

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
    n = n.parentElement;
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
    n = n.parentElement;
  }

  return out;
}

function WebOverflowMenuElement(props: WebOverflowMenuProps) {
  const [open, setOpen] = createSignal(false);
  const [flipUp, setFlipUp] = createSignal(false);
  let rootEl: HTMLDivElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  createEffect(() => {
    if (!open()) return;
    const timeoutId = window.setTimeout(() => {
      const onPointerDown = (e: PointerEvent) => {
        const target = e.target as Node | null;
        if (target && rootEl && !rootEl.contains(target)) {
          setOpen(false);
        }
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      onCleanup(() =>
        document.removeEventListener('pointerdown', onPointerDown, true),
      );
    }, 0);
    onCleanup(() => {
      window.clearTimeout(timeoutId);
    });
  });

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
      classList={{ 'is-open': open() }}
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
      <button
        type="button"
        class={`web-overflow-trigger ${elementClass(triggerPresentation)}`}
        data-ui={props.element.props?.ui ?? 'three-dot-item-button'}
        style={elementStyle(props.element)}
        aria-expanded={open()}
        aria-haspopup="true"
        aria-label="More actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open());
        }}
      >
        {props.element.props?.label ?? '\u22EE'}
      </button>
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
              <button
                type="button"
                role="menuitem"
                class={`${elementClass(mi)} web-button`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  props.runAction(mi.props?.action);
                }}
              >
                {mi.props?.label ?? ''}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function WebTreeItemElement(props: WebTreeItemProps) {
  const children = () => props.element.children ?? [];
  const summary = () => children()[0] ?? null;
  const body = () => children().slice(1);
  const hasChildren = () => body().length > 0;
  const [expanded, setExpanded] = createSignal(
    props.element.props?.defaultExpanded ?? true,
  );
  const bulkExpand = useContext(TreeBulkExpandContext);
  let lastBulkEpochApplied = 0;

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
    <div class={elementClass(props.element)} data-ui={elementUi(props.element)}>
      <div class="web-tree-item-summary">
        <Show
          when={hasChildren()}
          fallback={<span class="web-tree-toggle web-tree-toggle-spacer" />}
        >
          <button
            type="button"
            class="web-tree-toggle"
            data-ui="tree-item-toggle"
            aria-expanded={expanded()}
            onClick={() => setExpanded(!expanded())}
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
      <Show when={!hasChildren() || expanded()}>
        <div class="web-tree-item-children is-children">
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
      style={props.style}
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
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
  const [bulk, setBulk] = createSignal<TreeBulkExpandState>({
    epoch: 0,
    expanded: true,
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
      <div
        class={elementClass(props.element)}
        data-ui={elementUi(props.element)}
        style={elementStyle(props.element)}
      >
        <div class="web-tree-header">
          <button
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
          </button>
          <button
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
          </button>
        </div>
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
    </TreeBulkExpandContext.Provider>
  );
}

export function WebNodeRenderer(props: WebNodeRendererProps) {
  const node = () => props.node ?? props.root?.tree;

  const runAction = (action: WebAction | undefined) => {
    if (!action) {
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

          return (
            <Switch>
              <Match when={element.tag === 'divider'}>
                <hr
                  class={elementClass(element)}
                  data-ui={elementUi(element)}
                />
              </Match>

              <Match when={element.tag === 'button'}>
                <button
                  type="button"
                  class={elementClass(element)}
                  data-ui={elementUi(element)}
                  style={elementStyle(element)}
                  disabled={element.props?.disabled}
                  onClick={() => runAction(element.props?.action)}
                >
                  {element.props?.label ?? ''}
                </button>
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

              <Match when={element.tag === 'menuItem'}>{null}</Match>

              <Match when={element.tag === 'badge'}>
                <span
                  class={elementClass(element)}
                  data-ui={elementUi(element)}
                  style={elementStyle(element)}
                >
                  {element.props?.label ?? ''}
                </span>
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
                <div
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
                </div>
              </Match>
            </Switch>
          );
        })()}
      </Match>
    </Switch>
  );
}
