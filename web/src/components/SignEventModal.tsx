// ---------------------------------------------------------------------------
// web/src/components/SignEventModal.tsx — choose signer for Nostr events
// ---------------------------------------------------------------------------

import { nip19 } from 'nostr-tools';
import type { JSX } from 'solid-js';
import { For, Show, createSignal, onCleanup } from 'solid-js';

import {
  completeNostrConnect,
  connectBunker,
  generateNostrConnectUri,
} from '../nostr/bunker';
import type { BunkerConnection } from '../nostr/bunkerConnections';
import { nostrConnectUriToQrSvg } from '../nostr/connect-qr';
import type { BunkerSignerData } from '../nostr/storage';

import { WebButton } from './WebButton';

type SignEventChoice =
  | { method: 'current' }
  | { method: 'bunker'; bunkerData: BunkerSignerData };

type SignEventModalProps = {
  title: string;
  currentPubkey: string;
  bunkerConnections: BunkerConnection[];
  onAddBunker: (props: {
    name: string;
    data: BunkerSignerData;
  }) => Promise<BunkerConnection>;
  onChoose: (choice: SignEventChoice) => void;
  onCancel: () => void;
};

function formatNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

function relaysSummary(data: BunkerSignerData): string {
  return data.relays.length > 0 ? data.relays.join(', ') : '(none)';
}

type PreparedNostrConnect = {
  uri: string;
  clientSecretKey: Uint8Array;
  qrSvg: string | null;
};

type MainTab = 'current' | 'bunker';
type BunkerTab = 'client' | 'initiated';

const cardStyle: JSX.CSSProperties = {
  display: 'grid',
  gap: '0.45rem',
  border: '1px solid #343442',
  'border-radius': '0',
  background: '#111119',
  color: '#ededf2',
  padding: '0.8rem',
};

const warningButtonStyle: JSX.CSSProperties = {
  background: 'var(--color-warning)',
  color: '#000',
};

const textAreaStyle: JSX.CSSProperties = {
  width: '100%',
  resize: 'vertical',
  border: 'none',
  'border-radius': '0',
  background: '#000',
  color: 'var(--color-warning)',
  padding: '0.5rem 0.55rem',
  outline: '0',
  font: 'inherit',
  'font-size': '0.85rem',
};

function BinIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7.69231 8.70833H5V8.16667H9.84615M7.69231 8.70833V19H16.3077V8.70833M7.69231 8.70833H16.3077M16.3077 8.70833H19V8.16667H14.1538M9.84615 8.16667V6H14.1538V8.16667M9.84615 8.16667H14.1538"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M10 11V17"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 11V17"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M14 11V17"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function SignEventModal(props: SignEventModalProps): JSX.Element {
  let mounted = true;

  const [relays, setRelays] = createSignal(['wss://relay.primal.net']);
  const [connectionName, setConnectionName] = createSignal('');
  const [bunkerUrl, setBunkerUrl] = createSignal('');
  const [mainTab, setMainTab] = createSignal<MainTab>('current');
  const [bunkerTab, setBunkerTab] = createSignal<BunkerTab>('client');

  const [prepared, setPrepared] = createSignal<PreparedNostrConnect | null>(
    null,
  );

  const [connectedBunker, setConnectedBunker] =
    createSignal<BunkerSignerData | null>(null);

  const [connecting, setConnecting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);

  function trimmedConnectionName(): string {
    return connectionName().trim();
  }

  function connectionNameError(): string | null {
    const name = trimmedConnectionName();

    if (!name) {
      return 'Name is required.';
    }

    if (
      props.bunkerConnections.some((connection) => connection.name === name)
    ) {
      return `A bunker connection named "${name}" already exists.`;
    }

    return null;
  }

  onCleanup(() => {
    mounted = false;
  });

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      props.onCancel();
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      props.onCancel();
    }
  }

  function updateRelay(index: number, value: string): void {
    setRelays((current) =>
      current.map((relay, relayIndex) =>
        relayIndex === index ? value : relay,
      ),
    );
  }

  function addRelay(): void {
    setRelays((current) => [...current, '']);
  }

  function removeRelay(index: number): void {
    setRelays((current) =>
      current.filter((_, relayIndex) => relayIndex !== index),
    );
  }

  async function copyPreparedUri(uri: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);

      window.setTimeout(() => {
        if (mounted) {
          setCopied(false);
        }
      }, 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }

  async function handleGenerateNostrConnect(): Promise<void> {
    const nameError = connectionNameError();

    if (nameError) {
      setError(nameError);

      return;
    }

    const cleanRelays = relays()
      .map((relay) => relay.trim())
      .filter(Boolean);

    if (cleanRelays.length === 0) {
      setError('Add at least one relay.');

      return;
    }

    setError(null);
    setCopied(false);
    setConnectedBunker(null);

    let next: PreparedNostrConnect;

    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';

      const generated = generateNostrConnectUri({
        relays: cleanRelays,
        name: 'AppWeaver',
        url: origin,
      });

      let qrSvg: string | null = null;

      try {
        qrSvg = await nostrConnectUriToQrSvg({ uri: generated.uri });
      } catch {
        qrSvg = null;
      }

      next = { ...generated, qrSvg };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate URI');

      return;
    }

    setPrepared(next);
    setConnecting(true);

    try {
      const data = await completeNostrConnect({
        uri: next.uri,
        clientSecretKey: next.clientSecretKey,
      });

      if (mounted) {
        setConnectedBunker(data);
      }
    } catch (err) {
      if (mounted) {
        setError(err instanceof Error ? err.message : 'Nostr Connect failed');
      }
    } finally {
      if (mounted) {
        setConnecting(false);
      }
    }
  }

  async function handleConnectBunkerUrl(): Promise<void> {
    const nameError = connectionNameError();

    if (nameError) {
      setError(nameError);

      return;
    }

    const url = bunkerUrl().trim();

    if (!url) {
      setError('Paste a bunker:// URL first.');

      return;
    }

    setConnecting(true);
    setError(null);
    setConnectedBunker(null);

    try {
      const data = await connectBunker(url);

      if (mounted) {
        setConnectedBunker(data);
      }
    } catch (err) {
      if (mounted) {
        setError(
          err instanceof Error ? err.message : 'Bunker connection failed',
        );
      }
    } finally {
      if (mounted) {
        setConnecting(false);
      }
    }
  }

  async function handleSignWithConnectedBunker(
    data: BunkerSignerData,
  ): Promise<void> {
    const nameError = connectionNameError();

    if (nameError) {
      setError(nameError);

      return;
    }

    try {
      const connection = await props.onAddBunker({
        name: trimmedConnectionName(),
        data,
      });

      props.onChoose({ method: 'bunker', bunkerData: connection.data });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function loadingText(): string {
    if (connecting() && prepared()) {
      return 'Loading connection approval from remote signer...';
    }

    if (connecting()) {
      return 'Loading bunker connection...';
    }

    return '';
  }

  return (
    <div
      class="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Sign event"
    >
      <div
        class="modal panel"
        style={{
          display: 'flex',
          'flex-direction': 'column',
          'max-height': 'min(90vh, 48rem)',
          overflow: 'hidden',
        }}
      >
        <div class="modal-header">
          <span class="modal-title">{props.title}</span>
          <WebButton
            type="button"
            class="close-btn"
            onClick={props.onCancel}
            aria-label="Close"
          >
            ✕
          </WebButton>
        </div>

        <div class="modal-tabs">
          <button
            type="button"
            class={`modal-tab${mainTab() === 'current' ? ' active' : ''}`}
            onClick={() => setMainTab('current')}
          >
            Use current web account
          </button>
          <button
            type="button"
            class={`modal-tab${mainTab() === 'bunker' ? ' active' : ''}`}
            onClick={() => setMainTab('bunker')}
          >
            Use a bunker connection
          </button>
        </div>

        <div class="modal-body" style={{ overflow: 'auto' }}>
          <Show when={mainTab() === 'current'}>
            <div style={cardStyle}>
              <strong>Current web account</strong>
              <span class="muted" style={{ 'font-size': '0.82rem' }}>
                Pubkey: {props.currentPubkey}
              </span>
              <span class="muted" style={{ 'font-size': '0.82rem' }}>
                npub: {formatNpub(props.currentPubkey)}
              </span>
              <div class="actions-row">
                <WebButton
                  type="button"
                  style={warningButtonStyle}
                  onClick={() => props.onChoose({ method: 'current' })}
                >
                  Select
                </WebButton>
              </div>
            </div>
          </Show>

          <Show when={mainTab() === 'bunker'}>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <Show
                when={props.bunkerConnections.length > 0}
                fallback={
                  <p
                    class="muted"
                    style={{ margin: 0, 'font-size': '0.85rem' }}
                  >
                    No saved bunker connections yet.
                  </p>
                }
              >
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  <strong>Saved bunker connections</strong>
                  <For each={props.bunkerConnections}>
                    {(connection) => (
                      <div style={cardStyle}>
                        <span>{connection.name}</span>
                        <span class="muted" style={{ 'font-size': '0.8rem' }}>
                          Pubkey: {connection.data.userPubkey}
                        </span>
                        <span class="muted" style={{ 'font-size': '0.8rem' }}>
                          npub: {formatNpub(connection.data.userPubkey)}
                        </span>
                        <span class="muted" style={{ 'font-size': '0.8rem' }}>
                          Relays: {connection.data.relays.length} (
                          {relaysSummary(connection.data)})
                        </span>
                        <div class="actions-row">
                          <WebButton
                            type="button"
                            style={warningButtonStyle}
                            onClick={() =>
                              props.onChoose({
                                method: 'bunker',
                                bunkerData: connection.data,
                              })
                            }
                          >
                            Select
                          </WebButton>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <div style={{ display: 'grid', gap: '0.55rem' }}>
                <strong>Create a new bunker connection</strong>
                <div class="modal-tabs">
                  <button
                    type="button"
                    class={`modal-tab${bunkerTab() === 'client' ? ' active' : ''}`}
                    onClick={() => setBunkerTab('client')}
                  >
                    Client initiated
                  </button>
                  <button
                    type="button"
                    class={`modal-tab${bunkerTab() === 'initiated' ? ' active' : ''}`}
                    onClick={() => setBunkerTab('initiated')}
                  >
                    Bunker initiated
                  </button>
                </div>

                <Show when={bunkerTab() === 'client'}>
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    <label class="field-block">
                      <span>Name</span>
                      <input
                        type="text"
                        value={connectionName()}
                        onInput={(e) =>
                          setConnectionName(e.currentTarget.value)
                        }
                        placeholder="Personal signer"
                        disabled={connecting()}
                      />
                    </label>
                    <span class="muted field-adjacent-text">
                      Generate a QR code and scan it in your remote signing app.
                      The named connection will be saved after approval.
                    </span>
                    <span class="field-adjacent-text">Relays</span>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <For each={relays()}>
                        {(relay, index) => (
                          <div
                            style={{
                              display: 'grid',
                              'grid-template-columns': '1fr auto',
                              gap: '0.25rem',
                              'align-items': 'center',
                            }}
                          >
                            <label class="field-block" style={{ margin: 0 }}>
                              <input
                                type="text"
                                value={relay}
                                onInput={(e) =>
                                  updateRelay(index(), e.currentTarget.value)
                                }
                                placeholder="wss://relay.example.com"
                                disabled={connecting()}
                              />
                            </label>
                            <button
                              type="button"
                              aria-label="Remove relay"
                              disabled={connecting() || relays().length <= 1}
                              style={{
                                display: 'grid',
                                'place-items': 'center',
                                width: '2.15rem',
                                height: '2.15rem',
                                padding: '0.3rem',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--color-warning)',
                                cursor:
                                  connecting() || relays().length <= 1
                                    ? 'not-allowed'
                                    : 'pointer',
                                opacity:
                                  connecting() || relays().length <= 1
                                    ? 0.45
                                    : 1,
                                'box-shadow': 'none',
                                transform: 'none',
                              }}
                              onClick={() => removeRelay(index())}
                            >
                              <span
                                style={{ display: 'block', width: '1.25rem' }}
                              >
                                <BinIcon />
                              </span>
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                    <div class="actions-row">
                      <WebButton
                        type="button"
                        disabled={connecting()}
                        style={warningButtonStyle}
                        onClick={addRelay}
                      >
                        + Relay
                      </WebButton>
                    </div>
                    <div class="actions-row">
                      <WebButton
                        type="button"
                        disabled={connecting()}
                        style={warningButtonStyle}
                        onClick={() => void handleGenerateNostrConnect()}
                      >
                        {connecting() ? 'Waiting…' : 'Generate'}
                      </WebButton>
                    </div>
                  </div>
                </Show>

                <Show when={bunkerTab() === 'initiated'}>
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    <label class="field-block">
                      <span>Name</span>
                      <input
                        type="text"
                        value={connectionName()}
                        onInput={(e) =>
                          setConnectionName(e.currentTarget.value)
                        }
                        placeholder="Personal signer"
                        disabled={connecting()}
                      />
                    </label>
                    <label class="field-block">
                      <span>bunker:// URL</span>
                      <input
                        type="text"
                        value={bunkerUrl()}
                        onInput={(e) => setBunkerUrl(e.currentTarget.value)}
                        placeholder="bunker://<pubkey>?relay=wss://..."
                        disabled={connecting()}
                      />
                    </label>
                    <div class="actions-row">
                      <WebButton
                        type="button"
                        disabled={connecting() || !bunkerUrl().trim()}
                        style={warningButtonStyle}
                        onClick={() => void handleConnectBunkerUrl()}
                      >
                        {connecting() ? 'Connecting…' : 'Connect'}
                      </WebButton>
                    </div>
                  </div>
                </Show>
              </div>

              <Show when={prepared()}>
                {(preparedConnect) => (
                  <div
                    style={{
                      display: 'grid',
                      gap: '0.45rem',
                      border: '1px solid #343442',
                      'border-radius': '0',
                      padding: '0.65rem',
                    }}
                  >
                    <Show when={preparedConnect().qrSvg}>
                      {(qrSvg) => (
                        <button
                          type="button"
                          onClick={() =>
                            void copyPreparedUri(preparedConnect().uri)
                          }
                          innerHTML={qrSvg()}
                          style={{
                            width: 'fit-content',
                            border: 'none',
                            'border-radius': '0',
                            background: '#fff',
                            padding: '0.5rem',
                            cursor: 'copy',
                          }}
                        />
                      )}
                    </Show>
                    <textarea
                      readonly
                      value={preparedConnect().uri}
                      rows={4}
                      style={textAreaStyle}
                    />
                    <div class="actions-row">
                      <WebButton
                        type="button"
                        style={warningButtonStyle}
                        onClick={() =>
                          void copyPreparedUri(preparedConnect().uri)
                        }
                      >
                        {copied() ? 'Copied' : 'Copy'}
                      </WebButton>
                      <span class="muted" style={{ 'font-size': '0.82rem' }}>
                        {loadingText()}
                      </span>
                    </div>
                  </div>
                )}
              </Show>

              <Show when={connectedBunker()}>
                {(data) => (
                  <div
                    style={{
                      display: 'grid',
                      gap: '0.4rem',
                      border: '1px solid #3b5b3f',
                      'border-radius': '0',
                      padding: '0.65rem',
                      background: '#0d1710',
                    }}
                  >
                    <strong>Connected remote user</strong>
                    <span class="muted" style={{ 'font-size': '0.82rem' }}>
                      Pubkey: {data().userPubkey}
                    </span>
                    <span class="muted" style={{ 'font-size': '0.82rem' }}>
                      npub: {formatNpub(data().userPubkey)}
                    </span>
                    <div class="actions-row">
                      <WebButton
                        type="button"
                        style={warningButtonStyle}
                        onClick={() =>
                          void handleSignWithConnectedBunker(data())
                        }
                      >
                        Sign with this bunker
                      </WebButton>
                    </div>
                  </div>
                )}
              </Show>

              <Show when={error()}>
                {(message) => (
                  <p class="status-modal-error" role="alert">
                    {message()}
                  </p>
                )}
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
