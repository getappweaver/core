import hljs from 'highlight.js';
import type { Accessor, JSX } from 'solid-js';
import { createEffect, onCleanup } from 'solid-js';
import { For } from 'solid-js';

import type { WebElementNode } from '@src/web/ui-schema';

import { isWebDemoMode } from '../../demo/runtime';
import { registerStoryDomTarget } from '../../story/dom-targets';

import type { WebNodeRendererProps } from './contexts';
import { elementClass, elementStyle, elementUi } from './element-helpers';

// ---------------------------------------------------------------------------
// Scroll-into-view once (session storage key dedup)
// ---------------------------------------------------------------------------

const WEB_SCROLL_ONCE_STORAGE_PREFIX = 'appweaver:web-scroll-once:';

export function consumeScrollIntoViewOnceKey(key: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  const storageKey = `${WEB_SCROLL_ONCE_STORAGE_PREFIX}${key}`;

  try {
    if (window.sessionStorage.getItem(storageKey) === '1') {
      return false;
    }

    window.sessionStorage.setItem(storageKey, '1');

    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Element ref setup (storyTargetId, autoFocus, scrollIntoView)
// ---------------------------------------------------------------------------

type WebElementRefProps = {
  element: WebElementNode;
  el: HTMLElement;
};

export function setupWebElementRef({ element, el }: WebElementRefProps): void {
  if (element.props?.storyTargetId) {
    registerStoryDomTarget(element.props.storyTargetId, el);
  }

  if (element.props?.autoFocus === true) {
    queueMicrotask(() => el.focus());
  }

  if (element.props?.scrollIntoViewOnMount === true && !isWebDemoMode()) {
    const onceKey = element.props.scrollIntoViewOnceKey;

    if (typeof onceKey === 'string' && !consumeScrollIntoViewOnceKey(onceKey)) {
      return;
    }

    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
}

// ---------------------------------------------------------------------------
// Speech sentence range helpers
// ---------------------------------------------------------------------------

export const WEB_SPEECH_HIGHLIGHT_NAME = 'web-speech-active';
export const WEB_SPEECH_HOVER_HIGHLIGHT_NAME = 'web-speech-hover';

export type SentenceRange = {
  index: number;
  start: number;
  end: number;
};

export function sentenceRangesInText(
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

export function caretRangeFromPoint(x: number, y: number): Range | null {
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

export function highlightApi(): Map<string, Highlight> | null {
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

// ---------------------------------------------------------------------------
// HljsHighlightedSpan
// ---------------------------------------------------------------------------

type HljsHighlightedSpanProps = {
  element: WebElementNode;
  language: string | null;
};

export function HljsHighlightedSpan(
  props: HljsHighlightedSpanProps,
): JSX.Element {
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

// ---------------------------------------------------------------------------
// SpeechHighlightBox
// ---------------------------------------------------------------------------

type SpeechHighlightBoxProps = {
  element: WebElementNode;
  onRunAction: WebNodeRendererProps['onRunAction'];
  onReplaceRoot: WebNodeRendererProps['onReplaceRoot'];
  onError: WebNodeRendererProps['onError'];
  promptRequestId: string | undefined;
  speechSentences: Accessor<string[] | undefined> | undefined;
  activeSpeechSentenceIndex: Accessor<number | null | undefined> | undefined;
  onSpeechSentenceClick:
    Accessor<((index: number) => void) | null | undefined> | undefined;
};

// Forward declaration — the actual WebNodeRenderer is imported by the file
// that assembles everything (WebNodeRenderer.tsx). Here we accept children
// via a render prop to avoid a circular import.
type SpeechHighlightBoxRenderChildProps = SpeechHighlightBoxProps & {
  renderChild: (child: import('@src/web/ui-schema').WebNode) => JSX.Element;
};

export function SpeechHighlightBox(
  props: SpeechHighlightBoxRenderChildProps,
): JSX.Element {
  let el: HTMLDivElement | undefined;

  const sentenceAtEvent = (event: MouseEvent): SentenceRange | null => {
    const sentences = props.speechSentences?.() ?? [];

    if (el == null || sentences.length === 0) {
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
      sentenceRangesInText(speechTextForElement(el), sentences).find(
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
    const activeIndex = props.activeSpeechSentenceIndex?.();
    const sentences = props.speechSentences?.() ?? [];

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
        'web-speech-clickable': Boolean(props.onSpeechSentenceClick?.()),
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
        const onSentenceClick = props.onSpeechSentenceClick?.();

        if (sentence != null && onSentenceClick != null) {
          onSentenceClick(sentence.index);
        }
      }}
    >
      <For each={props.element.children ?? []}>
        {(child) => props.renderChild(child)}
      </For>
    </div>
  );
}
