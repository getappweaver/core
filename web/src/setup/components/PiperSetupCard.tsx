import type { JSX } from 'solid-js';
import { createEffect, createMemo, createSignal, Show } from 'solid-js';

import {
  downloadPiperModel,
  setPiperConfig,
  type SetupStatus,
} from '../transport';

import { StatusRow } from './StatusRow';

type PiperSetupCardProps = {
  token: string;
  status: SetupStatus;
  onSaved: () => void;
};

export function PiperSetupCard(props: PiperSetupCardProps): JSX.Element {
  const detectedPiper = createMemo(
    () =>
      props.status.dependencies.find((dep) => dep.command === 'piper')?.path ??
      '',
  );

  const [binaryPath, setBinaryPath] = createSignal(
    props.status.piper.binaryPath,
  );

  const [modelPath, setModelPath] = createSignal(props.status.piper.modelPath);

  const [libraryPath, setLibraryPath] = createSignal(
    props.status.piper.libraryPath,
  );

  const [saving, setSaving] = createSignal(false);
  const [downloading, setDownloading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [message, setMessage] = createSignal<string | null>(null);

  createEffect(() => {
    setBinaryPath(props.status.piper.binaryPath);
    setModelPath(props.status.piper.modelPath);
    setLibraryPath(props.status.piper.libraryPath);
  });

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await setPiperConfig({
        token: props.token,
        binaryPath: binaryPath(),
        modelPath: modelPath(),
        libraryPath: libraryPath(),
      });

      setMessage('Piper environment saved.');
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function downloadModel(): Promise<void> {
    setDownloading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await downloadPiperModel(props.token);

      setModelPath(result.modelPath);
      setMessage(`Downloaded model and config to ${result.modelPath}`);
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section class="card setup-card setup-card--piper">
      <div class="setup-card-head">
        <div>
          <h1>Piper Speech</h1>
        </div>
        <span
          class="setup-badge"
          classList={{
            'is-ok':
              props.status.piper.binaryExists && props.status.piper.modelExists,
          }}
        >
          {props.status.piper.binaryExists && props.status.piper.modelExists
            ? 'ready'
            : 'optional'}
        </span>
      </div>
      <p class="setup-copy">
        Local speech uses Piper only when these environment variables are set.
        Download the default voice model here, or point to any compatible Piper{' '}
        <code>.onnx</code> voice model.
      </p>
      <div class="setup-defaults-grid setup-piper-grid">
        <label class="field-block">
          <span class="field-label">BOT_PIPER_BINARY_PATH</span>
          <input
            type="text"
            value={binaryPath()}
            placeholder={detectedPiper() || '/path/to/piper'}
            onInput={(event) => setBinaryPath(event.currentTarget.value)}
          />
          <small>
            {detectedPiper()
              ? `Detected on PATH: ${detectedPiper()}`
              : 'Enter an executable path or command, such as python3 -m piper.'}
          </small>
        </label>
        <label class="field-block">
          <span class="field-label">BOT_PIPER_MODEL_PATH</span>
          <input
            type="text"
            value={modelPath()}
            placeholder="/path/to/voice.onnx"
            onInput={(event) => setModelPath(event.currentTarget.value)}
          />
          <small>
            The matching .onnx.json config should sit next to the model.
          </small>
        </label>
        <label class="field-block">
          <span class="field-label">BOT_PIPER_LIBRARY_PATH</span>
          <input
            type="text"
            value={libraryPath()}
            placeholder="optional library path"
            onInput={(event) => setLibraryPath(event.currentTarget.value)}
          />
          <small>
            Usually empty. Set this only for custom Piper library folders.
          </small>
        </label>
      </div>
      <div class="setup-step-actions">
        <Show when={detectedPiper()}>
          {(path) => (
            <button
              type="button"
              class="web-button"
              onClick={() => setBinaryPath(path())}
            >
              Use detected Piper
            </button>
          )}
        </Show>
        <button
          type="button"
          class="web-button"
          disabled={downloading()}
          onClick={() => void downloadModel()}
        >
          {downloading() ? 'Downloading...' : 'Download default voice'}
        </button>
        <button
          type="button"
          class="web-button"
          disabled={saving()}
          onClick={() => void save()}
        >
          {saving() ? 'Saving...' : 'Save Piper env'}
        </button>
      </div>
      <ul class="setup-status-list setup-status-list--compact">
        <StatusRow
          label="Binary"
          ok={props.status.piper.binaryExists}
          detail={props.status.piper.binaryExists ? 'found' : 'not configured'}
        />
        <StatusRow
          label="Model"
          ok={props.status.piper.modelExists}
          detail={props.status.piper.modelExists ? 'found' : 'not configured'}
        />
      </ul>
      <Show when={message()}>
        {(text) => <p class="setup-inline-code">{text()}</p>}
      </Show>
      <Show when={error()}>
        {(text) => <p class="setup-error-line">{text()}</p>}
      </Show>
    </section>
  );
}
