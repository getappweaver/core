import type { JSX } from 'solid-js';
import { For, Show, createEffect, createSignal } from 'solid-js';

import { useNostrAuth } from '../contexts/NostrAuthContext';
import { loadSearchRelays, saveSearchRelays } from '../nostr/searchRelays';

import { WebButton } from './WebButton';

type NostrSearchRelaysModalProps = {
  onClose: () => void;
  onStatus: (message: string) => void;
};

export function NostrSearchRelaysModal(
  props: NostrSearchRelaysModalProps,
): JSX.Element {
  const auth = useNostrAuth();
  const [relays, setRelays] = createSignal<string[]>([]);
  const [newRelay, setNewRelay] = createSignal('');
  const [privateList, setPrivateList] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [note, setNote] = createSignal<string | null>(null);

  function currentPubkey(): string | null {
    const state = auth.authState();

    return state.status === 'connected' ? state.pubkey : null;
  }

  function normalizeRelay(raw: string): string | null {
    const trimmed = raw.trim();

    if (!trimmed) {
      return null;
    }

    const withProtocol = /^wss?:\/\//i.test(trimmed)
      ? trimmed
      : `wss://${trimmed}`;

    try {
      const url = new URL(withProtocol);

      if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
        return null;
      }

      url.protocol = 'wss:';

      return url.toString();
    } catch {
      return null;
    }
  }

  function addRelay(): void {
    const relay = normalizeRelay(newRelay());

    if (!relay) {
      setError('Enter a valid ws:// or wss:// relay URL.');

      return;
    }

    setRelays((prev) => [...new Set([...prev, relay])]);
    setNewRelay('');
    setError(null);
  }

  function removeRelay(relay: string): void {
    setRelays((prev) => prev.filter((entry) => entry !== relay));
  }

  async function reload(): Promise<void> {
    const pubkey = currentPubkey();

    if (!pubkey) {
      setError('Connect or unlock a Nostr signer first.');
      setLoading(false);

      return;
    }

    setLoading(true);
    setError(null);
    setNote(null);

    try {
      const loaded = await loadSearchRelays({
        pubkey,
        decryptSelf: auth.nip44DecryptSelf,
      });

      setRelays(loaded.relays);
      setPrivateList(loaded.private);

      setNote(
        loaded.event
          ? loaded.encryptedRelaysLoaded
            ? 'Loaded public and private search relays from kind 10007.'
            : 'Loaded public search relays from kind 10007.'
          : 'No search relay list found yet.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function save(): Promise<void> {
    const pubkey = currentPubkey();

    if (!pubkey) {
      setError('Connect or unlock a Nostr signer first.');

      return;
    }

    setSaving(true);
    setError(null);
    setNote(null);

    try {
      const acceptedRelays = await saveSearchRelays({
        pubkey,
        relays: relays(),
        private: privateList(),
        encryptSelf: auth.nip44EncryptSelf,
        signEvent: auth.signEvent,
      });

      const message = `Saved search relays to ${acceptedRelays.length} relay${acceptedRelays.length === 1 ? '' : 's'}.`;
      setNote(message);
      props.onStatus(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  createEffect(() => {
    void reload();
  });

  return (
    <div class="modal-backdrop" role="presentation" onClick={props.onClose}>
      <section
        class="modal nostr-search-relays-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nostr-search-relays-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="modal-header">
          <div id="nostr-search-relays-title" class="modal-title">
            Search relays
          </div>
          <WebButton
            type="button"
            class="close-btn"
            onClick={props.onClose}
            aria-label="Close"
          >
            ✕
          </WebButton>
        </header>
        <div class="modal-body nostr-search-relays-modal__body">
          <Show when={loading()}>
            <div class="status-modal-loading">Loading search relays…</div>
          </Show>
          <Show when={!loading()}>
            <Show when={error()}>
              {(message) => <div class="status-modal-error">{message()}</div>}
            </Show>
            <Show when={note()}>
              {(message) => <div class="status-modal-empty">{message()}</div>}
            </Show>
            <div class="nostr-search-relays-modal__list">
              <For each={relays()}>
                {(relay) => (
                  <div class="nostr-search-relays-modal__row">
                    <input type="text" value={relay} readOnly />
                    <WebButton
                      type="button"
                      class="connect-btn web-button"
                      onClick={() => removeRelay(relay)}
                    >
                      Remove
                    </WebButton>
                  </div>
                )}
              </For>
            </div>
            <div class="nostr-search-relays-modal__row">
              <input
                type="text"
                value={newRelay()}
                placeholder="wss://search.nos.today/"
                onInput={(event) => setNewRelay(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addRelay();
                  }
                }}
              />
              <WebButton
                type="button"
                class="connect-btn web-button"
                onClick={addRelay}
              >
                Add
              </WebButton>
            </div>
            <label class="nostr-search-relays-modal__private">
              <input
                type="checkbox"
                class="web-checkbox web-checkbox--retro"
                checked={privateList()}
                onChange={(event) =>
                  setPrivateList(event.currentTarget.checked)
                }
              />
              Private (encrypt relay tags with NIP-44)
            </label>
            <div class="nostr-search-relays-modal__actions">
              <WebButton
                type="button"
                class="connect-btn web-button"
                disabled={saving()}
                onClick={() => void reload()}
              >
                Reload
              </WebButton>
              <WebButton
                type="button"
                class="connect-btn web-button"
                disabled={saving()}
                onClick={() => void save()}
              >
                {saving() ? 'Saving…' : 'Save'}
              </WebButton>
            </div>
          </Show>
        </div>
      </section>
    </div>
  );
}
