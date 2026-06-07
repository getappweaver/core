import type { JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';

import {
  setupWebPush,
  type SetupStatus,
  type SetupWebPushResponse,
} from '../transport';

type WebPushSetupCardProps = {
  token: string;
  status: SetupStatus;
  onSaved: () => void;
};

export function WebPushSetupCard(props: WebPushSetupCardProps): JSX.Element {
  const [subject, setSubject] = createSignal('mailto:operator@example.com');

  const [generateNewKeys, setGenerateNewKeys] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [result, setResult] = createSignal<SetupWebPushResponse | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      const next = await setupWebPush(
        props.token,
        subject(),
        generateNewKeys(),
      );

      setResult(next);
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="card setup-card setup-card--web-push">
      <div class="setup-card-head">
        <div>
          <h1>Browser notifications</h1>
        </div>
        <span
          class="setup-badge"
          classList={{ 'is-ok': props.status.env.webPush }}
        >
          {props.status.env.webPush ? 'configured' : 'optional'}
        </span>
      </div>
      <p class="setup-copy">
        Generate VAPID keys for PWA/browser notifications. After restart, open
        the main web UI and enable Push from the header to subscribe this
        browser.
      </p>
      <label class="field-block setup-relay-field">
        <span class="field-label">VAPID subject</span>
        <input
          type="text"
          value={subject()}
          placeholder="mailto:you@example.com"
          onInput={(event) => setSubject(event.currentTarget.value)}
        />
        <small>Use mailto:you@example.com or an https:// URL.</small>
      </label>
      <label class="field-block setup-checkbox-field">
        <span class="setup-checkbox-row">
          <input
            type="checkbox"
            class="checkbox-retro"
            checked={generateNewKeys()}
            onChange={(event) =>
              setGenerateNewKeys(event.currentTarget.checked)
            }
          />
          Generate a new VAPID key pair
        </span>
        <small>
          Leave enabled for first setup. Existing browsers must re-enable Push
          if keys are regenerated.
        </small>
      </label>
      <div class="setup-step-actions">
        <button
          type="button"
          class="web-button"
          disabled={saving() || subject().trim().length === 0}
          onClick={() => void save()}
        >
          {saving() ? 'Saving...' : 'Save Web Push config'}
        </button>
      </div>
      <Show when={result()}>
        {(saved) => (
          <div class="setup-step setup-auth-step is-ok">
            <span class="setup-step-marker">✓</span>
            <div class="setup-step-body">
              <h2>Web Push config</h2>
              <p>
                Saved {saved().subject} / {saved().publicKey.slice(0, 14)}...
              </p>
            </div>
          </div>
        )}
      </Show>
      <Show when={error()}>
        {(message) => <p class="setup-error-line">{message()}</p>}
      </Show>
    </section>
  );
}
