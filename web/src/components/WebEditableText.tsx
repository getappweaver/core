import type { JSX } from 'solid-js';
import {
  For,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';

import type { WebElementNode } from '@src/web/ui-schema';

import { registerEditableTextEntry } from '../editableTextRegistry';
import { registerStoryDomTarget } from '../story/dom-targets';
import { onStoryFillForm } from '../story/events';

type WebEditableTextProps = {
  element: WebElementNode;
};

function classNameForElement(element: WebElementNode): string | undefined {
  return element.props?.className;
}

function lineCountForText(text: string): number {
  return Math.max(1, text.split('\n').length);
}

function logicalLinesForText(text: string): string[] {
  return text.split('\n');
}

function textOffsetInElement(props: {
  root: HTMLElement;
  range: Range;
}): number {
  const before = props.range.cloneRange();
  before.selectNodeContents(props.root);
  before.setEnd(props.range.startContainer, props.range.startOffset);

  return before.toString().length;
}

function lineForOffset(props: { text: string; offset: number }): number {
  return props.text.slice(0, props.offset).split('\n').length;
}

function firstChangedLine(props: {
  before: string;
  after: string;
}): number | null {
  if (props.before === props.after) {
    return null;
  }

  const beforeLines = props.before.split('\n');
  const afterLines = props.after.split('\n');
  const maxLines = Math.max(beforeLines.length, afterLines.length);

  for (let index = 0; index < maxLines; index++) {
    if (beforeLines[index] !== afterLines[index]) {
      return index + 1;
    }
  }

  return null;
}

function contentEditableMode(): 'plaintext-only' {
  return 'plaintext-only';
}

function setEditorText(params: {
  editorEl: HTMLDivElement;
  value: string;
  setText: (value: string) => void;
  scheduleMeasureLineHeights: () => void;
}): void {
  params.editorEl.innerText = params.value;
  params.setText(params.value);
  params.editorEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
  params.scheduleMeasureLineHeights();
}

export function WebEditableText(props: WebEditableTextProps): JSX.Element {
  let editorEl: HTMLDivElement | undefined;
  let mirrorEl: HTMLDivElement | undefined;
  let measureFrame: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const editableId = () => props.element.props?.editableTextId ?? null;
  const initialText = () => props.element.props?.editableTextValue ?? '';
  const showLineNumbers = () => props.element.props?.showLineNumbers === true;
  const [text, setText] = createSignal(initialText());
  const [activeLine, setActiveLine] = createSignal(1);
  const [lineHeights, setLineHeights] = createSignal<number[]>([]);

  const logicalLines = createMemo(() => logicalLinesForText(text()));

  const lineNumbers = () =>
    Array.from({ length: lineCountForText(text()) }, (_, index) => index + 1);

  const lineNumberStyle = (lineNumber: number): JSX.CSSProperties => {
    const height = lineHeights()[lineNumber - 1];

    return height === undefined ? {} : { height: `${height}px` };
  };

  function measureLineHeights(): void {
    const nextHeights = Array.from(
      mirrorEl?.querySelectorAll<HTMLElement>(
        '.web-editable-text__mirror-line',
      ) ?? [],
      (line) => line.getBoundingClientRect().height,
    );

    if (nextHeights.length > 0) {
      setLineHeights(nextHeights);
    }
  }

  function scheduleMeasureLineHeights(): void {
    if (measureFrame !== null) {
      window.cancelAnimationFrame(measureFrame);
    }

    measureFrame = window.requestAnimationFrame(() => {
      measureFrame = null;
      measureLineHeights();
    });
  }

  function syncFromDom(): void {
    const nextText = editorEl?.innerText ?? '';

    setText(nextText);
    scheduleMeasureLineHeights();
  }

  function updateActiveLine(): void {
    const root = editorEl;
    const selection = window.getSelection();

    if (root == null || selection == null || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (!root.contains(range.startContainer)) {
      return;
    }

    const editorText = root.innerText;
    const offset = textOffsetInElement({ root, range });
    const nextLine = lineForOffset({ text: editorText, offset });

    setActiveLine(
      Math.min(Math.max(1, nextLine), lineCountForText(editorText)),
    );
  }

  createEffect(() => {
    const id = editableId();

    if (id == null) {
      return;
    }

    const unregister = registerEditableTextEntry({
      id,
      getSnapshot: () => {
        const currentText = editorEl?.innerText ?? text();

        const changedLine = firstChangedLine({
          before: initialText(),
          after: currentText,
        });

        return {
          text: currentText,
          activeLine: changedLine ?? activeLine(),
          changedLine,
        };
      },
    });

    onCleanup(unregister);
  });

  createEffect(() => {
    const value = initialText();

    setText(value);

    if (editorEl != null && editorEl.innerText !== value) {
      editorEl.innerText = value;
    }

    scheduleMeasureLineHeights();
  });

  createEffect(() => {
    const targetId = props.element.props?.storyTargetId;

    if (!targetId || !editorEl) {
      return;
    }

    registerStoryDomTarget(targetId, editorEl);
    onCleanup(() => registerStoryDomTarget(targetId, null));
  });

  createEffect(() => {
    const stop = onStoryFillForm((values) => {
      if (!editorEl) {
        return;
      }

      const value = values.arguments.content ?? values.options.content;

      if (typeof value !== 'string' && typeof value !== 'number') {
        return;
      }

      setEditorText({
        editorEl,
        value: String(value),
        setText,
        scheduleMeasureLineHeights,
      });
    });

    onCleanup(stop);
  });

  createEffect(() => {
    logicalLines();
    showLineNumbers();
    scheduleMeasureLineHeights();
  });

  onMount(() => {
    if (editorEl != null) {
      resizeObserver = new ResizeObserver(() => scheduleMeasureLineHeights());
      resizeObserver.observe(editorEl);
    }

    scheduleMeasureLineHeights();
  });

  onCleanup(() => {
    if (measureFrame !== null) {
      window.cancelAnimationFrame(measureFrame);
    }

    resizeObserver?.disconnect();
  });

  return (
    <div
      class={classNameForElement(props.element)}
      data-ui={props.element.props?.ui}
      data-story-target={props.element.props?.storyTargetId}
    >
      <div
        class="web-editable-text__grid"
        classList={{
          'web-editable-text__grid--with-gutter': showLineNumbers(),
        }}
      >
        {showLineNumbers() ? (
          <div class="web-editable-text__gutter" aria-hidden="true">
            <For each={lineNumbers()}>
              {(lineNumber) => (
                <div
                  class="web-editable-text__line-number"
                  classList={{
                    'is-active': lineNumber === activeLine(),
                  }}
                  style={lineNumberStyle(lineNumber)}
                >
                  {lineNumber}
                </div>
              )}
            </For>
          </div>
        ) : null}
        <div
          ref={(el) => {
            editorEl = el;
            el.innerText = text();
          }}
          data-editable-id={editableId() ?? undefined}
          data-active-line={String(activeLine())}
          class="web-editable-text__editor"
          contentEditable={contentEditableMode()}
          role="textbox"
          aria-multiline="true"
          spellcheck={false}
          onInput={() => {
            syncFromDom();
            updateActiveLine();
          }}
          onKeyUp={updateActiveLine}
          onMouseUp={updateActiveLine}
          onFocus={updateActiveLine}
        />
        <div
          ref={(el) => {
            mirrorEl = el;
          }}
          class="web-editable-text__mirror"
          aria-hidden="true"
        >
          <For each={logicalLines()}>
            {(line) => (
              <div class="web-editable-text__mirror-line">
                {line.length === 0 ? '\u00a0' : line}
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
