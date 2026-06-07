import type { JSX } from 'solid-js';
import { For } from 'solid-js';

import { setupRows } from '../statusRows';
import type { SetupStatus } from '../transport';

import { StatusRow } from './StatusRow';

export function SetupStatusCard(props: { status: SetupStatus }): JSX.Element {
  const status = () => props.status;

  return (
    <section class="card setup-card" aria-labelledby="setup-title">
      <div class="setup-card-head">
        <div>
          <h1 id="setup-title">Configuration Status</h1>
        </div>
        <span class="setup-badge" classList={{ 'is-ok': status().configured }}>
          {status().configured ? 'ready' : 'needs setup'}
        </span>
      </div>

      <p class="setup-copy">
        This setup screen is protected by the boot secret printed in the server
        logs. The secret changes on restart unless SETUP_SECRET is set.
      </p>

      <dl class="setup-runtime-grid">
        <div>
          <dt>Version</dt>
          <dd>{status().runtime.version}</dd>
        </div>
        <div>
          <dt>Command prefix</dt>
          <dd>{status().runtime.prefix}</dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>{status().defaults.backend}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{status().defaults.provider}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{status().defaults.mode}</dd>
        </div>
        <div>
          <dt>Bot pubkey</dt>
          <dd>{status().runtime.botPubkey ?? 'not available'}</dd>
        </div>
      </dl>

      <ul class="setup-status-list">
        <For each={setupRows(status())}>{(row) => <StatusRow {...row} />}</For>
      </ul>
    </section>
  );
}
