import type { JSX } from 'solid-js';
import { Show, createSignal } from 'solid-js';

export function WebBrowserWalletElement(): JSX.Element {
  const provider = window.webln;
  const [connecting, setConnecting] = createSignal(false);
  const [connected, setConnected] = createSignal<string | null>(null);
  const [balance, setBalance] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const connect = async () => {
    if (!provider || connecting()) {
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      await provider.enable();
      const info = await provider.getInfo();
      const identity = info.node?.alias || info.node?.pubkey || 'Connected';

      setConnected(identity);

      if (provider.getBalance) {
        try {
          const result = await provider.getBalance();

          if (Number.isFinite(result.balance) && result.balance >= 0) {
            setBalance(
              `${result.balance.toLocaleString()} ${result.currency || 'sats'}`,
            );
          }
        } catch {
          // Balance is optional and does not affect connection status.
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  if (!provider) {
    return <span class="web-text tone-muted">Not detected</span>;
  }

  return (
    <div class="web-stack" style={{ gap: '0.25rem' }}>
      <span class="web-text tone-success">Browser wallet detected</span>
      <Show when={connected()}>
        {(identity) => <span class="web-text tone-muted">{identity()}</span>}
      </Show>
      <Show when={balance()}>
        {(value) => (
          <span class="web-text tone-success">{value()} available</span>
        )}
      </Show>
      <Show when={error()}>
        {(message) => <span class="web-text tone-danger">{message()}</span>}
      </Show>
      <Show when={!connected()}>
        <div class="web-row" style={{ gap: '0.25rem' }}>
          <button
            type="button"
            class="web-button"
            disabled={connecting()}
            onClick={() => void connect()}
          >
            {connecting() ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </Show>
    </div>
  );
}
