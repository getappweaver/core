// ---------------------------------------------------------------------------
// web/src/contexts/NostrAuthContext.tsx — NIP-07 / NIP-46 / NIP-49 signing context
//
// Provides auth state, NIP-98 token generation, connect/disconnect/unlock actions.
// Hydrates from localStorage synchronously on first render (before child effects).
// ---------------------------------------------------------------------------

import type { EventTemplate } from 'nostr-tools';
import { finalizeEvent, getPublicKey, nip44 } from 'nostr-tools';
import { decrypt } from 'nostr-tools/nip49';
import type { Accessor, JSX } from 'solid-js';
import { Show, createContext, createSignal, useContext } from 'solid-js';

import { SignEventModal } from '../components/SignEventModal';
import { bunkerSignEvent } from '../nostr/bunker';
import {
  type BunkerConnection,
  listBunkerConnections,
  saveBunkerConnection,
} from '../nostr/bunkerConnections';
import { signEventWithNip55 } from '../nostr/nip55';
import type { BunkerSignerData } from '../nostr/storage';
import {
  clearAllNostrSignerStorage,
  clearNip07Pubkey,
  loadBunkerData,
  loadNip07Pubkey,
  loadNip49Bundle,
  loadNip55Pubkey,
  saveBunkerData,
  saveNip49Bundle,
  saveNip07Pubkey,
  saveNip55Pubkey,
} from '../nostr/storage';
import { setAuthTokenProvider } from '../utils';

// ---------------------------------------------------------------------------
// window.nostr typing (NIP-07)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(
        event: EventTemplate,
      ): Promise<EventTemplate & { id: string; sig: string; pubkey: string }>;
      nip44?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

const NIP49_UNLOCK_MS = 86_400_000;

function zeroizeSecretKey(key: Uint8Array): void {
  key.fill(0);
}

