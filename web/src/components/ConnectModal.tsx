// ---------------------------------------------------------------------------
// web/src/components/ConnectModal.tsx — NIP-07 / Bunker connect modal
// ---------------------------------------------------------------------------

import { createSignal, Show } from 'solid-js';
import type { JSX } from 'solid-js';

import {
  completeNostrConnect,
  connectBunker,
  generateNostrConnectUri,
} from '../nostr/bunker';
import { nostrConnectUriToQrSvg } from '../nostr/connect-qr';
import { getPublicKeyViaNip55 } from '../nostr/nip55';
import type { NostrAuthContextValue } from '../contexts/NostrAuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'nip07' | 'bunker' | 'nostrconnect' | 'nip55';

type ConnectModalProps = {
  onClose: () => void;
  auth: NostrAuthContextValue;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectModal(props: ConnectModalProps): JSX.Element {
  const [tab, setTab] = createSignal<Tab>('nip07');
  const [bunkerUrl, setBunkerUrl] = createSignal('');
  const [nostrConnectRelays, setNostrConnectRelays] = createSignal(
    'wss://relay.primal.net',
  );
  const [nostrConnectUri, setNostrConnectUri] = createSignal<string | null>(
    null,
  );
  const [nostrConnectQrSvg, setNostrConnectQrSvg] = createSignal<string | null>(
    null,
  );
  const [nostrConnectQrLoading, setNostrConnectQrLoading] = createSignal(false);
  const [nostrConnectCopied, setNostrConnectCopied] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  function isNip07Available(): boolean {
    return typeof window !== 'undefined' && !!window.nostr;
  }

  async function handleNip07Connect(): Promise<void> {
    if (!window.nostr) {
      setError('NIP-07 extension not found. Install Alby, nos2x, or similar.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pubkey = await window.nostr.getPublicKey();
      props.auth.connect({ method: 'nip07', pubkey });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extension error');
    } finally {
      setLoading(false);
    }
  }

  async function handleNip55Connect(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const pubkey = await getPublicKeyViaNip55();
      props.auth.connect({ method: 'nip55', pubkey });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Amber connection failed');
    } finally {
      setLoading(false);
    }
  }

  function parseRelaysInput(raw: string): string[] {
    return raw
      .split(/[\n,]+/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
  }

  async function handleNostrConnect(): Promise<void> {
    const relays = parseRelaysInput(nostrConnectRelays());

    if (relays.length === 0) {
      setError('Add at least one relay (one per line or comma-separated).');
      return;
    }

    setLoading(true);
    setError(null);
    setNostrConnectUri(null);
    setNostrConnectQrSvg(null);
    setNostrConnectCopied(false);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    try {
      const prepared = generateNostrConnectUri({
        relays,
        name: 'AppWeaver',
        url: origin,
      });

      setNostrConnectUri(prepared.uri);

      setNostrConnectQrLoading(true);

      try {
        const svg = await nostrConnectUriToQrSvg({ uri: prepared.uri });
        setNostrConnectQrSvg(svg);
      } catch {
        setNostrConnectQrSvg(null);
      } finally {
        setNostrConnectQrLoading(false);
      }

      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });

      const bunkerData = await completeNostrConnect({
        uri: prepared.uri,
        clientSecretKey: prepared.clientSecretKey,
      });

      props.auth.connect({ method: 'bunker', bunkerData });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nostr Connect failed');
    } finally {
      setLoading(false);
    }
  }

  async function copyNostrConnectUri(uri: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(uri);
      setNostrConnectCopied(true);
      window.setTimeout(() => {
        setNostrConnectCopied(false);
      }, 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }

  async function handleBunkerConnect(): Promise<void> {
    const url = bunkerUrl().trim();

    if (!url) {
      setError('Paste a bunker:// URL first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const bunkerData = await connectBunker(url);
      props.auth.connect({ method: 'bunker', bunkerData });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      props.onClose();
    }
  }

  return (
    <div
      class="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Connect Nostr signer"
    >
      <div class="modal panel">
        <div class="modal-header">
          <span class="modal-title">Connect</span>
          <button
            type="button"
            class="close-btn"
            onClick={props.onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div class="modal-tabs">
          <button
            type="button"
            class={`modal-tab${tab() === 'nip07' ? ' active' : ''}`}
            onClick={() => {
              setTab('nip07');
              setError(null);
              setNostrConnectUri(null);
              setNostrConnectQrSvg(null);
              setNostrConnectCopied(false);
            }}
          >
            Extension
          </button>
          <button
            type="button"
            class={`modal-tab${tab() === 'bunker' ? ' active' : ''}`}
            onClick={() => {
              setTab('bunker');
              setError(null);
              setNostrConnectUri(null);
              setNostrConnectQrSvg(null);
              setNostrConnectCopied(false);
            }}
          >
            Bunker URL
          </button>
          <button
            type="button"
            class={`modal-tab${tab() === 'nip55' ? ' active' : ''}`}
            onClick={() => {
              setTab('nip55');
              setError(null);
              setNostrConnectUri(null);
              setNostrConnectQrSvg(null);
              setNostrConnectCopied(false);
            }}
          >
            Amber
          </button>
          <button
            type="button"
            class={`modal-tab${tab() === 'nostrconnect' ? ' active' : ''}`}
            onClick={() => {
              setTab('nostrconnect');
              setError(null);
              setNostrConnectUri(null);
              setNostrConnectQrSvg(null);
              setNostrConnectCopied(false);
            }}
          >
            Nostr Connect
          </button>
        </div>

        <div class="modal-body">
          <Show when={tab() === 'nip07'}>
            <Show
              when={isNip07Available()}
              fallback={
                <p class="muted" style={{ 'font-size': '0.9rem' }}>
                  No NIP-07 extension detected. Install{' '}
                  <a
                    href="https://getalby.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#8ab4ff' }}
                  >
                    Alby
                  </a>{' '}
                  or{' '}
                  <a
                    href="https://github.com/fiatjaf/nos2x"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#8ab4ff' }}
                  >
                    nos2x
                  </a>
                  .
                </p>
              }
            >
              <p
                class="muted"
                style={{ 'font-size': '0.9rem', 'margin-bottom': '0.9rem' }}
              >
                Sign in with your browser Nostr extension.
              </p>
              <div class="actions-row">
                <button
                  type="button"
                  disabled={loading()}
                  onClick={() => void handleNip07Connect()}
                >
                  {loading() ? 'Connecting…' : 'Connect with extension'}
                </button>
              </div>
            </Show>
          </Show>

          <Show when={tab() === 'nip55'}>
            <p
              class="muted"
              style={{ 'font-size': '0.9rem', 'margin-bottom': '0.65rem' }}
            >
              Direct Android signer via <code>nostrsigner:</code> deep links
              (NIP-55 style). Best for Amber on mobile when you want to avoid
              relay-based NIP-46 handshakes.
            </p>
            <p
              class="muted"
              style={{ 'font-size': '0.82rem', 'margin-bottom': '0.7rem' }}
            >
              Tapping connect opens Amber to request your public key. After
              returning, the app will read the result from the clipboard when
              possible, or ask you to paste it.
            </p>
            <div class="actions-row">
              <button
                type="button"
                disabled={loading()}
                onClick={() => void handleNip55Connect()}
              >
                {loading() ? 'Opening Amber…' : 'Connect with Amber'}
              </button>
            </div>
          </Show>

          <Show when={tab() === 'nostrconnect'}>
            <p
              class="muted"
              style={{ 'font-size': '0.9rem', 'margin-bottom': '0.65rem' }}
            >
              Client-initiated NIP-46: we generate a{' '}
              <code>nostrconnect://</code> link. Open it in your remote signer
              (e.g. Amethyst, Nostr Wallet Connect), then approve the
              connection. Same session storage as Bunker URL after success.
            </p>
            <div class="field-row">
              <textarea
                value={nostrConnectRelays()}
                onInput={(e) => setNostrConnectRelays(e.currentTarget.value)}
                placeholder="wss://relay.primal.net"
                rows={3}
                disabled={loading()}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  border: '1px solid #31313d',
                  'border-radius': '6px',
                  background: '#101016',
                  color: '#ededf2',
                  padding: '0.45rem 0.55rem',
                  font: 'inherit',
                  'font-size': '0.85rem',
                }}
              />
            </div>
            <div class="actions-row" style={{ 'margin-top': '0.65rem' }}>
              <button
                type="button"
                disabled={loading() || !nostrConnectRelays().trim()}
                onClick={() => void handleNostrConnect()}
              >
                {loading() ? 'Waiting for signer…' : 'Generate link & connect'}
              </button>
            </div>
            <Show when={nostrConnectUri()}>
              {(uri) => (
                <div style={{ 'margin-top': '0.75rem' }}>
                  <p
                    class="muted"
                    style={{
                      'font-size': '0.82rem',
                      'margin-bottom': '0.35rem',
                    }}
                  >
                    Scan the QR with your signer, or copy the link:
                  </p>
                  <div class="nostr-connect-qr-wrap">
                    <Show
                      when={nostrConnectQrLoading()}
                      fallback={
                        <Show
                          when={nostrConnectQrSvg()}
                          fallback={
                            <div class="nostr-connect-qr-placeholder muted">
                              QR unavailable — use the text link below.
                            </div>
                          }
                        >
                          {(svgMarkup) => (
                            <button
                              type="button"
                              class="nostr-connect-qr-box"
                              title="Click to copy URI"
                              onClick={() => void copyNostrConnectUri(uri())}
                              innerHTML={svgMarkup()}
                            />
                          )}
                        </Show>
                      }
                    >
                      <div class="nostr-connect-qr-placeholder muted">
                        Generating QR…
                      </div>
                    </Show>
                  </div>
                  <Show when={nostrConnectCopied()}>
                    <p
                      class="muted"
                      style={{
                        'font-size': '0.78rem',
                        'margin-top': '0.35rem',
                        color: '#8ab4ff',
                      }}
                    >
                      Copied to clipboard.
                    </p>
                  </Show>
                  <textarea
                    readOnly
                    value={uri()}
                    rows={3}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      border: '1px solid #31313d',
                      'border-radius': '6px',
                      background: '#0a0a0f',
                      color: '#c8c8d4',
                      padding: '0.45rem 0.55rem',
                      font: 'inherit',
                      'font-size': '0.78rem',
                      'margin-top': '0.55rem',
                    }}
                  />
                  <div class="actions-row" style={{ 'margin-top': '0.45rem' }}>
                    <button
                      type="button"
                      onClick={() => void copyNostrConnectUri(uri())}
                    >
                      Copy URI
                    </button>
                    <a
                      href={uri()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#8ab4ff',
                        'font-size': '0.85rem',
                        'align-self': 'center',
                      }}
                    >
                      Open link
                    </a>
                  </div>
                </div>
              )}
            </Show>
          </Show>

          <Show when={tab() === 'bunker'}>
            <p
              class="muted"
              style={{ 'font-size': '0.9rem', 'margin-bottom': '0.65rem' }}
            >
              Paste the <code>bunker://</code> URL from your remote signer
              (NIP-46).
            </p>
            <div class="field-row">
              <textarea
                value={bunkerUrl()}
                onInput={(e) => setBunkerUrl(e.currentTarget.value)}
                placeholder="bunker://<pubkey>?relay=wss://..."
                rows={3}
                disabled={loading()}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  border: '1px solid #31313d',
                  'border-radius': '6px',
                  background: '#101016',
                  color: '#ededf2',
                  padding: '0.45rem 0.55rem',
                  font: 'inherit',
                  'font-size': '0.85rem',
                }}
              />
            </div>
            <div class="actions-row" style={{ 'margin-top': '0.65rem' }}>
              <button
                type="button"
                disabled={loading() || !bunkerUrl().trim()}
                onClick={() => void handleBunkerConnect()}
              >
                {loading() ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </Show>

          <Show when={error()}>
            <p
              class="error-text"
              style={{ 'margin-top': '0.7rem', 'font-size': '0.88rem' }}
            >
              {error()}
            </p>
          </Show>
        </div>
      </div>
    </div>
  );
}
