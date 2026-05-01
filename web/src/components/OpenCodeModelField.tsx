import { For, Show } from 'solid-js';

import type { WebArgumentFieldChoice } from '@src/web/ui-schema';

export type OpenCodeModelFieldProps = {
  /** Unique id for the paired `<datalist>`. */
  fieldId: string;
  value: string;
  /** From `opencode.json`; use `[]` when there is no catalog (plain text field). */
  choices: WebArgumentFieldChoice[];
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
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
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
        onKeyDown={(e) => props.onKeyDown?.(e)}
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
