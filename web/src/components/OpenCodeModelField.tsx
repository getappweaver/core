import { For, Show } from 'solid-js';

import type { WebArgumentFieldChoice } from '@src/web/ui-schema';

export type OpenCodeModelFieldProps = {
  /** Unique id for the paired `<datalist>`. */
  fieldId: string;
  value: string;
  /** From `opencode.json`; use `[]` when there is no catalog (plain text field). */
  choices: WebArgumentFieldChoice[];
  enterKeyHint?:
    'done' | 'enter' | 'go' | 'next' | 'previous' | 'search' | 'send';
  onChange: (value: string) => void;
};

/**
 * Text input with optional `<datalist>` of `opencode.json` models (`provider/model`).
 * Shared by the agent editor and timeline command forms (e.g. `/ai root-model`).
 */
export function OpenCodeModelField(props: OpenCodeModelFieldProps) {
  const listId = () => `${props.fieldId}-opencode-models`;

  return (
    <>
      <input
        type="text"
        {...(props.choices.length > 0 ? { list: listId() } : {})}
        enterkeyhint={props.enterKeyHint}
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
      />
      <Show when={props.choices.length > 0}>
        <datalist id={listId()}>
          <For each={props.choices}>
            {(c) => <option value={c.value}>{c.label}</option>}
          </For>
        </datalist>
      </Show>
    </>
  );
}
