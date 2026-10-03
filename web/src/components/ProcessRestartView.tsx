import { onMount, type JSX } from 'solid-js';

import type { ClientViewRoot } from '@src/web/ui-schema';

import {
  parseProcessRestartPayload,
  processRestartMessage,
  registerProcessRestart,
} from '../processRestartStatus';

type ProcessRestartViewProps = {
  view: ClientViewRoot;
};

export function ProcessRestartView(
  props: ProcessRestartViewProps,
): JSX.Element {
  onMount(() => registerProcessRestart(props.view));

  const message = () => {
    const payload = parseProcessRestartPayload(props.view.payload);

    return payload
      ? processRestartMessage(payload)
      : 'Restart status unavailable.';
  };

  return (
    <div role="status" aria-live="polite">
      {message()}
    </div>
  );
}
