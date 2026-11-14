// ---------------------------------------------------------------------------
// web/src/components/ConnectModal.tsx — NIP-07 / Bunker / NIP-49 connect modal
// ---------------------------------------------------------------------------

import { getPublicKey } from 'nostr-tools';
import { decrypt } from 'nostr-tools/nip49';
import type { JSX } from 'solid-js';
import { createSignal, onCleanup, Show } from 'solid-js';

import type {
  AuthState,
  NostrAuthContextValue,
} from '../contexts/NostrAuthContext';
import {
  completeNostrConnect,
  connectBunker,
  generateNostrConnectUri,
} from '../nostr/bunker';
import { nostrConnectUriToQrSvg } from '../nostr/connect-qr';
import { getPublicKeyViaNip55 } from '../nostr/nip55';
import {
  APPWEAVER_PROFILE_NAME,
  authenticateWithGooglePopup,
  computeDefaultThreshold,
  DEFAULT_POMEGRANATE_CENTRAL,
  ensureAppWeaverProfile,
  fetchPomegranateAccount,
  massagePomegranateUrl,
  pickDefaultOperators,
  publishSetupAnnouncementViaBunker,
  runPomegranateDkg,
  searchSetupAnnouncement,
  type PomegranateExistingAnnouncement,
} from '../nostr/pomegranate';

import { WebButton } from './WebButton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab =
  'nip07' | 'pomegranate' | 'bunker' | 'nostrconnect' | 'nip55' | 'nip49';

type ConnectModalProps = {
  onClose: () => void;
  auth: NostrAuthContextValue;
};

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

function isNcryptsecPasteFormat(raw: string): boolean {
  const s = raw.trim();

  return s.startsWith('ncryptsec1') && s.length >= 16;
}

function extractNcryptsecFromQrPayload(raw: string): string | null {
  const trimmed = raw.trim();

  const normalized = (
    trimmed.toLowerCase().startsWith('nostr:') ? trimmed.slice(6) : trimmed
  ).toLowerCase();

  if (isNcryptsecPasteFormat(normalized)) {
    return normalized;
  }

  const match = /ncryptsec1[023456789acdefghjklmnpqrstuvwxyz]+/i.exec(trimmed);

  return match?.[0].toLowerCase() ?? null;
}

