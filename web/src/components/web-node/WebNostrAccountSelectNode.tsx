import { nip19 } from 'nostr-tools';
import type { JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
} from 'solid-js';

import type { WebElementNode } from '@src/web/ui-schema';

import { listBunkerConnections } from '../../nostr/bunkerConnections';

import { WebShadowUiBusyContext } from '../web-shadow-ui-busy-context';

import { useWebCurrentUserPubkey } from './contexts';
import { elementClass, elementStyle, elementUi } from './element-helpers';

type AccountChoice = { pubkey: string; label: string };
type WebNostrAccountSelectNodeProps = { element: WebElementNode };

function publicKey(value: string | null): string | null {
  return value && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function shortNpub(pubkey: string): string {
  const npub = nip19.npubEncode(pubkey);

  return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
}

/** Public identity selection only: does not connect, switch, or invoke a signer. */
export function WebNostrAccountSelectNode(
  props: WebNostrAccountSelectNodeProps,
): JSX.Element {
  const currentUserPubkey = useWebCurrentUserPubkey();
  const currentPubkey = () => publicKey(currentUserPubkey());
  const getBusy = useContext(WebShadowUiBusyContext);

  const [savedAccounts] = createResource(
    currentPubkey,
    async (): Promise<AccountChoice[]> => {
      const connections = await listBunkerConnections();

      return connections.flatMap((connection) => {
        // The bunker server's key is not necessarily the account owner's key.
        const pubkey = publicKey(connection.data.userPubkey);

        return pubkey
          ? [{ pubkey, label: `${connection.name} · ${shortNpub(pubkey)}` }]
          : [];
      });
    },
  );

  const choices = createMemo<AccountChoice[]>(() => {
    const current = currentPubkey();

    return [
      ...(current
        ? [
            {
              pubkey: current,
              label: `Authenticated account · ${shortNpub(current)}`,
            },
          ]
        : []),
      ...(current && !savedAccounts.error ? (savedAccounts() ?? []) : []),
    ];
  });

  const [selected, setSelected] = createSignal(
    props.element.props?.value ?? currentPubkey() ?? '',
  );

  let selectEl: HTMLSelectElement | undefined;

  createEffect(() => {
    const accounts = choices();

    if (!accounts.some((account) => account.pubkey === selected())) {
      setSelected(accounts[0]?.pubkey ?? '');
    }
  });

  onMount(() => {
    const form = selectEl?.form;

    const reset = () =>
      setSelected(currentPubkey() ?? choices()[0]?.pubkey ?? '');

    form?.addEventListener('reset', reset);
    onCleanup(() => form?.removeEventListener('reset', reset));
  });

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <select
        ref={selectEl}
        class="web-select__input"
        name={props.element.props?.formFieldName}
        aria-label={props.element.props?.ariaLabel ?? 'Choose a Nostr account'}
        required
        disabled={props.element.props?.disabled === true || getBusy() === true}
        value={selected()}
        onChange={(event) => setSelected(event.currentTarget.value)}
      >
        <option value="" disabled>
          Select an account…
        </option>
        <For each={choices()}>
          {(account) => <option value={account.pubkey}>{account.label}</option>}
        </For>
      </select>
      <Show when={savedAccounts.loading}>
        <div class="web-node web-text tone-muted size-sm">
          Loading saved bunker accounts…
        </div>
      </Show>
      <Show when={savedAccounts.error}>
        <div class="web-node web-text tone-muted size-sm" role="status">
          Could not load saved bunker accounts. You can still use the
          authenticated account or enter an npub.
        </div>
      </Show>
      <Show when={!currentPubkey()}>
        <div class="web-node web-text tone-muted size-sm">
          Connect a Nostr account to select authenticated or saved bunker
          accounts, or enter an npub.
        </div>
      </Show>
    </div>
  );
}
