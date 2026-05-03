import hljs from 'highlight.js/lib/core';
import markdown from 'highlight.js/lib/languages/markdown';
import xml from 'highlight.js/lib/languages/xml';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';

import './ChatMarkdown.css';

hljs.registerLanguage('xml', xml);
hljs.registerLanguage('markdown', markdown);

function escapeHtmlForFallback(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

type ChatMarkdownProps = {
  text: string;
  role: 'user' | 'assistant';
  speechSentences?: string[];
  activeSpeechSentenceIndex?: number | null;
  onSpeechSentenceClick?: ((index: number) => void) | null;
};

type SentenceRange = {
  index: number;
  start: number;
  end: number;
};

const CHAT_SPEECH_HIGHLIGHT_NAME = 'chat-speech-active';
const CHAT_SPEECH_HOVER_HIGHLIGHT_NAME = 'chat-speech-hover';

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

function textNodesIn(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node != null) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }

  return nodes;
}

function domRangeForTextOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const nodes = textNodesIn(root);
  let offset = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  for (const node of nodes) {
    const length = node.data.length;
    const nextOffset = offset + length;

    if (startNode == null && start >= offset && start <= nextOffset) {
      startNode = node;
      startOffset = start - offset;
    }

    if (endNode == null && end >= offset && end <= nextOffset) {
      endNode = node;
      endOffset = end - offset;
      break;
    }

    offset = nextOffset;
  }

  if (startNode == null || endNode == null) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  return range;
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

function textOffsetForRange(root: HTMLElement, target: Range): number | null {
  const nodes = textNodesIn(root);
  let offset = 0;

  for (const node of nodes) {
    if (node === target.startContainer) {
      return offset + target.startOffset;
    }

    offset += node.data.length;
  }

  return null;
}

export function ChatMarkdown(props: ChatMarkdownProps) {
  const [codeEl, setCodeEl] = createSignal<HTMLElement | null>(null);

  const html = createMemo(() => {
    const src = props.text ?? '';

    try {
      return hljs.highlight(src, {
        language: 'markdown',
        ignoreIllegals: true,
      }).value;
    } catch {
      return escapeHtmlForFallback(src);
    }
  });

  createEffect(() => {
    const el = codeEl();
    const markup = html();

    if (el) {
      el.innerHTML = markup;
    }
  });

  createEffect(() => {
    const el = codeEl();
    const sentences = props.speechSentences ?? [];
    const activeIndex = props.activeSpeechSentenceIndex;

    const highlightApi = CSS as typeof CSS & {
      highlights?: Map<string, unknown>;
    };

    highlightApi.highlights?.delete(CHAT_SPEECH_HIGHLIGHT_NAME);

    if (el == null || activeIndex == null || sentences.length === 0) {
      return;
    }

    const text = el.textContent ?? '';

    const active = sentenceRangesInText(text, sentences).find(
      (range) => range.index === activeIndex,
    );

    if (active == null) {
      return;
    }

    const domRange = domRangeForTextOffsets(el, active.start, active.end);

    if (domRange == null || !highlightApi.highlights) {
      return;
    }

    const highlight = new Highlight(domRange);
    highlightApi.highlights.set(CHAT_SPEECH_HIGHLIGHT_NAME, highlight);
  });

  onCleanup(() => {
    const highlightApi = CSS as typeof CSS & {
      highlights?: Map<string, unknown>;
    };

    highlightApi.highlights?.delete(CHAT_SPEECH_HIGHLIGHT_NAME);
    highlightApi.highlights?.delete(CHAT_SPEECH_HOVER_HIGHLIGHT_NAME);
  });

  const handleClick = (event: MouseEvent): void => {
    const el = codeEl();
    const sentences = props.speechSentences ?? [];

    if (
      el == null ||
      sentences.length === 0 ||
      props.onSpeechSentenceClick == null
    ) {
      return;
    }

    const range = caretRangeFromPoint(event.clientX, event.clientY);

    if (range == null || !el.contains(range.startContainer)) {
      return;
    }

    const offset = textOffsetForRange(el, range);

    if (offset == null) {
      return;
    }

    const sentence = sentenceRangesInText(el.textContent ?? '', sentences).find(
      (candidate) => offset >= candidate.start && offset <= candidate.end,
    );

    if (sentence != null) {
      props.onSpeechSentenceClick(sentence.index);
    }
  };

  const setHoverHighlight = (event: MouseEvent | null): void => {
    const el = codeEl();
    const sentences = props.speechSentences ?? [];

    const highlightApi = CSS as typeof CSS & {
      highlights?: Map<string, unknown>;
    };

    highlightApi.highlights?.delete(CHAT_SPEECH_HOVER_HIGHLIGHT_NAME);

    if (event == null || el == null || sentences.length === 0) {
      return;
    }

    const range = caretRangeFromPoint(event.clientX, event.clientY);

    if (range == null || !el.contains(range.startContainer)) {
      return;
    }

    const offset = textOffsetForRange(el, range);

    if (offset == null) {
      return;
    }

    const sentence = sentenceRangesInText(el.textContent ?? '', sentences).find(
      (candidate) => offset >= candidate.start && offset <= candidate.end,
    );

    if (sentence == null || !highlightApi.highlights) {
      return;
    }

    const domRange = domRangeForTextOffsets(el, sentence.start, sentence.end);

    if (domRange != null) {
      highlightApi.highlights.set(
        CHAT_SPEECH_HOVER_HIGHLIGHT_NAME,
        new Highlight(domRange),
      );
    }
  };

  return (
    <pre class={`chat-md chat-md--${props.role}`}>
      <code
        class="hljs language-markdown"
        classList={{
          'chat-md__code--speech-clickable': Boolean(
            props.onSpeechSentenceClick,
          ),
        }}
        onClick={handleClick}
        onMouseMove={setHoverHighlight}
        onMouseLeave={() => setHoverHighlight(null)}
        ref={(el) => {
          setCodeEl(el);
        }}
      />
    </pre>
  );
}
