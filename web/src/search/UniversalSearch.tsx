import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Accessor,
} from 'solid-js';

import {
  resourceAddressFromHash,
  ResourceViewV1,
  type ResourceAddress,
} from '@src/capabilities/resource-view.v1';
import { SearchV1, type SearchResultV1 } from '@src/capabilities/search.v1';
import type { CapabilityProviderSummary } from '@src/capabilities/types';
import {
  searchProviders,
  type SearchInvocation,
  type SearchSourceState,
} from '@src/core/search/coordinator';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';

import { WebNodeShadowRoot } from '../components/WebNodeShadowRoot';
import type { PendingRequest } from '../socket/types';

import './universal-search.css';

const DISABLED_SEARCH_SOURCES_STORAGE_KEY =
  'appweaver:universalSearch:disabledSources';

function readDisabledSearchSources(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(
      DISABLED_SEARCH_SOURCES_STORAGE_KEY,
    );

    if (!raw) {
      return new Set();
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(
      parsed.filter((item): item is string => typeof item === 'string'),
    );
  } catch {
    return new Set();
  }
}

function writeDisabledSearchSources(sources: Set<string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (sources.size === 0) {
      window.localStorage.removeItem(DISABLED_SEARCH_SOURCES_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        DISABLED_SEARCH_SOURCES_STORAGE_KEY,
        JSON.stringify([...sources]),
      );
    }
  } catch {
    // Ignore storage write errors.
  }
}

const SEARCH_TREE_CSS = `
.universal-search__source-icon {
  width: 1rem;
  height: 1rem;
  flex: none;
}

.universal-search__hit.web-button {
  display: grid;
  gap: 0.15rem;
  width: 100%;
  min-width: 0;
  padding: 0.3rem 0.4rem;
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none;
  color: var(--color-text);
  font-weight: 500;
  text-align: left;
  overflow-wrap: anywhere;
}

.universal-search__hit.web-button:hover,
.universal-search__hit.web-button:focus-visible {
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  box-shadow: none;
  transform: none;
}

.universal-search__hit.web-button:focus-visible {
  outline: 1px solid var(--color-warning);
  outline-offset: -1px;
}

.universal-search__hit-title {
  display: block;
  font-size: 0.85rem;
}

.universal-search__hit-context {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 400;
}

.universal-search__tree-notice {
  display: block;
  padding: 0.1rem 0;
}

.universal-search__more.web-button {
  width: fit-content;
  margin-top: 0.15rem;
}
`;

