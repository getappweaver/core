import type { JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';

import { setCursorApiKey, type SetupStatus } from '../transport';

type CursorSetupCardProps = {
  token: string;
  status: SetupStatus;
  onSaved: () => void;
};

export function CursorSetupCard(props: CursorSetupCardProps): JSX.Element {
  const [apiKey, setApiKey] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function saveApiKey(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      await setCursorApiKey(props.token, apiKey());
      setApiKey('');
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="card setup-card setup-card--cursor">
      <div class="setup-card-head">
        <div>
          <h1>Add Cursor API key</h1>
        </div>
        <span
          class="setup-badge"
          classList={{ 'is-ok': props.status.env.cursorApiKey }}
        >
          {props.status.env.cursorApiKey ? 'saved' : 'optional'}
        </span>
      </div>
      <p class="setup-copy">
        If you choose the Cursor backend, create a cloud agents API key in
        Cursor, then paste it here. AppWeaver stores it as{' '}
        <code>CURSOR_API_KEY</code> in <code>.env</code>.
      </p>
      <div class="setup-step-actions">
        <a
          class="setup-text-link"
          href="https://cursor.com/dashboard/integrations#user-api-keys"
          target="_blank"
          rel="noreferrer"
        >
          Create Cursor API key
        </a>
      </div>
      <label class="field-block setup-relay-field">
        <span class="field-label">Cursor API key</span>
        <input
          type="password"
          value={apiKey()}
          autocomplete="off"
          placeholder="Paste Cursor API key"
          onInput={(event) => setApiKey(event.currentTarget.value)}
        />
        <small>The key is written to your mounted AppWeaver .env file.</small>
      </label>
      <div class="setup-step-actions">
        <button
          type="button"
          class="web-button"
          disabled={saving() || apiKey().trim().length === 0}
          onClick={() => void saveApiKey()}
        >
          {saving() ? 'Saving...' : 'Save Cursor key'}
        </button>
      </div>
      <div
        class="setup-step setup-auth-step"
        classList={{ 'is-ok': props.status.env.cursorApiKey }}
      >
        <span class="setup-step-marker">✓</span>
        <div class="setup-step-body">
          <h2>Cursor API key</h2>
          <p>
            {props.status.env.cursorApiKey
              ? 'CURSOR_API_KEY is saved in .env.'
              : 'Optional. Save a Cursor API key here only if you plan to use the Cursor backend.'}
          </p>
        </div>
      </div>
      <Show when={error()}>
        {(message) => <p class="setup-error-line">{message()}</p>}
      </Show>
    </section>
  );
}
