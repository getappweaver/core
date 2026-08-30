import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';

import { globToRegex } from '../../components/web-node/tree-filter';
import type { PendingRequest } from '../../socket/types';

type ComposerFilePickerProps = {
  textareaRef: () => HTMLTextAreaElement | undefined;
  composerText: () => string;
  setComposerText: (value: string) => void;
  wsConnected: () => boolean;
  pendingRequests: Map<string, PendingRequest>;
  sendSocketMessage: (message: unknown) => void;
  createId: () => string;
  timelineId: () => string;
};

type AtQuery = {
  atPos: number;
  query: string;
};

function getAtQuery(text: string, cursorPos: number): AtQuery | null {
  if (cursorPos === 0) {
    return null;
  }

  const beforeCursor = text.slice(0, cursorPos);
  const atPos = beforeCursor.lastIndexOf('@');

  if (atPos === -1) {
    return null;
  }

  if (atPos > 0 && !/\s/.test(beforeCursor[atPos - 1] ?? '')) {
    return null;
  }

  const query = beforeCursor.slice(atPos + 1);

  if (/\s/.test(query)) {
    return null;
  }

  return { atPos, query };
}

function normalizeDirectory(path: string): string {
  const segments: string[] = [];

  for (const segment of path.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..' && segments.at(-1) !== '..') {
      if (segments.length > 0) {
        segments.pop();
      } else {
        segments.push('..');
      }
    } else {
      segments.push(segment);
    }
  }

  return segments.join('/');
}

function directoryForQuery(query: string): string {
  const slashIndex = query.lastIndexOf('/');

  if (slashIndex === -1) {
    return '';
  }

  return normalizeDirectory(query.slice(0, slashIndex));
}

function parentDirectory(directory: string): string {
  if (!directory) {
    return '..';
  }

  const segments = directory.split('/');

  if (segments.every((segment) => segment === '..')) {
    return [...segments, '..'].join('/');
  }

  segments.pop();

  return segments.join('/');
}

