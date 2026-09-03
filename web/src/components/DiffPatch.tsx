import { createSignal, For, onCleanup, Show } from 'solid-js';

import { writeClipboardText } from '../utils/clipboard';

import { renderDiffPatchLines } from './diff-patch';
import './diff-patch.css';

export function DiffPatch(props: {
  patch: string;
  file?: string | null;
  class?: string;
}) {
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const [scrolling, setScrolling] = createSignal(false);

  const onScroll = () => {
    setScrolling(true);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setScrolling(false), 700);
  };

  onCleanup(() => clearTimeout(idleTimer));

  return (
    <div
      class={`diff-patch-scroll${props.class ? ` ${props.class}` : ''}`}
      classList={{ 'is-scrolling': scrolling() }}
      onScroll={onScroll}
    >
      <pre class="diff-file__patch">
        <For each={renderDiffPatchLines(props.patch)}>
          {(line) => (
            <span class={line.className}>
              <span class="diff-line__number">{line.oldLine ?? ''}</span>
              <Show
                when={line.newLine}
                fallback={<span class="diff-line__number" />}
              >
                {(newLine) => {
                  const file = () => line.file ?? props.file ?? null;

                  return file() ? (
                    <a
                      class="diff-line__number diff-line__number--current"
                      href="#"
                      title="Copy line reference"
                      onClick={(event) => {
                        event.preventDefault();

                        void writeClipboardText(`${file()}:${newLine()}`).catch(
                          () => {},
                        );
                      }}
                    >
                      {newLine()}
                    </a>
                  ) : (
                    <span class="diff-line__number">{newLine()}</span>
                  );
                }}
              </Show>
              <span class="diff-line__text">{line.text || ' '}</span>
            </span>
          )}
        </For>
      </pre>
    </div>
  );
}
