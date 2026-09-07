import type { JSX } from 'solid-js';
import { createSignal, For, Show } from 'solid-js';

import type { WebNostrPostReference } from '@src/web/ui-schema';

type NostrPostRepliesProps = {
  replies: WebNostrPostReference[];
  renderReply: (reply: WebNostrPostReference) => JSX.Element;
};

export function NostrPostReplies(props: NostrPostRepliesProps): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <Show when={props.replies.length > 0}>
      <section
        class="web-nostrPost__conversation"
        aria-label="Conversation replies"
      >
        <button
          type="button"
          class="web-nostrPost__action web-nostrPost__contextToggle"
          aria-expanded={expanded()}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded() ? 'Hide' : 'Show'} thread replies ({props.replies.length})
        </button>
        <Show when={expanded()}>
          <div class="web-nostrPost__conversationReplies">
            <For each={props.replies}>{props.renderReply}</For>
          </div>
        </Show>
      </section>
    </Show>
  );
}
