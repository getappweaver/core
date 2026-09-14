import QRCode from 'qrcode';
import type { JSX } from 'solid-js';
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js';

import type {
  WebPaymentAction,
  WebPaymentRequest,
  WebPaymentStatus,
} from '@src/payments/web-types';

import './payment-modal.css';

type PaymentModalProps = {
  payment: WebPaymentRequest;
  status: WebPaymentStatus | null;
  send: (message: unknown) => void;
  onDismiss: () => void;
};

type WeblnBalance = {
  display: string;
  sats: bigint | null;
};

function sourceKey(type: string, id?: string): string {
  return id ? `${type}:${id}` : type;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: number | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

function knownInsufficient(balance: string | null, amount: string): boolean {
  try {
    return balance !== null && BigInt(balance) < BigInt(amount);
  } catch {
    return false;
  }
}

function formatRemaining(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

export function PaymentModal(props: PaymentModalProps): JSX.Element {
  const hasWebln = props.payment.weblnAllowed && Boolean(window.webln);

  const initialNwc =
    props.payment.nwc.find((wallet) => wallet.available) ??
    props.payment.nwc[0];

  const initialSource = hasWebln
    ? 'webln'
    : initialNwc
      ? sourceKey('nwc', initialNwc.id)
      : props.payment.cashuAccepted
        ? 'cashu'
        : 'other';

  const [activeSource, setActiveSource] = createSignal(initialSource);
  const [weblnIdentity, setWeblnIdentity] = createSignal<string | null>(null);

  const [weblnBalance, setWeblnBalance] = createSignal<WeblnBalance | null>(
    null,
  );

  const [weblnConnecting, setWeblnConnecting] = createSignal(false);
  const [weblnPaying, setWeblnPaying] = createSignal(false);
  const [localError, setLocalError] = createSignal<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = createSignal<string | null>(null);
  const [now, setNow] = createSignal(Date.now());

  const relevantStatus = createMemo(() =>
    props.status?.attemptId === props.payment.attemptId ? props.status : null,
  );

  const expired = createMemo(
    () =>
      !props.payment.lightning ||
      props.payment.lightning.expiresAt * 1000 <= now() ||
      relevantStatus()?.state === 'expired',
  );

  const remaining = createMemo(() => {
    if (!props.payment.lightning) {
      return '';
    }

    const seconds = Math.max(
      0,
      Math.ceil((props.payment.lightning.expiresAt * 1000 - now()) / 1000),
    );

    return formatRemaining(seconds);
  });

  const sendAction = (
    action: WebPaymentAction,
    extra: Record<string, unknown> = {},
  ) => {
    props.send({
      type: 'payment_action',
      requestId: props.payment.attemptId,
      attemptId: props.payment.attemptId,
      action,
      ...extra,
    });
  };

  const statusMatchesActiveSource = () => {
    const sourceId = relevantStatus()?.sourceId;

    if (!sourceId) {
      return true;
    }

    return (
      sourceId === activeSource() ||
      sourceKey('nwc', sourceId) === activeSource()
    );
  };

  const sourceBusy = (sourceId: string) => {
    const status = relevantStatus();

    return (
      statusMatchesActiveSource() &&
      (status?.state === 'paying' || status?.state === 'settling') &&
      (status.sourceId === sourceId ||
        (sourceId.startsWith('nwc:') &&
          status.sourceId === sourceId.slice('nwc:'.length)))
    );
  };

  const dismiss = (notifyServer: boolean) => {
    if (notifyServer && relevantStatus()?.state !== 'success') {
      sendAction('close');
    }

    props.onDismiss();
  };

  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      dismiss(true);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      dismiss(true);
    }
  };

  const connectWebln = async () => {
    const provider = window.webln;

    if (!provider) {
      return;
    }

    setWeblnConnecting(true);
    setLocalError(null);

    try {
      await withTimeout(
        provider.enable(),
        30_000,
        'WebLN connection timed out.',
      );

      const info = await withTimeout(
        provider.getInfo(),
        15_000,
        'WebLN wallet information timed out.',
      );

      setWeblnIdentity(info.node?.alias || info.node?.pubkey || 'Connected');

      if (provider.getBalance) {
        try {
          const result = await withTimeout(
            provider.getBalance(),
            15_000,
            'WebLN balance lookup timed out.',
          );

          if (Number.isFinite(result.balance) && result.balance >= 0) {
            const currency = result.currency || 'sats';
            const isSats = currency === 'sats' || currency === 'sat';

            setWeblnBalance({
              display: `${result.balance.toLocaleString()} ${currency}`,
              sats:
                isSats && Number.isSafeInteger(result.balance)
                  ? BigInt(result.balance)
                  : null,
            });
          }
        } catch {
          // Balance is optional and advisory; connection remains usable.
        }
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setWeblnConnecting(false);
    }
  };

  const payWebln = async () => {
    const provider = window.webln;
    const invoice = props.payment.lightning?.invoice;

    if (!provider || !invoice || expired()) {
      return;
    }

    setWeblnPaying(true);
    setLocalError(null);

    try {
      const result = await withTimeout(
        provider.sendPayment(invoice),
        60_000,
        'WebLN payment timed out.',
      );

      const preimage =
        result && typeof result === 'object' && 'preimage' in result
          ? (result as { preimage?: unknown }).preimage
          : null;

      if (typeof preimage !== 'string') {
        throw new Error('WebLN wallet did not return a payment preimage.');
      }

      sendAction('webln_result', { preimage });
    } catch (error) {
      const message = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, 500);

      setLocalError(message);
      sendAction('webln_result', { error: message });
    } finally {
      setWeblnPaying(false);
    }
  };

  createEffect(() => {
    const invoice = props.payment.lightning?.invoice;

    setQrDataUrl(null);

    if (invoice) {
      void QRCode.toDataURL(invoice, { margin: 1, width: 300 })
        .then(setQrDataUrl)
        .catch(() => setLocalError('Could not generate the invoice QR code.'));
    }
  });

  const clock = window.setInterval(() => setNow(Date.now()), 1000);

  onCleanup(() => window.clearInterval(clock));

  const statusMessage = () =>
    localError() ??
    (statusMatchesActiveSource() ? (relevantStatus()?.message ?? null) : null);

  const statusTone = () => {
    const state = relevantStatus()?.state;

    return localError() || state === 'failed' || state === 'expired'
      ? 'payment-message--error'
      : state === 'success'
        ? 'payment-message--success'
        : '';
  };

  const weblnInsufficient = createMemo(() => {
    const balance = weblnBalance()?.sats;

    return balance !== null && balance !== undefined
      ? balance < BigInt(props.payment.amount)
      : false;
  });

  return (
    <div
      class="modal-backdrop payment-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <section
        class="modal panel payment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
      >
        <header class="modal-header payment-header">
          <span class="modal-title modal-title--with-icon payment-app">
            <Show when={props.payment.app.iconUrl}>
              {(icon) => <img src={icon()} alt="" class="modal-title-icon" />}
            </Show>
            <span id="payment-modal-title">
              Payment request - {props.payment.app.title}
            </span>
          </span>
          <button
            type="button"
            class="close-btn"
            aria-label="Close payment"
            onClick={() => dismiss(true)}
          >
            {'\u00d7'}
          </button>
        </header>

        <div class="modal-body payment-modal-body">
          <div class="payment-summary">
            <div class="payment-summary-row">
              <span>Amount</span>
              <strong>{props.payment.amount} sats</strong>
            </div>
            <Show when={props.payment.recipient}>
              {(recipient) => (
                <div class="payment-summary-row">
                  <span>To</span>
                  <strong class="payment-recipient">{recipient()}</strong>
                </div>
              )}
            </Show>
            <p>{props.payment.purpose}</p>
            <Show when={props.payment.lightning}>
              <div class="payment-expiry">
                <span>
                  {expired() ? 'Invoice expired' : `Expires in ${remaining()}`}
                </span>
                <Show when={props.payment.lightning?.refreshable}>
                  <button
                    type="button"
                    class="web-button payment-link-button"
                    onClick={() => sendAction('refresh_invoice')}
                  >
                    Fresh invoice
                  </button>
                </Show>
              </div>
            </Show>
          </div>
          <hr class="payment-divider" />

          <Show when={statusMessage()}>
            {(message) => (
              <div class={`payment-message ${statusTone()}`}>{message()}</div>
            )}
          </Show>

          <div
            class="widget-tabs payment-tabs"
            role="tablist"
            aria-label="Payment source"
          >
            <Show when={hasWebln && props.payment.lightning}>
              <button
                type="button"
                class="web-button widget-tab"
                classList={{ active: activeSource() === 'webln' }}
                aria-selected={activeSource() === 'webln'}
                onClick={() => setActiveSource('webln')}
              >
                WebLN
              </button>
            </Show>
            <For each={props.payment.nwc}>
              {(wallet) => (
                <button
                  type="button"
                  class="web-button widget-tab"
                  classList={{
                    active: activeSource() === sourceKey('nwc', wallet.id),
                  }}
                  aria-selected={activeSource() === sourceKey('nwc', wallet.id)}
                  onClick={() => setActiveSource(sourceKey('nwc', wallet.id))}
                >
                  NWC: {wallet.label}
                </button>
              )}
            </For>
            <Show when={props.payment.cashuAccepted}>
              <button
                type="button"
                class="web-button widget-tab"
                classList={{ active: activeSource() === 'cashu' }}
                aria-selected={activeSource() === 'cashu'}
                onClick={() => setActiveSource('cashu')}
              >
                Cashu
              </button>
            </Show>
            <Show when={props.payment.otherAllowed && props.payment.lightning}>
              <button
                type="button"
                class="web-button widget-tab"
                classList={{ active: activeSource() === 'other' }}
                aria-selected={activeSource() === 'other'}
                onClick={() => setActiveSource('other')}
              >
                QR / invoice
              </button>
            </Show>
          </div>

          <div class="payment-panel">
            <Show when={activeSource() === 'webln'}>
              <div class="payment-source-card">
                <strong>Browser Lightning wallet</strong>
                <Show
                  when={weblnIdentity()}
                  fallback={<p>Detected. Connect before approving payment.</p>}
                >
                  {(identity) => <p>Connected as {identity()}</p>}
                </Show>
                <Show
                  when={weblnBalance()}
                  fallback={
                    weblnIdentity() ? <p>Balance unavailable</p> : undefined
                  }
                >
                  {(balance) => <p>{balance().display} available</p>}
                </Show>
                <Show when={weblnInsufficient()}>
                  <p class="payment-inline-error">
                    This wallet needs funding. Fund it or choose another payment
                    source.
                  </p>
                </Show>
                <Show
                  when={weblnIdentity()}
                  fallback={
                    <button
                      type="button"
                      class="web-button payment-primary"
                      disabled={weblnConnecting()}
                      onClick={() => void connectWebln()}
                    >
                      {weblnConnecting() ? 'Connecting...' : 'Connect'}
                    </button>
                  }
                >
                  <button
                    type="button"
                    class="web-button payment-primary"
                    disabled={
                      expired() ||
                      weblnConnecting() ||
                      weblnPaying() ||
                      sourceBusy('webln') ||
                      weblnInsufficient()
                    }
                    onClick={() => void payWebln()}
                  >
                    {weblnPaying()
                      ? 'Sending...'
                      : `Pay ${props.payment.amount} sats`}
                  </button>
                </Show>
                <p class="payment-fee">
                  Routing fees are charged separately by the wallet.
                </p>
              </div>
            </Show>

            <For each={props.payment.nwc}>
              {(wallet) => {
                const insufficient = () =>
                  knownInsufficient(wallet.balance, props.payment.amount);

                return (
                  <Show when={activeSource() === sourceKey('nwc', wallet.id)}>
                    <div class="payment-source-card">
                      <strong>{wallet.walletAlias || wallet.label}</strong>
                      <p>
                        {wallet.balance === null
                          ? 'Balance unavailable'
                          : `${wallet.balance} sats available (NWC connection may be configured with a lower budget)`}
                      </p>
                      <Show when={wallet.message}>
                        {(message) => (
                          <p class="payment-inline-error">{message()}</p>
                        )}
                      </Show>
                      <Show
                        when={
                          statusMatchesActiveSource() &&
                          (relevantStatus()?.code === 'INSUFFICIENT_BALANCE' ||
                            relevantStatus()?.code === 'QUOTA_EXCEEDED')
                        }
                      >
                        <p class="payment-inline-error">
                          Fund this wallet or choose another payment source.
                        </p>
                      </Show>
                      <Show when={insufficient()}>
                        <p class="payment-inline-error">
                          This wallet needs funding. Fund it or choose another
                          payment source.
                        </p>
                      </Show>
                      <button
                        type="button"
                        class="web-button payment-primary"
                        disabled={
                          !wallet.available ||
                          insufficient() ||
                          expired() ||
                          sourceBusy(sourceKey('nwc', wallet.id))
                        }
                        onClick={() =>
                          sendAction('pay_nwc', { sourceId: wallet.id })
                        }
                      >
                        Pay {props.payment.amount} sats
                      </button>
                      <p class="payment-fee">
                        Principal: {props.payment.amount} sats. Routing fees are
                        reported separately.
                      </p>
                    </div>
                  </Show>
                );
              }}
            </For>

            <Show when={activeSource() === 'cashu'}>
              <div class="payment-source-card">
                <strong>Cashu</strong>
                <Show
                  when={props.payment.cashu.length > 0}
                  fallback={<p>No funded accepted mint is available.</p>}
                >
                  <label>
                    Mint
                    <select>
                      <For each={props.payment.cashu}>
                        {(mint) => (
                          <option value={mint.mintUrl}>
                            {mint.mintUrl} - {mint.balance} sats
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                </Show>
                <button
                  type="button"
                  class="web-button payment-primary"
                  disabled
                >
                  Cashu payments coming next
                </button>
              </div>
            </Show>

            <Show when={activeSource() === 'other'}>
              <div class="payment-source-card payment-qr-panel">
                <strong>Scan with another Lightning wallet</strong>
                <Show when={qrDataUrl()}>
                  {(src) => <img src={src()} alt="Lightning invoice QR code" />}
                </Show>
                <textarea
                  readOnly
                  value={props.payment.lightning?.invoice ?? ''}
                />
                <div class="payment-inline-actions">
                  <button
                    type="button"
                    class="web-button"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        props.payment.lightning?.invoice ?? '',
                      )
                    }
                  >
                    Copy invoice
                  </button>
                  <a
                    href={`lightning:${props.payment.lightning?.invoice ?? ''}`}
                  >
                    Open wallet
                  </a>
                </div>
                <button
                  type="button"
                  class="web-button payment-primary"
                  disabled={expired() || sourceBusy('other')}
                  onClick={() => sendAction('check_settlement')}
                >
                  Check payment
                </button>
              </div>
            </Show>
          </div>

          <Show when={relevantStatus()?.fee}>
            {(fee) => (
              <div class="payment-provider-fee">
                Provider fee: {fee()} msats
              </div>
            )}
          </Show>
        </div>
      </section>
    </div>
  );
}