/** NIP-07 extensions may inject `window.nostr` after first paint — wait briefly before signing. */
async function waitForNostrExtension(props: {
  maxMs: number;
}): Promise<boolean> {
  const { maxMs } = props;

  if (typeof window === 'undefined') {
    return false;
  }

  const start = Date.now();

  while (Date.now() - start < maxMs) {
    if (window.nostr) {
      return true;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  return Boolean(window.nostr);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthState =
  | { status: 'disconnected' }
  | { status: 'locked'; method: 'nip49'; pubkey: string }
  | { status: 'connected'; method: 'nip07'; pubkey: string }
  | { status: 'connected'; method: 'nip55'; pubkey: string }
  | {
      status: 'connected';
      method: 'bunker';
      pubkey: string;
      bunkerData: BunkerSignerData;
    }
  | {
      status: 'connected';
      method: 'nip49';
      pubkey: string;
      secretKey: Uint8Array;
      unlockExpiresAt: number;
    };

export type ConnectArgs =
  | { method: 'nip07'; pubkey: string }
  | { method: 'nip55'; pubkey: string }
  | { method: 'bunker'; bunkerData: BunkerSignerData }
  | {
      method: 'nip49';
      ncryptsec: string;
      pubkey: string;
      secretKey: Uint8Array;
    };

type SignedNostrEvent = EventTemplate & {
  id: string;
  sig: string;
  pubkey: string;
};

type SignEventChoice =
  | { method: 'current' }
  | { method: 'bunker'; bunkerData: BunkerSignerData };

type SignEventRequest = {
  title: string;
  resolve: (choice: SignEventChoice | null) => void;
};

type SignEventOptions = {
  title: string | null;
};

export type NostrAuthContextValue = {
  authState: Accessor<AuthState>;
  connect: (args: ConnectArgs) => void;
  disconnect: () => void;
  logout: () => void;
  unlockNip49: (password: string) => Promise<void>;
  signEvent: (
    event: EventTemplate,
    options?: SignEventOptions,
  ) => Promise<SignedNostrEvent | null>;
  nip44EncryptSelf: (plaintext: string) => Promise<string | null>;
  nip44DecryptSelf: (ciphertext: string) => Promise<string | null>;
  getNip98Token: (url: string, method: string) => Promise<string | null>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NostrAuthContext = createContext<NostrAuthContextValue>();

// ---------------------------------------------------------------------------
// Initial state from localStorage (must run before first child effect / fetch)
// ---------------------------------------------------------------------------

function readInitialAuthState(): AuthState {
  try {
    if (typeof localStorage === 'undefined') {
      return { status: 'disconnected' };
    }

    const storedBunker = loadBunkerData();

    if (storedBunker) {
      return {
        status: 'connected',
        method: 'bunker',
        pubkey: storedBunker.userPubkey,
        bunkerData: storedBunker,
      };
    }

    const storedNip07Pubkey = loadNip07Pubkey();

    if (storedNip07Pubkey) {
      return {
        status: 'connected',
        method: 'nip07',
        pubkey: storedNip07Pubkey,
      };
    }

    const storedNip55Pubkey = loadNip55Pubkey();

    if (storedNip55Pubkey) {
      return {
        status: 'connected',
        method: 'nip55',
        pubkey: storedNip55Pubkey,
      };
    }

    const nip49Bundle = loadNip49Bundle();

    if (nip49Bundle) {
      return {
        status: 'locked',
        method: 'nip49',
        pubkey: nip49Bundle.pubkey,
      };
    }
  } catch {
    // Non-browser / private mode
  }

  return { status: 'disconnected' };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type NostrAuthProviderProps = {
  children: JSX.Element;
};

export function NostrAuthProvider(props: NostrAuthProviderProps): JSX.Element {
  const [authState, setAuthState] = createSignal<AuthState>(
    readInitialAuthState(),
  );

  const [bunkerConnections, setBunkerConnections] = createSignal<
    BunkerConnection[]
  >([]);

  const [signEventRequest, setSignEventRequest] =
    createSignal<SignEventRequest | null>(null);

  let nip49ExpiryTimer: number | null = null;

  function clearNip49ExpiryTimer(): void {
    if (nip49ExpiryTimer !== null) {
      clearTimeout(nip49ExpiryTimer);
      nip49ExpiryTimer = null;
    }
  }

  function scheduleNip49LockAt(unlockExpiresAt: number): void {
    clearNip49ExpiryTimer();
    const delay = Math.max(0, unlockExpiresAt - Date.now());

    nip49ExpiryTimer = window.setTimeout(() => {
      nip49ExpiryTimer = null;

      setAuthState((prev) => {
        if (prev.status === 'connected' && prev.method === 'nip49') {
          zeroizeSecretKey(prev.secretKey);

          return { status: 'locked', method: 'nip49', pubkey: prev.pubkey };
        }

        return prev;
      });
    }, delay);
  }

  function lockNip49IfExpired(): void {
    const state = authState();

    if (state.status !== 'connected' || state.method !== 'nip49') {
      return;
    }

    if (Date.now() < state.unlockExpiresAt) {
      return;
    }

    clearNip49ExpiryTimer();
    zeroizeSecretKey(state.secretKey);
    setAuthState({ status: 'locked', method: 'nip49', pubkey: state.pubkey });
  }

  function zeroizeCurrentNip49IfAny(): void {
    const state = authState();

    if (state.status === 'connected' && state.method === 'nip49') {
      zeroizeSecretKey(state.secretKey);
    }
  }

  function isExtensionConnectionError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message : String(error ?? '');

    const normalized = message.toLowerCase();

    return (
      normalized.includes('could not establish connection') ||
      normalized.includes('receiving end does not exist')
    );
  }

  async function getNip98Token(
    url: string,
    httpMethod: string,
  ): Promise<string | null> {
    const state = authState();

    if (state.status === 'disconnected' || state.status === 'locked') {
      return null;
    }

    const event: EventTemplate = {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['url', url],
        ['method', httpMethod.toUpperCase()],
      ],
      content: '',
    };

    if (state.method === 'nip07') {
      if (!window.nostr) {
        const ready = await waitForNostrExtension({ maxMs: 5000 });

        if (!ready) {
          return null;
        }
      }

      try {
        const signed = await window.nostr!.signEvent(event);

        return btoa(JSON.stringify(signed));
      } catch (err) {
        if (isExtensionConnectionError(err)) {
          clearNip07Pubkey();
          setAuthState({ status: 'disconnected' });

          return null;
        }

        throw err;
      }
    }

    if (state.method === 'nip55') {
      const signed = await signEventWithNip55(event);

      return btoa(JSON.stringify(signed));
    }

    if (state.method === 'nip49') {
      lockNip49IfExpired();
      const after = authState();

      if (after.status !== 'connected' || after.method !== 'nip49') {
        return null;
      }

      const signed = finalizeEvent(event, after.secretKey);

      return btoa(JSON.stringify(signed));
    }

    const signed = await bunkerSignEvent(state.bunkerData, event);

    return btoa(JSON.stringify(signed));
  }

  async function refreshBunkerConnections(): Promise<void> {
    setBunkerConnections(await listBunkerConnections());
  }

  async function addBunkerConnection(props: {
    name: string;
    data: BunkerSignerData;
  }): Promise<BunkerConnection> {
    const { name, data } = props;

    const connection = await saveBunkerConnection({
      name,
      data,
    });

    await refreshBunkerConnections();

    return connection;
  }

  function requestSignEventChoice(
    title: string,
  ): Promise<SignEventChoice | null> {
    return new Promise((resolve) => {
      setSignEventRequest({ title, resolve });
    });
  }

  function resolveSignEventChoice(choice: SignEventChoice | null): void {
    const request = signEventRequest();

    if (!request) {
      return;
    }

    setSignEventRequest(null);
    request.resolve(choice);
  }

  async function signWithCurrentAccount(
    event: EventTemplate,
  ): Promise<SignedNostrEvent | null> {
    const state = authState();

    if (state.status === 'disconnected' || state.status === 'locked') {
      return null;
    }

    if (state.method === 'nip07') {
      if (!window.nostr) {
        const ready = await waitForNostrExtension({ maxMs: 5000 });

        if (!ready) {
          return null;
        }
      }

      return window.nostr!.signEvent(event);
    }

    if (state.method === 'nip55') {
      return signEventWithNip55(event);
    }

    if (state.method === 'nip49') {
      lockNip49IfExpired();
      const after = authState();

      if (after.status !== 'connected' || after.method !== 'nip49') {
        return null;
      }

      return finalizeEvent(event, after.secretKey);
    }

    return bunkerSignEvent(state.bunkerData, event);
  }

  async function nip44EncryptSelf(plaintext: string): Promise<string | null> {
    const state = authState();

    if (state.status !== 'connected') {
      return null;
    }

    if (state.method === 'nip07') {
      if (!window.nostr) {
        const ready = await waitForNostrExtension({ maxMs: 5000 });

        if (!ready) {
          return null;
        }
      }

      return window.nostr!.nip44?.encrypt(state.pubkey, plaintext) ?? null;
    }

    if (state.method === 'nip49') {
      lockNip49IfExpired();
      const after = authState();

      if (after.status !== 'connected' || after.method !== 'nip49') {
        return null;
      }

      const conversationKey = nip44.v2.utils.getConversationKey(
        after.secretKey,
        after.pubkey,
      );

      return nip44.encrypt(plaintext, conversationKey);
    }

    return null;
  }

  async function nip44DecryptSelf(ciphertext: string): Promise<string | null> {
    const state = authState();

    if (state.status !== 'connected') {
      return null;
    }

    if (state.method === 'nip07') {
      if (!window.nostr) {
        const ready = await waitForNostrExtension({ maxMs: 5000 });

        if (!ready) {
          return null;
        }
      }

      return window.nostr!.nip44?.decrypt(state.pubkey, ciphertext) ?? null;
    }

    if (state.method === 'nip49') {
      lockNip49IfExpired();
      const after = authState();

      if (after.status !== 'connected' || after.method !== 'nip49') {
        return null;
      }

      const conversationKey = nip44.v2.utils.getConversationKey(
        after.secretKey,
        after.pubkey,
      );

      return nip44.decrypt(ciphertext, conversationKey);
    }

    return null;
  }

  async function signEvent(
    event: EventTemplate,
    options?: SignEventOptions,
  ): Promise<SignedNostrEvent | null> {
    const state = authState();

    if (state.status === 'disconnected' || state.status === 'locked') {
      return null;
    }

    try {
      await refreshBunkerConnections();
    } catch {
      setBunkerConnections([]);
    }

    const choice = await requestSignEventChoice(options?.title ?? 'Sign event');

    if (!choice) {
      return null;
    }

    if (choice.method === 'bunker') {
      return bunkerSignEvent(choice.bunkerData, event);
    }

    return signWithCurrentAccount(event);
  }

  function connect(args: ConnectArgs): void {
    clearNip49ExpiryTimer();
    zeroizeCurrentNip49IfAny();
    clearAllNostrSignerStorage();

    if (args.method === 'nip07') {
      saveNip07Pubkey(args.pubkey);

      setAuthState({
        status: 'connected',
        method: 'nip07',
        pubkey: args.pubkey,
      });
    } else if (args.method === 'nip55') {
      saveNip55Pubkey(args.pubkey);

      setAuthState({
        status: 'connected',
        method: 'nip55',
        pubkey: args.pubkey,
      });
    } else if (args.method === 'bunker') {
      saveBunkerData(args.bunkerData);

      setAuthState({
        status: 'connected',
        method: 'bunker',
        pubkey: args.bunkerData.userPubkey,
        bunkerData: args.bunkerData,
      });
    } else {
      const unlockExpiresAt = Date.now() + NIP49_UNLOCK_MS;
      saveNip49Bundle(args.ncryptsec, args.pubkey);

      setAuthState({
        status: 'connected',
        method: 'nip49',
        pubkey: args.pubkey,
        secretKey: args.secretKey,
        unlockExpiresAt,
      });

      scheduleNip49LockAt(unlockExpiresAt);
    }
  }

  async function unlockNip49(password: string): Promise<void> {
    const bundle = loadNip49Bundle();

    if (!bundle) {
      throw new Error('No encrypted key found');
    }

    const secretKey = decrypt(bundle.ncryptsec, password);
    const derivedPub = getPublicKey(secretKey);

    if (derivedPub !== bundle.pubkey) {
      zeroizeSecretKey(secretKey);
      throw new Error('Public key mismatch');
    }

    clearNip49ExpiryTimer();
    zeroizeCurrentNip49IfAny();

    const unlockExpiresAt = Date.now() + NIP49_UNLOCK_MS;

    setAuthState({
      status: 'connected',
      method: 'nip49',
      pubkey: bundle.pubkey,
      secretKey,
      unlockExpiresAt,
    });

    scheduleNip49LockAt(unlockExpiresAt);
  }

  function disconnect(): void {
    clearNip49ExpiryTimer();
    zeroizeCurrentNip49IfAny();
    clearAllNostrSignerStorage();
    setAuthState({ status: 'disconnected' });
  }

  function logout(): void {
    disconnect();
  }

  // Register synchronously so fetch helpers see connected auth on first request.
  setAuthTokenProvider((url, method) => getNip98Token(url, method));

  const value: NostrAuthContextValue = {
    authState,
    connect,
    disconnect,
    logout,
    unlockNip49,
    signEvent,
    nip44EncryptSelf,
    nip44DecryptSelf,
    getNip98Token,
  };

  return (
    <NostrAuthContext.Provider value={value}>
      {props.children}
      <Show when={signEventRequest()}>
        {() => {
          const state = authState();

          if (state.status !== 'connected') {
            return null;
          }

          return (
            <SignEventModal
              title={signEventRequest()?.title ?? 'Sign event'}
              currentPubkey={state.pubkey}
              bunkerConnections={bunkerConnections()}
              onAddBunker={addBunkerConnection}
              onChoose={resolveSignEventChoice}
              onCancel={() => resolveSignEventChoice(null)}
            />
          );
        }}
      </Show>
    </NostrAuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNostrAuth(): NostrAuthContextValue {
  const ctx = useContext(NostrAuthContext);

  if (!ctx) {
    throw new Error('useNostrAuth must be used inside <NostrAuthProvider>');
  }

  return ctx;
}
