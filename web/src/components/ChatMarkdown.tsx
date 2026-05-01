import hljs from 'highlight.js/lib/core';
import markdown from 'highlight.js/lib/languages/markdown';
import xml from 'highlight.js/lib/languages/xml';
import { createEffect, createMemo, createSignal } from 'solid-js';

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
};

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

  return (
    <pre class={`chat-md chat-md--${props.role}`}>
      <code
        class="hljs language-markdown"
        ref={(el) => {
          setCodeEl(el);
        }}
      />
    </pre>
  );
}
