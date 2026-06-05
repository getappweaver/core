import { createEffect } from 'solid-js';

export type WebCheckboxControlProps = {
  className: string;
  style: string | undefined;
  checked: boolean;
  disabled: boolean;
  indeterminate: boolean;
  onChange: () => void;
  dataUi?: string;
};

export function WebCheckboxControl(props: WebCheckboxControlProps) {
  let inputEl: HTMLInputElement | undefined;

  createEffect(() => {
    if (inputEl) {
      inputEl.indeterminate = props.indeterminate;
    }
  });

  return (
    <input
      ref={(el) => {
        inputEl = el;

        if (el) {
          el.indeterminate = props.indeterminate;
        }
      }}
      type="checkbox"
      class={props.className}
      data-ui={props.dataUi}
      style={props.style}
      checked={props.checked}
      disabled={props.disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onChange();
      }}
      onChange={(e) => {
        e.preventDefault();
      }}
    />
  );
}