function buildHitTreeItem(providerId: string, hit: SearchResultV1): WebNode {
  return {
    type: 'element',
    tag: 'treeItem',
    renderKey: `hit:${hit.id}`,
    props: {
      id: `search-hit:${providerId}:${hit.id}`,
    },
    children: [
      {
        type: 'element',
        tag: 'button',
        props: {
          ui: 'search-result',
          className: 'universal-search__hit',
          fill: true,
          ariaLabel: hit.text,
          action: {
            type: 'capability',
            operation: ResourceViewV1.operations.open.id,
            consumerAlias: 'core:search',
            providerId: hit.address.providerId,
            input: {
              resourceType: hit.address.resourceType,
              resourceId: hit.address.resourceId,
            },
            selection: 'auto',
            surface: hit.address.surface ?? 'modal',
            modalTitle: hit.text,
          },
        },
        children: [
          {
            type: 'element',
            tag: 'text',
            props: {
              className: 'universal-search__hit-title',
              weight: 'medium',
            },
            children: [{ type: 'text', value: hit.text }],
          },
          ...(hit.context
            ? [
                {
                  type: 'element' as const,
                  tag: 'text' as const,
                  props: {
                    className: 'universal-search__hit-context',
                    tone: 'muted' as const,
                    size: 'sm' as const,
                  },
                  children: [{ type: 'text' as const, value: hit.context }],
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function buildSourceTreeItem(source: SearchSourceState): WebNode {
  const results = source.output?.results ?? [];
  const notices = source.output?.notices ?? [];
  const children: WebNode[] = [];

  for (let index = 0; index < notices.length; index += 1) {
    children.push({
      type: 'element',
      tag: 'text',
      renderKey: `notice:${index}`,
      props: {
        className: 'universal-search__tree-notice',
        tone: 'muted',
        size: 'sm',
      },
      children: [{ type: 'text', value: notices[index]! }],
    });
  }

  const subTypeBuckets = new Map<string, SearchResultV1[]>();

  for (const hit of results) {
    const subType = hit.address.resourceType;
    const existing = subTypeBuckets.get(subType);

    if (existing) {
      existing.push(hit);
    } else {
      subTypeBuckets.set(subType, [hit]);
    }
  }

  if (subTypeBuckets.size > 1) {
    for (const [subType, groupHits] of subTypeBuckets) {
      children.push({
        type: 'element',
        tag: 'treeItem',
        renderKey: `subtype:${subType}`,
        props: {
          id: `search-subtype:${source.provider.providerId}:${subType}`,
          defaultExpanded: true,
        },
        summary: {
          type: 'element',
          tag: 'row',
          props: {
            align: 'between',
            itemAlign: 'center',
            gap: 'sm',
            fill: true,
          },
          children: [
            {
              type: 'element',
              tag: 'text',
              props: { weight: 'medium', tone: 'info', size: 'sm' },
              children: [{ type: 'text', value: subType }],
            },
            {
              type: 'element',
              tag: 'text',
              props: { tone: 'muted', size: 'sm' },
              children: [
                { type: 'text', value: `${groupHits.length} results` },
              ],
            },
          ],
        },
        children: groupHits.map((hit) =>
          buildHitTreeItem(source.provider.providerId, hit),
        ),
      });
    }
  } else {
    for (const hit of results) {
      children.push(buildHitTreeItem(source.provider.providerId, hit));
    }
  }

  if (source.status === 'loading' && results.length === 0) {
    children.push({
      type: 'element',
      tag: 'text',
      renderKey: 'loading',
      props: {
        className: 'universal-search__tree-notice',
        tone: 'muted',
        size: 'sm',
      },
      children: [{ type: 'text', value: 'Searching…' }],
    });
  }

  if (source.status === 'ready' && results.length === 0) {
    children.push({
      type: 'element',
      tag: 'text',
      renderKey: 'empty',
      props: {
        className: 'universal-search__tree-notice',
        tone: 'muted',
        size: 'sm',
      },
      children: [{ type: 'text', value: 'No matches.' }],
    });
  }

  if (source.error) {
    children.push({
      type: 'element',
      tag: 'text',
      renderKey: 'error',
      props: {
        className: 'universal-search__tree-notice',
        tone: 'danger',
        size: 'sm',
      },
      children: [{ type: 'text', value: source.error }],
    });
  }

  if (
    source.status !== 'loading' &&
    (source.error || source.output?.nextCursor)
  ) {
    children.push({
      type: 'element',
      tag: 'button',
      renderKey: 'more',
      props: {
        className: 'universal-search__more',
        label: source.error ? 'Retry source' : 'More results',
        action: {
          type: 'clientAction',
          action: 'search.loadMore',
          payload: { providerId: source.provider.providerId },
        },
      },
    });
  }

  return {
    type: 'element',
    tag: 'treeItem',
    renderKey: source.provider.providerId,
    props: {
      id: `search-source:${source.provider.providerId}`,
      defaultExpanded: true,
    },
    summary: {
      type: 'element',
      tag: 'row',
      props: {
        align: 'between',
        itemAlign: 'center',
        gap: 'sm',
        fill: true,
      },
      children: [
        {
          type: 'element',
          tag: 'row',
          props: { itemAlign: 'center', gap: 'xs' },
          children: [
            ...(source.provider.source.iconUrl
              ? [
                  {
                    type: 'element' as const,
                    tag: 'image' as const,
                    props: {
                      src: source.provider.source.iconUrl,
                      alt: '',
                      className: 'universal-search__source-icon',
                    },
                  },
                ]
              : []),
            {
              type: 'element',
              tag: 'text',
              props: { weight: 'semibold', tone: 'warning' },
              children: [{ type: 'text', value: source.provider.source.title }],
            },
          ],
        },
        {
          type: 'element',
          tag: 'text',
          props: { tone: 'muted', size: 'sm' },
          children: [
            {
              type: 'text',
              value:
                source.status === 'loading'
                  ? 'Searching…'
                  : `${results.length} results`,
            },
          ],
        },
      ],
    },
    children,
  };
}

type UniversalSearchProps = {
  open: Accessor<boolean>;
  connected: Accessor<boolean>;
  timelineId: Accessor<string>;
  workspace: Accessor<string>;
  pendingRequests: Map<string, PendingRequest>;
  send: (message: unknown) => void;
  onClose: () => void;
  onOpenAddress: (address: ResourceAddress, title: string) => void;
};

export function UniversalSearch(props: UniversalSearchProps) {
  const [query, setQuery] = createSignal('');

  const [disabledSources, setDisabledSources] = createSignal<Set<string>>(
    readDisabledSearchSources(),
  );

  const [providers, setProviders] = createSignal<CapabilityProviderSummary[]>(
    [],
  );

  const [providerStatus, setProviderStatus] = createSignal('');
  const [sources, setSources] = createSignal<SearchSourceState[]>([]);
  const [refreshEpoch, setRefreshEpoch] = createSignal(0);
  let input: HTMLInputElement | undefined;
  let dialog: HTMLDivElement | undefined;
  let activeSearch: AbortController | null = null;
  let lastHash = '';

  const activeProviders = createMemo(() => {
    const disabled = disabledSources();

    return providers().filter((provider) => !disabled.has(provider.providerId));
  });

  const resultsRoot = createMemo<WebNodeRoot | null>(() => {
    const currentSources = sources();

    if (currentSources.length === 0) {
      return null;
    }

    return {
      kind: 'ui',
      version: 1,
      meta: { command: 'search', subcommand: 'refresh' },
      stylesheets: [{ id: 'universal-search-tree', cssText: SEARCH_TREE_CSS }],
      tree: {
        type: 'element',
        tag: 'tree',
        props: { gap: 'sm' },
        children: currentSources.map(buildSourceTreeItem),
      },
    };
  });

  function toggleSource(providerId: string): void {
    setDisabledSources((previous) => {
      const next = new Set(previous);

      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }

      writeDisabledSearchSources(next);

      return next;
    });
  }

  // All transport callbacks are bounded and removed when superseded or unmounted.
  function request<T>(
    message: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      let settled = false;

      const finish = (value: T | null, error: string | null) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        props.pendingRequests.delete(requestId);

        if (error) {
          reject(new Error(error));
        } else {
          resolve(value as T);
        }
      };

      const abort = () => finish(null, 'Search cancelled.');

      const timer = setTimeout(
        () => finish(null, 'Search timed out. Retry this source.'),
        8000,
      );

      if (signal.aborted) {
        abort();

        return;
      }

      signal.addEventListener('abort', abort, { once: true });

      props.pendingRequests.set(requestId, {
        suppressErrorUi: true,
        recordInTimeline: false,
        onCapabilityProvidersResult: (message) =>
          finish(message.providers as T, null),
        onCapabilityResult: (message) => finish(message.output as T, null),
        onError: (message) => finish(null, message.message),
        onDone: () => finish(null, 'Source returned no search response.'),
      });

      try {
        props.send({ ...message, requestId });
      } catch (error) {
        finish(null, error instanceof Error ? error.message : String(error));
      }
    });
  }

  function invoke({ providerId, input, signal }: SearchInvocation) {
    return request<unknown>(
      {
        type: 'run_capability',
        timelineId: props.timelineId(),
        operation: SearchV1.operations.search.id,
        consumerAlias: 'core:search',
        providerId,
        input,
        resultFormat: 'json',
      },
      signal,
    );
  }

  function updateSource(source: SearchSourceState): void {
    setSources((previous) => {
      const existing = previous.find(
        (entry) => entry.provider.providerId === source.provider.providerId,
      );

      if (!existing) {
        return previous;
      }

      const wasInitialLoading =
        existing.status === 'loading' && existing.output === null;

      if (wasInitialLoading && source.status !== 'loading') {
        const rest = previous.filter(
          (entry) => entry.provider.providerId !== source.provider.providerId,
        );

        const firstPendingIndex = rest.findIndex(
          (entry) => entry.status === 'loading' && entry.output === null,
        );

        if (firstPendingIndex === -1) {
          return [...rest, source];
        }

        return [
          ...rest.slice(0, firstPendingIndex),
          source,
          ...rest.slice(firstPendingIndex),
        ];
      }

      return previous.map((entry) =>
        entry.provider.providerId === source.provider.providerId
          ? source
          : entry,
      );
    });
  }

  createEffect(() => {
    const connected = props.connected();
    const open = props.open();
    props.workspace();
    props.timelineId();
    setProviders([]);
    setSources([]);

    if (!open || !connected) {
      return;
    }

    const controller = new AbortController();
    setProviderStatus('Loading search sources…');

    void request<CapabilityProviderSummary[]>(
      { type: 'list_capability_providers', capability: SearchV1.capability },
      controller.signal,
    )
      .then((available) => {
        if (controller.signal.aborted) {
          return;
        }

        setProviders(available);

        setDisabledSources((previous) => {
          const ids = new Set(available.map((provider) => provider.providerId));
          const next = new Set([...previous].filter((id) => ids.has(id)));

          if (next.size !== previous.size) {
            writeDisabledSearchSources(next);
          }

          return next;
        });

        setProviderStatus(
          available.length ? '' : 'No installed apps provide search:v1.',
        );
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          setProviderStatus(error.message);
        }
      });

    onCleanup(() => controller.abort());
  });

  createEffect(() => {
    const open = props.open();
    const connected = props.connected();
    const text = query().trim();
    const available = activeProviders();

    refreshEpoch();
    props.timelineId();
    props.workspace();
    activeSearch?.abort();
    const controller = new AbortController();
    activeSearch = controller;
    setSources([]);

    if (!open || !connected || !text || !available.length) {
      return;
    }

    setSources(
      available.map((provider) => ({
        provider,
        status: 'loading',
        output: null,
        error: null,
      })),
    );

    const timer = setTimeout(() => {
      void searchProviders({
        providers: available,
        input: { query: text, limit: 10, cursor: null },
        signal: controller.signal,
        invoke,
        onSource: updateSource,
      });
    }, 250);

    onCleanup(() => {
      clearTimeout(timer);
      controller.abort();
    });
  });

  function loadMore(source: SearchSourceState): void {
    if (
      source.status === 'loading' ||
      !activeSearch ||
      activeSearch.signal.aborted
    ) {
      return;
    }

    const previous = source.output;

    void searchProviders({
      providers: [source.provider],
      input: {
        query: query().trim(),
        limit: 10,
        cursor: previous?.nextCursor ?? null,
      },
      signal: activeSearch.signal,
      invoke,
      onSource: (next) => {
        if (next.status === 'ready' && next.output && previous) {
          const seen = new Set(previous.results.map((hit) => hit.id));

          next.output.results = [
            ...previous.results,
            ...next.output.results.filter((hit) => !seen.has(hit.id)),
          ];

          next.output.notices = [
            ...new Set([...previous.notices, ...next.output.notices]),
          ];
        } else if (next.status !== 'ready') {
          next.output = previous;
        }

        updateSource(next);
      },
    });
  }

  function openAddress(address: ResourceAddress, title: string): void {
    props.onClose();
    props.onOpenAddress(address, title);
  }

  function handleTreeAction(action: WebAction): void {
    if (
      action.type === 'capability' &&
      action.operation === ResourceViewV1.operations.open.id &&
      action.providerId
    ) {
      const inputRecord =
        typeof action.input === 'object' && action.input !== null
          ? (action.input as Record<string, unknown>)
          : null;

      if (
        typeof inputRecord?.resourceType === 'string' &&
        typeof inputRecord?.resourceId === 'string'
      ) {
        openAddress(
          {
            capability: ResourceViewV1.capability,
            providerId: action.providerId,
            resourceType: inputRecord.resourceType,
            resourceId: inputRecord.resourceId,
            surface: action.surface,
          },
          action.modalTitle ?? 'Resource',
        );
      }

      return;
    }

    if (
      action.type === 'clientAction' &&
      action.action === 'search.loadMore' &&
      typeof action.payload?.providerId === 'string'
    ) {
      const source = sources().find(
        (entry) => entry.provider.providerId === action.payload?.providerId,
      );

      if (source) {
        loadMore(source);
      }

      return;
    }

    if (
      action.type === 'command' &&
      action.command === 'search' &&
      action.subcommand === 'refresh'
    ) {
      setRefreshEpoch((epoch) => epoch + 1);
    }
  }

  function openHash(): void {
    if (!props.connected() || !props.timelineId()) {
      return;
    }

    const hash = window.location.hash;

    if (!hash) {
      lastHash = '';

      return;
    }

    if (lastHash === hash) {
      return;
    }

    const address = resourceAddressFromHash(hash);

    if (!address) {
      return;
    }

    lastHash = hash;
    openAddress(address, 'Resource');
  }

  createEffect(() => {
    props.connected();
    props.timelineId();
    openHash();
  });

  onMount(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === DISABLED_SEARCH_SOURCES_STORAGE_KEY
      ) {
        setDisabledSources(readDisabledSearchSources());
      }
    };

    window.addEventListener('hashchange', openHash);
    window.addEventListener('storage', handleStorage);

    onCleanup(() => {
      window.removeEventListener('hashchange', openHash);
      window.removeEventListener('storage', handleStorage);
    });
  });

  createEffect(() => {
    if (!props.open()) {
      return;
    }

    const previousFocus = document.activeElement;
    queueMicrotask(() => input?.focus());

    onCleanup(() => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    });
  });

  function handleKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();

      return;
    }

    const shadowRoot =
      dialog?.querySelector('.web-ui-shadow-host')?.shadowRoot ?? null;

    const activeElement = (shadowRoot?.activeElement ??
      document.activeElement) as HTMLElement | null;

    const lightFocusable = Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'input, select, button:not(:disabled), a[href]',
      ) ?? [],
    );

    const shadowFocusable = Array.from(
      shadowRoot?.querySelectorAll<HTMLElement>(
        'input, select, button:not(:disabled), a[href]',
      ) ?? [],
    );

    const focusable = [...lightFocusable, ...shadowFocusable];

    if (event.key === 'Tab' && focusable.length > 0) {
      const index = activeElement ? focusable.indexOf(activeElement) : -1;

      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && index === focusable.length - 1) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const results = Array.from(
        shadowRoot?.querySelectorAll<HTMLElement>(
          '[data-ui="search-result"]',
        ) ?? [],
      );

      if (!results.length) {
        return;
      }

      const current = activeElement ? results.indexOf(activeElement) : -1;
      event.preventDefault();

      const next =
        current < 0
          ? event.key === 'ArrowDown'
            ? 0
            : results.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : results.length - 1)) %
            results.length;

      results[next]?.focus();
    }

    if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();

      shadowRoot
        ?.querySelector<HTMLElement>('[data-ui="search-result"]')
        ?.click();
    }
  }

  return (
    <Show when={props.open()}>
      <div
        class="modal-backdrop universal-search-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div
          class="modal universal-search"
          role="dialog"
          aria-modal="true"
          aria-labelledby="universal-search-title"
          ref={dialog}
          onKeyDown={handleKeys}
        >
          <div class="modal-header">
            <div class="modal-title" id="universal-search-title">
              Universal search
            </div>
            <button
              type="button"
              class="close-btn"
              aria-label="Close"
              onClick={props.onClose}
            >
              ✕
            </button>
          </div>
          <div class="modal-body">
            <div class="universal-search__controls">
              <input
                ref={input}
                type="text"
                aria-label="Search installed apps"
                placeholder="Search installed apps…"
                maxLength={500}
                value={query()}
                onInput={(event) => {
                  setQuery(event.currentTarget.value);
                }}
              />
            </div>
            <Show when={providers().length > 0}>
              <div
                class="universal-search__sources"
                role="group"
                aria-label="Search sources"
              >
                <For each={providers()}>
                  {(provider) => {
                    const active = () =>
                      !disabledSources().has(provider.providerId);

                    return (
                      <button
                        type="button"
                        class="universal-search__source-chip"
                        classList={{ 'is-active': active() }}
                        aria-pressed={active()}
                        onClick={() => toggleSource(provider.providerId)}
                      >
                        <Show when={provider.source.iconUrl}>
                          {(url) => (
                            <img src={url()} alt="" aria-hidden="true" />
                          )}
                        </Show>
                        <span>{provider.source.title}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
            <div class="universal-search__status" role="status">
              {!props.connected()
                ? 'Connect to search installed apps.'
                : providerStatus() ||
                  (providers().length > 0 && activeProviders().length === 0
                    ? 'Select at least one search source.'
                    : !query().trim()
                      ? 'Type to search. ↑/↓ to move, Enter to open.'
                      : '')}
            </div>
            <Show when={resultsRoot()}>
              {(root) => (
                <div class="universal-search__results">
                  <WebNodeShadowRoot
                    root={root()}
                    stateScopeId="universal-search"
                    renderSurface="modal"
                    onRunAction={handleTreeAction}
                  />
                </div>
              )}
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
