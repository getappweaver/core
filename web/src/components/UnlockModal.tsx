// ---------------------------------------------------------------------------
// web/src/components/UnlockModal.tsx — passphrase unlock for stored NIP-49 ncryptsec
// ---------------------------------------------------------------------------

import type { JSX } from 'solid-js';
import { createSignal, onMount } from 'solid-js';

import type { NostrAuthContextValue } from '../contexts/NostrAuthContext';

import { WebButton } from './WebButton';

type UnlockModalProps = {
  auth: NostrAuthContextValue;
  onClose: () => void;
};

export function UnlockModal(props: UnlockModalProps): JSX.Element {
  const [password, setPassword] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let passwordInputRef: HTMLInputElement | undefined;

  onMount(() => {
    queueMicrotask(() => {
      passwordInputRef?.focus();
    });
  });

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

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await props.auth.unlockNip49(password());
      setPassword('');
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      class="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Unlock encrypted Nostr key"
    >
      <div class="modal panel">
        <div class="modal-header">
          <span class="modal-title">Unlock</span>
          <WebButton
            type="button"
            class="close-btn"
            onClick={props.onClose}
            aria-label="Close"
          >
            ✕
          </WebButton>
        </div>
        <div class="modal-body">
          <p
            class="muted"
            style={{ 'font-size': '0.9rem', 'margin-bottom': '0.75rem' }}
          >
            Your encrypted key (<code>ncryptsec</code>) is saved in this
            browser. Enter your passphrase to sign requests (NIP-98).
          </p>
          <form autocomplete="off" onSubmit={(e) => void handleSubmit(e)}>
            <div class="field-row">
              <input
                ref={(el) => {
                  passwordInputRef = el;
                }}
                type="password"
                class="palette-filter"
                autocomplete="off"
                name="nostr-ncryptsec-passphrase"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                placeholder="Passphrase"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                disabled={loading()}
              />
            </div>
            <div class="actions-row" style={{ 'margin-top': '0.75rem' }}>
              <WebButton
                type="submit"
                disabled={loading() || !password().trim()}
              >
                {loading() ? 'Unlocking…' : 'Unlock'}
              </WebButton>
            </div>
          </form>
          {error() ? (
            <p
              class="error-text"
              style={{ 'margin-top': '0.7rem', 'font-size': '0.88rem' }}
            >
              {error()}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