function signerStatusText(state: AuthState): {
  title: string;
  detail?: string;
} {
  if (state.status === 'disconnected') {
    return { title: 'Not connected' };
  }

  if (state.status === 'locked') {
    return {
      title: 'Locked — Encrypted key (NIP-49)',
      detail: `Pubkey ${state.pubkey.slice(0, 8)}…`,
    };
  }

  const detail = `Pubkey ${state.pubkey.slice(0, 8)}…`;

  switch (state.method) {
    case 'nip07':
      return { title: 'Connected — Extension (NIP-07)', detail };
    case 'nip55':
      return { title: 'Connected — Amber (NIP-55)', detail };
    case 'bunker':
      return {
        title: 'Connected — Bunker / Nostr Connect (NIP-46)',
        detail,
      };
    case 'nip49':
      return { title: 'Connected — Encrypted key (NIP-49)', detail };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectModal(props: ConnectModalProps): JSX.Element {
  let nip49QrVideoEl: HTMLVideoElement | undefined;
  let nip49QrStream: MediaStream | null = null;
  let nip49QrAnimationFrame: number | null = null;

  const [tab, setTab] = createSignal<Tab>('nip07');
  const [ncryptsecField, setNcryptsecField] = createSignal('');
  const [nip49Password, setNip49Password] = createSignal('');
  const [bunkerUrl, setBunkerUrl] = createSignal('');
  const [nip49QrScanning, setNip49QrScanning] = createSignal(false);
  const [nip49QrStatus, setNip49QrStatus] = createSignal<string | null>(null);

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

  const [pomegranateCentral, setPomegranateCentral] = createSignal(
    DEFAULT_POMEGRANATE_CENTRAL,
  );

  const [pomegranateOperatorsText, setPomegranateOperatorsText] = createSignal(
    pickDefaultOperators(3).join('\n'),
  );

  const [pomegranateShowAdvanced, setPomegranateShowAdvanced] =
    createSignal(false);

  const [pomegranateStatus, setPomegranateStatus] = createSignal<string | null>(
    null,
  );

  const [pomegranateExistingCentral, setPomegranateExistingCentral] =
    createSignal<PomegranateExistingAnnouncement | null>(null);

  let pomegranateAbort: AbortController | null = null;

  function clearTabChrome(): void {
    stopNip49QrScanner();
    setError(null);
    setNostrConnectUri(null);
    setNostrConnectQrSvg(null);
    setNostrConnectCopied(false);
    setNcryptsecField('');
    setNip49Password('');

    if (pomegranateAbort) {
      pomegranateAbort.abort();
      pomegranateAbort = null;
    }

    setPomegranateStatus(null);
    setPomegranateExistingCentral(null);
  }

  function isNip07Available(): boolean {
    return typeof window !== 'undefined' && !!window.nostr;
  }

  function getBarcodeDetectorConstructor(): BarcodeDetectorConstructor | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return (window as WindowWithBarcodeDetector).BarcodeDetector ?? null;
  }

  function stopNip49QrScanner(): void {
    if (nip49QrAnimationFrame !== null) {
      cancelAnimationFrame(nip49QrAnimationFrame);
      nip49QrAnimationFrame = null;
    }

    if (nip49QrStream) {
      for (const track of nip49QrStream.getTracks()) {
        track.stop();
      }

      nip49QrStream = null;
    }

    if (nip49QrVideoEl) {
      nip49QrVideoEl.srcObject = null;
    }

    setNip49QrScanning(false);
  }

  async function startNip49QrScanner(): Promise<void> {
    const BarcodeDetector = getBarcodeDetectorConstructor();

    if (!BarcodeDetector) {
      setError(
        'QR scanning is not available in this browser. Try Chrome/Android or paste the ncryptsec value instead.',
      );

      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not available in this browser context.');

      return;
    }

    setError(null);
    setNip49QrStatus('Starting camera…');
    setNip49QrScanning(true);

    try {
      const supportedFormats = BarcodeDetector.getSupportedFormats
        ? await BarcodeDetector.getSupportedFormats()
        : ['qr_code'];

      if (!supportedFormats.includes('qr_code')) {
        throw new Error('QR codes are not supported by this browser scanner.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });

      nip49QrStream = stream;

      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });

      if (!nip49QrVideoEl) {
        throw new Error('Camera preview did not mount.');
      }

      nip49QrVideoEl.srcObject = stream;
      await nip49QrVideoEl.play();

      const detector = new BarcodeDetector({ formats: ['qr_code'] });

      setNip49QrStatus('Point your camera at the ncryptsec QR code.');

      const scan = async (): Promise<void> => {
        if (!nip49QrVideoEl || !nip49QrScanning()) {
          return;
        }

        try {
          if (nip49QrVideoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const codes = await detector.detect(nip49QrVideoEl);

            const scannedValue = codes
              .map((code) => code.rawValue ?? '')
              .map(extractNcryptsecFromQrPayload)
              .find((value): value is string => value !== null);

            if (scannedValue) {
              setNcryptsecField(scannedValue);
              setNip49QrStatus('QR scanned. Enter your passphrase to connect.');
              stopNip49QrScanner();

              return;
            }

            if (codes.length > 0) {
              setNip49QrStatus(
                'QR found, but it did not contain an ncryptsec value.',
              );
            }
          }
        } catch {
          // Keep scanning; transient detector failures can happen while video settles.
        }

        nip49QrAnimationFrame = requestAnimationFrame(() => {
          void scan();
        });
      };

      void scan();
    } catch (err) {
      stopNip49QrScanner();
      setNip49QrStatus(null);
      setError(err instanceof Error ? err.message : 'QR scanner failed');
    }
  }

  onCleanup(() => {
    stopNip49QrScanner();

    if (pomegranateAbort) {
      pomegranateAbort.abort();
      pomegranateAbort = null;
    }
  });

  function isExtensionConnectionError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message : String(error ?? '');

    const normalized = message.toLowerCase();

    return (
      normalized.includes('could not establish connection') ||
      normalized.includes('receiving end does not exist')
    );
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
      if (isExtensionConnectionError(err)) {
        setError(
          'NIP-07 extension is unavailable (disconnected). Reload the extension or browser tab, then try again.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Extension error');
      }
    } finally {
      setLoading(false);
    }
  }

  type HandlePomegranateConnectProps = {
    centralUrlOverride: string | null;
    skipDiscovery: boolean;
  };

  async function handlePomegranateConnect(
    connectProps: HandlePomegranateConnectProps,
  ): Promise<void> {
    if (pomegranateAbort) {
      pomegranateAbort.abort();
      pomegranateAbort = null;
    }

    pomegranateAbort = new AbortController();
    const signal = pomegranateAbort.signal;

    setError(null);
    setLoading(true);
    setPomegranateExistingCentral(null);

    try {
      const targetCentral =
        connectProps.centralUrlOverride ?? pomegranateCentral();

      const centralOrigin = massagePomegranateUrl(targetCentral);

      if (connectProps.centralUrlOverride) {
        setPomegranateCentral(centralOrigin);
      }

      setPomegranateStatus('Opening Google sign-in…');

      const { token, email } = await authenticateWithGooglePopup({
        centralUrl: centralOrigin,
        timeoutMs: 120000,
        signal,
      });

      setPomegranateStatus('Checking Pomegranate account…');
      let account = await fetchPomegranateAccount({
        centralUrl: centralOrigin,
        token,
        signal,
      });

      let isNewlyCreated = false;

      if (!account) {
        if (!connectProps.skipDiscovery) {
          setPomegranateStatus('Looking for existing setup on Nostr relays…');

          const existing = await searchSetupAnnouncement({
            email,
            timeoutMs: 4500,
          });

          if (existing && existing.centralUrl !== centralOrigin) {
            setPomegranateExistingCentral(existing);
            setLoading(false);
            setPomegranateStatus(null);

            return;
          }
        }

        const rawOps = pomegranateOperatorsText()
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const validOps = Array.from(
          new Set(rawOps.map((op) => massagePomegranateUrl(op))),
        );

        if (validOps.length < 2) {
          throw new Error(
            'At least 2 valid operator URLs are required for FROST threshold signing',
          );
        }

        const threshold = computeDefaultThreshold(validOps.length);

        setPomegranateStatus(
          `Generating ${threshold}-of-${validOps.length} threshold key (FROST DKG)…`,
        );

        account = await runPomegranateDkg({
          centralUrl: centralOrigin,
          token,
          operators: validOps,
          threshold,
          signal,
        });

        isNewlyCreated = true;
      }

      setPomegranateStatus('Provisioning AppWeaver bunker profile…');

      const { bunkerUrl: profileBunkerUrl } = await ensureAppWeaverProfile({
        centralUrl: centralOrigin,
        token,
        profileName: APPWEAVER_PROFILE_NAME,
        signal,
      });

      setPomegranateStatus('Connecting NIP-46 remote signer…');
      const bunkerData = await connectBunker(profileBunkerUrl);

      if (isNewlyCreated) {
        void publishSetupAnnouncementViaBunker({
          account,
          centralUrl: centralOrigin,
          bunkerData,
        }).catch((err) => {
          console.warn(
            '[Pomegranate] Failed to publish setup announcement:',
            err,
          );
        });
      }

      props.auth.connect({ method: 'bunker', bunkerData });
      clearTabChrome();
      props.onClose();
    } catch (err) {
      if (signal.aborted) {
        return;
      }

      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (pomegranateAbort?.signal === signal) {
        setLoading(false);
        setPomegranateStatus(null);
      }
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

  async function handleNip49Connect(): Promise<void> {
    const raw = ncryptsecField().trim();

    if (!isNcryptsecPasteFormat(raw)) {
      setError('Not in expected format');

      return;
    }

    const pw = nip49Password();

    if (!pw) {
      setError('Enter passphrase');

      return;
    }

    setLoading(true);
    setError(null);

    try {
      const secretKey = decrypt(raw, pw);
      const pubkey = getPublicKey(secretKey);

      props.auth.connect({
        method: 'nip49',
        ncryptsec: raw,
        pubkey,
        secretKey,
      });

      setNip49Password('');
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decrypt failed');
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
          <WebButton
            type="button"
            class="close-btn"
            onClick={props.onClose}
            aria-label="Close"
          >
            ✕
          </WebButton>
        </div>

        <Show when={props.auth.authState().status !== 'disconnected'}>
          <div
            style={{
              display: 'flex',
              'align-items': 'flex-start',
              'justify-content': 'space-between',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              'font-size': '0.82rem',
            }}
          >
            {(() => {
              const s = signerStatusText(props.auth.authState());

              return (
                <div>
                  <div style={{ color: '#e8e8ef', 'font-weight': 500 }}>
                    {s.title}
                  </div>
                  {s.detail ? (
                    <div class="muted" style={{ 'margin-top': '0.2rem' }}>
                      {s.detail}
                    </div>
                  ) : null}
                </div>
              );
            })()}
            <WebButton
              type="button"
              class="close-btn"
              style={{ 'flex-shrink': 0 }}
              onClick={() => {
                props.auth.logout();
              }}
            >
              Log out
            </WebButton>
          </div>
        </Show>

        <Show when={props.auth.authState().status === 'disconnected'}>
          <div class="modal-tabs">
            <button
              type="button"
              class={`modal-tab${tab() === 'nip07' ? ' active' : ''}`}
              onClick={() => {
                setTab('nip07');
                clearTabChrome();
              }}
            >
              Extension
            </button>
            <button
              type="button"
              class={`modal-tab${tab() === 'pomegranate' ? ' active' : ''}`}
              onClick={() => {
                setTab('pomegranate');
                clearTabChrome();
              }}
            >
              Google (FROST)
            </button>
            <button
              type="button"
              class={`modal-tab${tab() === 'bunker' ? ' active' : ''}`}
              onClick={() => {
                setTab('bunker');
                clearTabChrome();
              }}
            >
              Bunker URL
            </button>
            <button
              type="button"
              class={`modal-tab${tab() === 'nip55' ? ' active' : ''}`}
              onClick={() => {
                setTab('nip55');
                clearTabChrome();
              }}
            >
              Amber
            </button>
            <button
              type="button"
              class={`modal-tab${tab() === 'nostrconnect' ? ' active' : ''}`}
              onClick={() => {
                setTab('nostrconnect');
                clearTabChrome();
              }}
            >
              Nostr Connect
            </button>
            <button
              type="button"
              class={`modal-tab${tab() === 'nip49' ? ' active' : ''}`}
              onClick={() => {
                setTab('nip49');
                clearTabChrome();
              }}
            >
              ncryptsec
            </button>
          </div>
        </Show>

        <Show when={props.auth.authState().status === 'disconnected'}>
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
                  <WebButton
                    type="button"
                    class="web-button"
                    disabled={loading()}
                    onClick={() => void handleNip07Connect()}
                  >
                    {loading() ? 'Connecting…' : 'Connect with extension'}
                  </WebButton>
                </div>
              </Show>
            </Show>

            <Show when={tab() === 'pomegranate'}>
              <p
                class="muted"
                style={{ 'font-size': '0.9rem', 'margin-bottom': '0.65rem' }}
              >
                Sign in with Google using a decentralized FROST multisig key
                (Pomegranate). Your private key is sharded across independent
                operator servers via ChillDKG and never exists in full on any
                single machine.
              </p>

              <Show when={pomegranateStatus()}>
                {(statusText) => (
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      'margin-bottom': '0.75rem',
                      background: 'rgba(234, 179, 8, 0.1)',
                      border: '1px solid rgba(234, 179, 8, 0.25)',
                      'border-radius': '6px',
                      color: '#eab308',
                      'font-size': '0.82rem',
                      'font-family': 'monospace',
                    }}
                  >
                    {statusText()}
                  </div>
                )}
              </Show>

              <Show when={pomegranateExistingCentral()}>
                {(existing) => (
                  <div
                    style={{
                      padding: '0.75rem',
                      'margin-bottom': '0.75rem',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      'border-radius': '6px',
                      color: '#ededf2',
                      'font-size': '0.82rem',
                    }}
                  >
                    <div
                      style={{
                        'font-weight': 600,
                        'margin-bottom': '0.35rem',
                      }}
                    >
                      Existing Account Found!
                    </div>
                    <div class="muted" style={{ 'margin-bottom': '0.65rem' }}>
                      An existing setup announcement for this account was found
                      on coordinator <code>{existing().centralUrl}</code>.
                    </div>
                    <div
                      class="actions-row"
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        'flex-wrap': 'wrap',
                      }}
                    >
                      <WebButton
                        type="button"
                        class="web-button"
                        disabled={loading()}
                        onClick={() =>
                          void handlePomegranateConnect({
                            centralUrlOverride: existing().centralUrl,
                            skipDiscovery: true,
                          })
                        }
                      >
                        Switch to {existing().centralUrl} &amp; Connect
                      </WebButton>
                      <WebButton
                        type="button"
                        class="web-button"
                        style={{ opacity: 0.8 }}
                        disabled={loading()}
                        onClick={() =>
                          void handlePomegranateConnect({
                            centralUrlOverride: null,
                            skipDiscovery: true,
                          })
                        }
                      >
                        Create new key on current coordinator anyway
                      </WebButton>
                    </div>
                  </div>
                )}
              </Show>

              <div class="actions-row" style={{ 'margin-bottom': '0.75rem' }}>
                <WebButton
                  type="button"
                  class="web-button"
                  disabled={loading()}
                  onClick={() =>
                    void handlePomegranateConnect({
                      centralUrlOverride: null,
                      skipDiscovery: false,
                    })
                  }
                >
                  {loading() ? 'Connecting…' : 'Sign in with Google (FROST)'}
                </WebButton>
              </div>

              <div style={{ 'margin-top': '0.5rem' }}>
                <button
                  type="button"
                  onClick={() =>
                    setPomegranateShowAdvanced(!pomegranateShowAdvanced())
                  }
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8ab4ff',
                    cursor: 'pointer',
                    padding: 0,
                    'font-size': '0.8rem',
                    'text-decoration': 'underline',
                  }}
                >
                  {pomegranateShowAdvanced()
                    ? 'Hide coordinator & operator settings ▲'
                    : 'Advanced coordinator & operators ▼'}
                </button>

                <Show when={pomegranateShowAdvanced()}>
                  <div
                    style={{
                      'margin-top': '0.65rem',
                      padding: '0.75rem',
                      background: '#101016',
                      border: '1px solid #31313d',
                      'border-radius': '6px',
                    }}
                  >
                    <div style={{ 'margin-bottom': '0.65rem' }}>
                      <label
                        style={{
                          display: 'block',
                          'font-size': '0.78rem',
                          color: '#a0a0b0',
                          'margin-bottom': '0.25rem',
                        }}
                      >
                        Coordinator (Central URL):
                      </label>
                      <input
                        type="text"
                        value={pomegranateCentral()}
                        onInput={(e) =>
                          setPomegranateCentral(e.currentTarget.value)
                        }
                        disabled={loading()}
                        style={{
                          width: '100%',
                          border: '1px solid #31313d',
                          'border-radius': '4px',
                          background: '#0a0a0f',
                          color: '#ededf2',
                          padding: '0.4rem 0.5rem',
                          font: 'inherit',
                          'font-size': '0.82rem',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          'font-size': '0.78rem',
                          color: '#a0a0b0',
                          'margin-bottom': '0.25rem',
                        }}
                      >
                        FROST Operators (one per line, min 2):
                      </label>
                      <textarea
                        value={pomegranateOperatorsText()}
                        onInput={(e) =>
                          setPomegranateOperatorsText(e.currentTarget.value)
                        }
                        rows={4}
                        disabled={loading()}
                        style={{
                          width: '100%',
                          resize: 'vertical',
                          border: '1px solid #31313d',
                          'border-radius': '4px',
                          background: '#0a0a0f',
                          color: '#ededf2',
                          padding: '0.4rem 0.5rem',
                          font: 'inherit',
                          'font-size': '0.82rem',
                        }}
                      />
                    </div>
                  </div>
                </Show>
              </div>
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
                <WebButton
                  type="button"
                  class="web-button"
                  disabled={loading()}
                  onClick={() => void handleNip55Connect()}
                >
                  {loading() ? 'Opening Amber…' : 'Connect with Amber'}
                </WebButton>
              </div>
            </Show>

            <Show when={tab() === 'nostrconnect'}>
              <p
                class="muted"
                style={{ 'font-size': '0.9rem', 'margin-bottom': '0.65rem' }}
              >
                Client-initiated NIP-46: we generate a{' '}
                <code>nostrconnect://</code> link. Open it in your remote signer
                (e.g. Amber, Clave), then approve the connection. Same session
                storage as Bunker URL after success.
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
                <WebButton
                  type="button"
                  class="web-button"
                  disabled={loading() || !nostrConnectRelays().trim()}
                  onClick={() => void handleNostrConnect()}
                >
                  {loading()
                    ? 'Waiting for signer…'
                    : 'Generate link & connect'}
                </WebButton>
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
                    <div
                      class="actions-row"
                      style={{ 'margin-top': '0.45rem' }}
                    >
                      <WebButton
                        type="button"
                        class="web-button"
                        onClick={() => void copyNostrConnectUri(uri())}
                      >
                        Copy URI
                      </WebButton>
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
                Paste the <code>bunker://</code> URL from your NIP-46 remote
                signer (Amber, Clave).
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
                <WebButton
                  type="button"
                  class="web-button"
                  disabled={loading() || !bunkerUrl().trim()}
                  onClick={() => void handleBunkerConnect()}
                >
                  {loading() ? 'Connecting…' : 'Connect'}
                </WebButton>
              </div>
            </Show>

            <Show when={tab() === 'nip49'}>
              <p
                class="muted"
                style={{ 'font-size': '0.9rem', 'margin-bottom': '0.55rem' }}
              >
                Paste or scan your <strong>encrypted</strong> key only: a string
                starting with <code>ncryptsec1</code>. Raw <code>nsec</code> or
                hex private keys are not accepted here.
              </p>
              <div class="actions-row" style={{ 'margin-bottom': '0.55rem' }}>
                <WebButton
                  type="button"
                  class="web-button"
                  disabled={loading()}
                  onClick={() => {
                    if (nip49QrScanning()) {
                      stopNip49QrScanner();
                      setNip49QrStatus(null);
                    } else {
                      void startNip49QrScanner();
                    }
                  }}
                >
                  {nip49QrScanning() ? 'Stop QR scanner' : 'Scan QR code'}
                </WebButton>
              </div>
              <Show when={nip49QrScanning() || nip49QrStatus()}>
                <div
                  style={{
                    display: 'grid',
                    gap: '0.45rem',
                    'margin-bottom': '0.65rem',
                  }}
                >
                  <Show when={nip49QrScanning()}>
                    <video
                      ref={(el) => {
                        nip49QrVideoEl = el;
                      }}
                      autoplay
                      muted
                      playsinline
                      style={{
                        width: '100%',
                        'max-height': '16rem',
                        'object-fit': 'cover',
                        border: '1px solid #31313d',
                        'border-radius': '6px',
                        background: '#050508',
                      }}
                    />
                  </Show>
                  <Show when={nip49QrStatus()}>
                    {(message) => (
                      <p class="muted" style={{ 'font-size': '0.84rem' }}>
                        {message()}
                      </p>
                    )}
                  </Show>
                </div>
              </Show>
              <div class="field-row">
                <textarea
                  autocomplete="off"
                  value={ncryptsecField()}
                  onInput={(e) => setNcryptsecField(e.currentTarget.value)}
                  placeholder="ncryptsec1…"
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
              <div class="field-row" style={{ 'margin-top': '0.55rem' }}>
                <input
                  type="password"
                  autocomplete="off"
                  name="nostr-ncryptsec-passphrase"
                  data-1p-ignore
                  data-lpignore="true"
                  data-bwignore
                  placeholder="Passphrase"
                  value={nip49Password()}
                  onInput={(e) => setNip49Password(e.currentTarget.value)}
                  disabled={loading()}
                  style={{
                    width: '100%',
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
                <WebButton
                  type="button"
                  class="web-button"
                  disabled={
                    loading() ||
                    !ncryptsecField().trim() ||
                    !nip49Password().trim()
                  }
                  onClick={() => void handleNip49Connect()}
                >
                  {loading() ? 'Connecting…' : 'Connect with ncryptsec'}
                </WebButton>
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
        </Show>
      </div>
    </div>
  );
}