export function ComposerFilePicker(props: ComposerFilePickerProps) {
  const [enabled, setEnabled] = createSignal(false);

  const [capabilityCheckState, setCapabilityCheckState] = createSignal<
    'idle' | 'pending' | 'done'
  >('idle');

  const [open, setOpen] = createSignal(false);
  const [files, setFiles] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal(0);
  const [loading, setLoading] = createSignal(false);
  const [truncated, setTruncated] = createSignal(false);
  const [absoluteDirectory, setAbsoluteDirectory] = createSignal('');
  const [relativeDirectory, setRelativeDirectory] = createSignal('');
  const [pathHidden, setPathHidden] = createSignal(false);
  const [atInfo, setAtInfo] = createSignal<AtQuery | null>(null);
  const [scrollThumb, setScrollThumb] = createSignal({ top: 0, height: 100 });

  let debounceTimer: number | null = null;
  let capabilityRequestId: string | null = null;
  let activeSearchRequestId: string | null = null;
  let searchGeneration = 0;
  let currentQueryKey: string | null = null;
  let dismissedQueryKey: string | null = null;
  let listEl: HTMLDivElement | undefined;
  let pickerEl: HTMLDivElement | undefined;
  let scrollbarEl: HTMLDivElement | undefined;
  let headerEl: HTMLDivElement | undefined;
  let titleEl: HTMLSpanElement | undefined;
  let pathEl: HTMLElement | undefined;
  let hintEl: HTMLSpanElement | undefined;
  let naturalPathWidth = 0;

  function clearDebounce(): void {
    if (debounceTimer === null) {
      return;
    }

    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function forgetActiveSearch(): void {
    if (activeSearchRequestId === null) {
      return;
    }

    props.pendingRequests.delete(activeSearchRequestId);
    activeSearchRequestId = null;
  }

  function close(): void {
    searchGeneration += 1;
    currentQueryKey = null;
    clearDebounce();
    forgetActiveSearch();
    setOpen(false);
    setFiles([]);
    setSelected(0);
    setLoading(false);
    setTruncated(false);
  }

  function dismiss(): void {
    dismissedQueryKey = currentQueryKey;
    close();
  }

  function currentDirectory(): string {
    return directoryForQuery(atInfo()?.query ?? '');
  }

  function absoluteDirectoryParts(): { base: string; relative: string } {
    const absolute = absoluteDirectory();
    const relative = relativeDirectory();

    if (!relative || !absolute.endsWith(relative)) {
      return { base: absolute, relative: '' };
    }

    return {
      base: absolute.slice(0, -relative.length),
      relative,
    };
  }

  function updatePathVisibility(): void {
    if (!headerEl || !titleEl || !hintEl) {
      return;
    }

    if (pathEl && !pathHidden()) {
      naturalPathWidth = Math.max(naturalPathWidth, pathEl.scrollWidth);
    }

    const available =
      headerEl.clientWidth - titleEl.offsetWidth - hintEl.offsetWidth - 32;

    setPathHidden(naturalPathWidth > available);
  }

  function updateScrollThumb(): void {
    if (!listEl || listEl.scrollHeight <= listEl.clientHeight) {
      setScrollThumb({ top: 0, height: 100 });

      return;
    }

    const height = Math.max(
      12,
      (listEl.clientHeight / listEl.scrollHeight) * 100,
    );

    const maxScroll = listEl.scrollHeight - listEl.clientHeight;
    const top = (listEl.scrollTop / maxScroll) * (100 - height);

    setScrollThumb({ top, height });
  }

  function updateFromTextarea(): void {
    const textarea = props.textareaRef();

    if (!textarea || !enabled()) {
      close();

      return;
    }

    const text = props.composerText();
    const info = getAtQuery(text, textarea.selectionStart ?? text.length);

    setAtInfo(info);

    if (!info) {
      close();

      return;
    }

    const queryKey = `${info.atPos}:${textarea.selectionStart}:${info.query}`;

    if (queryKey === dismissedQueryKey) {
      return;
    }

    dismissedQueryKey = null;

    if (queryKey === currentQueryKey) {
      return;
    }

    const generation = searchGeneration + 1;
    searchGeneration = generation;
    currentQueryKey = queryKey;
    clearDebounce();
    forgetActiveSearch();
    setOpen(true);
    setFiles([]);
    setSelected(0);
    setLoading(true);
    setTruncated(false);

    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      runSearch(info.query, generation, false);
    }, 150);
  }

  function checkCapability(): void {
    if (!props.wsConnected() || capabilityCheckState() !== 'idle') {
      return;
    }

    const requestId = props.createId();
    capabilityRequestId = requestId;
    setCapabilityCheckState('pending');

    props.pendingRequests.set(requestId, {
      suppressErrorUi: true,
      onCapabilityProvidersResult: (message) => {
        if (capabilityRequestId !== requestId) {
          return;
        }

        capabilityRequestId = null;
        setCapabilityCheckState('done');
        setEnabled(message.providers.length === 1);
        queueMicrotask(updateFromTextarea);
      },
      onError: () => {
        capabilityRequestId = null;
        setCapabilityCheckState('done');
        setEnabled(false);
      },
    });

    try {
      props.sendSocketMessage({
        type: 'list_capability_providers',
        requestId,
        capability: { name: 'fuzzy-file-search', version: 1 },
      });
    } catch (error) {
      props.pendingRequests.delete(requestId);
      capabilityRequestId = null;
      setCapabilityCheckState('done');
      setEnabled(false);
      console.error('Failed to check fuzzy file search capability', error);
    }
  }

  function runSearch(
    rawQuery: string,
    generation: number,
    withoutLimit: boolean,
  ): void {
    if (!enabled() || generation !== searchGeneration) {
      return;
    }

    const isRegex = /[*?]/.test(rawQuery);
    const query = isRegex ? globToRegex(rawQuery).source : rawQuery;
    const requestId = props.createId();

    activeSearchRequestId = requestId;

    props.pendingRequests.set(requestId, {
      suppressErrorUi: true,
      onCapabilityResult: (message) => {
        if (
          activeSearchRequestId !== requestId ||
          generation !== searchGeneration
        ) {
          return;
        }

        const output = message.output as {
          files?: unknown;
          truncated?: unknown;
          currentDirectory?: unknown;
          relativeDirectory?: unknown;
        } | null;

        const nextFiles = Array.isArray(output?.files)
          ? output.files.filter(
              (file): file is string => typeof file === 'string',
            )
          : [];

        setFiles(nextFiles);
        setSelected(nextFiles.length > 0 ? 1 : 0);
        setTruncated(output?.truncated === true);

        setAbsoluteDirectory(
          typeof output?.currentDirectory === 'string'
            ? output.currentDirectory
            : '',
        );

        setRelativeDirectory(
          typeof output?.relativeDirectory === 'string'
            ? output.relativeDirectory
            : '',
        );

        setLoading(false);
      },
      onError: () => {
        if (activeSearchRequestId !== requestId) {
          return;
        }

        activeSearchRequestId = null;
        close();
      },
      onDone: () => {
        if (activeSearchRequestId !== requestId) {
          return;
        }

        activeSearchRequestId = null;
        setLoading(false);
      },
    });

    try {
      props.sendSocketMessage({
        type: 'run_capability',
        requestId,
        timelineId: props.timelineId(),
        operation: 'capability:v1:fuzzy-file-search.search',
        input: {
          query,
          ...(!withoutLimit && { limit: 30 }),
          isRegex,
          includeIgnored: false,
          includeDirectories: true,
          ignoreDotFiles: true,
        },
        consumerAlias: 'file',
        selection: 'auto',
      });
    } catch (error) {
      props.pendingRequests.delete(requestId);

      if (activeSearchRequestId === requestId) {
        activeSearchRequestId = null;
        close();
      }

      console.error('Failed to search workspace files', error);
    }
  }

  function showAll(): void {
    const info = atInfo();

    if (!info) {
      return;
    }

    const generation = searchGeneration + 1;
    searchGeneration = generation;
    clearDebounce();
    forgetActiveSearch();
    setLoading(true);
    setTruncated(false);
    runSearch(info.query, generation, true);
  }

  function insertPath(path: string): void {
    const info = atInfo();
    const textarea = props.textareaRef();

    if (!info || !textarea) {
      return;
    }

    const text = props.composerText();
    const cursor = textarea.selectionStart ?? text.length;
    const before = text.slice(0, info.atPos);
    const after = text.slice(cursor);
    const isDirectory = path.endsWith('/');
    const insert = isDirectory ? `@${path}` : `@${path} `;

    props.setComposerText(`${before}${insert}${after}`);

    if (isDirectory) {
      dismissedQueryKey = null;
      currentQueryKey = null;
      setFiles([]);
      setSelected(0);
      setLoading(true);
    } else {
      close();
    }

    queueMicrotask(() => {
      const nextPos = before.length + insert.length;
      textarea.focus();
      textarea.setSelectionRange(nextPos, nextPos);

      if (isDirectory) {
        updateFromTextarea();
      }
    });
  }

  function navigateToDirectory(directory: string): void {
    const info = atInfo();
    const textarea = props.textareaRef();

    if (!info || !textarea) {
      return;
    }

    const text = props.composerText();
    const cursor = textarea.selectionStart ?? text.length;
    const before = text.slice(0, info.atPos);
    const after = text.slice(cursor);
    const query = directory ? `${directory}/` : '';
    const insert = `@${query}`;

    dismissedQueryKey = null;
    currentQueryKey = null;
    setFiles([]);
    setSelected(0);
    setLoading(true);
    setTruncated(false);
    props.setComposerText(`${before}${insert}${after}`);

    queueMicrotask(() => {
      const nextPos = before.length + insert.length;
      textarea.focus();
      textarea.setSelectionRange(nextPos, nextPos);
      updateFromTextarea();
    });
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!open()) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();

      setSelected((index) => Math.min(index + 1, files().length));

      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setSelected((index) => Math.max(index - 1, 0));

      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();

      if (selected() === 0) {
        navigateToDirectory(parentDirectory(currentDirectory()));
      } else {
        insertPath(files()[selected() - 1]!);
      }

      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }
  }

  createEffect(() => {
    if (!props.wsConnected()) {
      if (capabilityCheckState() === 'pending') {
        capabilityRequestId = null;
        setCapabilityCheckState('idle');
        setEnabled(false);
      }

      close();

      return;
    }

    checkCapability();
  });

  createEffect(() => {
    void absoluteDirectory();
    void relativeDirectory();

    setPathHidden(false);
    naturalPathWidth = 0;
    queueMicrotask(updatePathVisibility);
  });

  createEffect(() => {
    if (!headerEl) {
      return;
    }

    const observer = new ResizeObserver(updatePathVisibility);
    observer.observe(headerEl);

    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (
        !open() ||
        !target ||
        pickerEl?.contains(target) ||
        props.textareaRef()?.contains(target)
      ) {
        return;
      }

      dismiss();
    };

    document.addEventListener('pointerdown', onPointerDown);

    onCleanup(() => document.removeEventListener('pointerdown', onPointerDown));
  });

  createEffect(() => {
    void props.composerText();
    queueMicrotask(updateFromTextarea);
  });

  createEffect(() => {
    if (!open()) {
      return;
    }

    void files().length;
    void selected();

    queueMicrotask(() => {
      listEl
        ?.querySelector<HTMLElement>('.composer-file-picker__item.selected')
        ?.scrollIntoView({ block: 'nearest' });

      updateScrollThumb();
    });
  });

  createEffect(() => {
    void loading();
    void files().length;

    if (!listEl) {
      return;
    }

    const observer = new ResizeObserver(updateScrollThumb);
    observer.observe(listEl);

    onCleanup(() => observer.disconnect());
  });

  function handleScrollbarPointerDown(event: PointerEvent): void {
    if (!listEl || !scrollbarEl) {
      return;
    }

    event.preventDefault();

    const startY = event.clientY;
    const startScrollTop = listEl.scrollTop;
    const maxScroll = listEl.scrollHeight - listEl.clientHeight;
    const thumbHeight = (scrollThumb().height / 100) * scrollbarEl.clientHeight;
    const availableTrack = scrollbarEl.clientHeight - thumbHeight;

    if (maxScroll <= 0 || availableTrack <= 0) {
      return;
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      listEl!.scrollTop =
        startScrollTop +
        ((moveEvent.clientY - startY) / availableTrack) * maxScroll;
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  createEffect(() => {
    const textarea = props.textareaRef();

    if (!textarea) {
      return;
    }

    const update = () => queueMicrotask(updateFromTextarea);

    textarea.addEventListener('keyup', update);
    textarea.addEventListener('click', update);
    textarea.addEventListener('input', update);
    textarea.addEventListener('keydown', handleKeyDown);

    onCleanup(() => {
      textarea.removeEventListener('keyup', update);
      textarea.removeEventListener('click', update);
      textarea.removeEventListener('input', update);
      textarea.removeEventListener('keydown', handleKeyDown);
    });
  });

  onCleanup(() => {
    clearDebounce();
    forgetActiveSearch();

    if (capabilityRequestId !== null) {
      props.pendingRequests.delete(capabilityRequestId);
    }
  });

  return (
    <Show when={open()}>
      <div
        id="composer-file-picker"
        ref={pickerEl}
        class="composer-file-picker panel"
        role="listbox"
        aria-label="File suggestions"
      >
        <div class="composer-file-picker__header" ref={headerEl}>
          <span class="composer-file-picker__title" ref={titleEl}>
            Files
          </span>
          <code
            class="composer-file-picker__cwd"
            classList={{ hidden: pathHidden() }}
            ref={pathEl}
          >
            <span>{absoluteDirectoryParts().base}</span>
            <span class="composer-file-picker__cwd-relative">
              {absoluteDirectoryParts().relative}
            </span>
          </code>
          <span class="composer-file-picker__hint" ref={hintEl}>
            Enter to insert
          </span>
        </div>
        <Show
          when={!loading()}
          fallback={
            <div class="composer-file-picker__status">Searching...</div>
          }
        >
          <div class="composer-file-picker__results">
            <div
              class="composer-file-picker__list"
              ref={listEl}
              onScroll={updateScrollThumb}
            >
              <button
                type="button"
                role="option"
                aria-selected={selected() === 0}
                class="composer-file-picker__item directory"
                classList={{ selected: selected() === 0 }}
                onMouseEnter={() => setSelected(0)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  navigateToDirectory(parentDirectory(currentDirectory()));
                }}
              >
                <span class="composer-file-picker__marker">dir</span>
                <span class="composer-file-picker__path">../</span>
              </button>
              <For each={files()}>
                {(file, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index() + 1 === selected()}
                    class="composer-file-picker__item"
                    classList={{
                      selected: index() + 1 === selected(),
                      directory: file.endsWith('/'),
                    }}
                    onMouseEnter={() => setSelected(index() + 1)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertPath(file);
                    }}
                  >
                    <span class="composer-file-picker__marker">
                      {file.endsWith('/') ? 'dir' : '@'}
                    </span>
                    <span class="composer-file-picker__path">{file}</span>
                  </button>
                )}
              </For>
              <Show when={files().length === 0}>
                <div class="composer-file-picker__status">No files found</div>
              </Show>
              <Show when={truncated()}>
                <button
                  type="button"
                  class="composer-file-picker__show-all"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={showAll}
                >
                  Truncated - Show all
                </button>
              </Show>
            </div>
            <div
              class="composer-file-picker__scrollbar"
              ref={scrollbarEl}
              onPointerDown={handleScrollbarPointerDown}
              aria-hidden="true"
            >
              <div
                class="composer-file-picker__scrollbar-thumb"
                style={{
                  top: `${scrollThumb().top}%`,
                  height: `${scrollThumb().height}%`,
                }}
              />
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
