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

export function ComposerFilePicker(props: ComposerFilePickerProps) {
  const [enabled, setEnabled] = createSignal(false);

  const [capabilityCheckState, setCapabilityCheckState] = createSignal<
    'idle' | 'pending' | 'done'
  >('idle');

  const [open, setOpen] = createSignal(false);
  const [files, setFiles] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal(0);
  const [loading, setLoading] = createSignal(false);
  const [atInfo, setAtInfo] = createSignal<AtQuery | null>(null);

  let debounceTimer: number | null = null;
  let capabilityRequestId: string | null = null;
  let activeSearchRequestId: string | null = null;
  let searchGeneration = 0;
  let currentQueryKey: string | null = null;
  let dismissedQueryKey: string | null = null;
  let listEl: HTMLDivElement | undefined;
  let pickerEl: HTMLDivElement | undefined;

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
  }

  function dismiss(): void {
    dismissedQueryKey = currentQueryKey;
    close();
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

    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      runSearch(info.query, generation);
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

  function runSearch(rawQuery: string, generation: number): void {
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

        const output = message.output as { files?: unknown } | null;

        const nextFiles = Array.isArray(output?.files)
          ? output.files.filter(
              (file): file is string => typeof file === 'string',
            )
          : [];

        setFiles(nextFiles);
        setSelected(0);
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
          limit: 30,
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

  function handleKeyDown(event: KeyboardEvent): void {
    if (!open()) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();

      setSelected((index) =>
        Math.min(index + 1, Math.max(files().length - 1, 0)),
      );

      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setSelected((index) => Math.max(index - 1, 0));

      return;
    }

    if ((event.key === 'Enter' || event.key === 'Tab') && files().length > 0) {
      event.preventDefault();
      event.stopPropagation();
      insertPath(files()[selected()]!);

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
    if (!open() || files().length === 0) {
      return;
    }

    void selected();

    queueMicrotask(() => {
      listEl
        ?.querySelector<HTMLElement>('.composer-file-picker__item.selected')
        ?.scrollIntoView({ block: 'nearest' });
    });
  });

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
        <div class="composer-file-picker__header">
          <span>Files</span>
          <span class="composer-file-picker__hint">Enter to insert</span>
        </div>
        <Show
          when={!loading()}
          fallback={
            <div class="composer-file-picker__status">Searching...</div>
          }
        >
          <Show
            when={files().length > 0}
            fallback={
              <div class="composer-file-picker__status">No files found</div>
            }
          >
            <div class="composer-file-picker__list" ref={listEl}>
              <For each={files()}>
                {(file, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index() === selected()}
                    class="composer-file-picker__item"
                    classList={{
                      selected: index() === selected(),
                      directory: file.endsWith('/'),
                    }}
                    onMouseEnter={() => setSelected(index())}
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
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
