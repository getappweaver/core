import type { JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';

import { waitForRestartThenOpenApp } from '../restart';
import { restartSetupApp, type SetupStatus } from '../transport';

type SetupCompletionCardProps = {
  status: SetupStatus;
  token: string;
};

export function SetupCompletionCard(
  props: SetupCompletionCardProps,
): JSX.Element {
  const [restartState, setRestartState] = createSignal<
    'idle' | 'requested' | 'failed'
  >('idle');

  const [restartError, setRestartError] = createSignal<string | null>(null);

  async function restartAndOpen(): Promise<void> {
    setRestartState('requested');
    setRestartError(null);

    try {
      await restartSetupApp(props.token);
      await waitForRestartThenOpenApp();
    } catch (err) {
      setRestartState('failed');
      setRestartError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Show when={props.status.configured}>
      <section class="card setup-card setup-card--complete">
        <div class="setup-card-head">
          <div>
            <h1>Restart into AppWeaver</h1>
          </div>
          <span class="setup-badge is-ok">ready</span>
        </div>
        <p class="setup-copy">
          Required configuration is saved. Restart AppWeaver so it can leave
          setup-only mode, connect to relays, and load the full web interface.
        </p>
        <div class="setup-step-actions">
          <button
            type="button"
            class="web-button setup-success-action"
            disabled={restartState() === 'requested'}
            onClick={() => void restartAndOpen()}
          >
            {restartState() === 'requested'
              ? 'Restarting...'
              : 'Restart and open app'}
          </button>
          <Show when={restartState() === 'requested'}>
            <span class="setup-inline-code">waiting for /api/health</span>
          </Show>
        </div>
        <p class="setup-warning-line">
          If this process was started without a restart watcher, restart the
          container or process manually, then open <code>/</code>.
        </p>
        <Show when={restartError()}>
          {(error) => <p class="setup-error-line">{error()}</p>}
        </Show>
      </section>
    </Show>
  );
}
