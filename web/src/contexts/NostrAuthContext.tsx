// ---------------------------------------------------------------------------
// web/src/contexts/NostrAuthContext.tsx — NIP-07 / NIP-46 / NIP-49 signing context
//
// Provides auth state, NIP-98 token generation, connect/disconnect/unlock actions.
// Hydrates from localStorage synchronously on first render (before child effects).
// ---------------------------------------------------------------------------

import type { EventTemplate } from 'nostr-tools';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { decrypt } from 'nostr-tools/nip49';
import type { Accessor, JSX } from 'solid-js';
import { createContext, createSignal, useContext } from 'solid-js';

import { bunkerSignEvent } from '../nostr/bunker';
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

export type NostrAuthContextValue = {
  authState: Accessor<AuthState>;
  connect: (args: ConnectArgs) => void;
  disconnect: () => void;
  logout: () => void;
  unlockNip49: (password: string) => Promise<void>;
  signEvent: (
    event: EventTemplate,
  ) => Promise<
    (EventTemplate & { id: string; sig: string; pubkey: string }) | null
  >;
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

  async function signEvent(
    event: EventTemplate,
  ): Promise<
    (EventTemplate & { id: string; sig: string; pubkey: string }) | null
  > {
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
    getNip98Token,
  };

  return (
    <NostrAuthContext.Provider value={value}>
      {props.children}
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
