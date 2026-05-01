import type { JSX } from 'solid-js';
import { createEffect, onMount } from 'solid-js';

import { WebButton } from './WebButton';

type ComposerProps = {
  setInputRef?: (el: HTMLTextAreaElement) => void;
  value: string;
  onInput: JSX.EventHandler<HTMLTextAreaElement, InputEvent>;
  onKeyDown: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent>;
  onOpenPalette: () => void;
  footer?: JSX.Element;
};

export function Composer(props: ComposerProps) {
  let textareaEl: HTMLTextAreaElement | undefined;

  const resizeTextarea = () => {
    if (!textareaEl) {
      return;
    }

    textareaEl.style.height = 'auto';

    const computed = window.getComputedStyle(textareaEl);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;

    const maxHeight =
      lineHeight * 4 + borderTop + borderBottom + paddingTop + paddingBottom;

    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, maxHeight)}px`;

    textareaEl.style.overflowY =
      textareaEl.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  onMount(resizeTextarea);

  createEffect(() => {
    void props.value;

    queueMicrotask(resizeTextarea);
  });

  return (
    <div class="composer panel">
      <WebButton
        type="button"
        class="command-launcher"
        onClick={props.onOpenPalette}
      >
        /
      </WebButton>
      <textarea
        id="composer-input"
        name="message"
        rows={1}
        ref={(el) => {
          textareaEl = el;
          props.setInputRef?.(el);
        }}
        value={props.value}
        onInput={props.onInput}
        onKeyDown={props.onKeyDown}
        placeholder="Type a message or press / for commands"
        aria-label="Message"
      />
      {props.footer && <div class="composer-footer">{props.footer}</div>}
    </div>
  );
}
