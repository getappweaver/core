import type { JSX } from 'solid-js';

import type { StatusRowProps } from '../statusRows';

export function StatusRow(props: StatusRowProps): JSX.Element {
  return (
    <li class="setup-status-row">
      <span
        class="setup-status-dot"
        classList={{ 'is-ok': props.ok, 'is-missing': !props.ok }}
        aria-hidden="true"
      />
      <span class="setup-status-label">{props.label}</span>
      <span class="setup-status-detail">{props.detail}</span>
    </li>
  );
}
