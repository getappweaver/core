// ---------------------------------------------------------------------------
// web/src/contexts/NostrAuthContext.tsx — NIP-07 / NIP-46 signing context
//
// Provides auth state, NIP-98 token generation, connect/disconnect actions.
// Hydrates from localStorage synchronously on first render (before child effects).
// ---------------------------------------------------------------------------

import { createContext, createSignal, useContext } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';

import type { EventTemplate } from 'nostr-tools';

import { bunkerSignEvent } from '../nostr/bunker';
import { signEventWithNip55 } from '../nostr/nip55';
import {
  clearBunkerData,
  clearNip07Pubkey,
  clearNip55Pubkey,
  loadBunkerData,
  loadNip07Pubkey,
  loadNip55Pubkey,
  saveBunkerData,
  saveNip07Pubkey,
  saveNip55Pubkey,
} from '../nostr/storage';
import type { BunkerSignerData } from '../nostr/storage';
import { setAuthTokenProvider } from '../utils';

// ---------------------------------------------------------------------------
// window.nostr typing (NIP-07)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: EventTemplate): Promise<EventTemplate & { id: string; sig: string; pubkey: string }>;
    };
  }
}

/** NIP-07 extensions may inject `window.nostr` after first paint — wait briefly before signing. */
async function waitForNostrExtension(props: { maxMs: number }): Promise<boolean> {
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
  | { status: 'connected'; method: 'nip07'; pubkey: string }
  | { status: 'connected'; method: 'nip55'; pubkey: string }
  | {
      status: 'connected';
      method: 'bunker';
      pubkey: string;
      bunkerData: BunkerSignerData;
    };

export type ConnectArgs =
  | { method: 'nip07'; pubkey: string }
  | { method: 'nip55'; pubkey: string }
  | { method: 'bunker'; bunkerData: BunkerSignerData };

export type NostrAuthContextValue = {
  authState: Accessor<AuthState>;
  connect: (args: ConnectArgs) => void;
  disconnect: () => void;
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
      return { status: 'connected', method: 'nip07', pubkey: storedNip07Pubkey };
    }

    const storedNip55Pubkey = loadNip55Pubkey();

    if (storedNip55Pubkey) {
      return { status: 'connected', method: 'nip55', pubkey: storedNip55Pubkey };
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
  const [authState, setAuthState] = createSignal<AuthState>(readInitialAuthState());

  async function getNip98Token(
    url: string,
    httpMethod: string,
  ): Promise<string | null> {
    const state = authState();

    if (state.status === 'disconnected') {
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

      const signed = await window.nostr!.signEvent(event);
      return btoa(JSON.stringify(signed));
    }

    if (state.method === 'nip55') {
      const signed = await signEventWithNip55(event);
      return btoa(JSON.stringify(signed));
    }

    const signed = await bunkerSignEvent(state.bunkerData, event);
    return btoa(JSON.stringify(signed));
  }

  function connect(args: ConnectArgs): void {
    if (args.method === 'nip07') {
      saveNip07Pubkey(args.pubkey);
      setAuthState({ status: 'connected', method: 'nip07', pubkey: args.pubkey });
    } else if (args.method === 'nip55') {
      saveNip55Pubkey(args.pubkey);
      setAuthState({ status: 'connected', method: 'nip55', pubkey: args.pubkey });
    } else {
      saveBunkerData(args.bunkerData);
      setAuthState({
        status: 'connected',
        method: 'bunker',
        pubkey: args.bunkerData.userPubkey,
        bunkerData: args.bunkerData,
      });
    }
  }

  function disconnect(): void {
    clearBunkerData();
    clearNip07Pubkey();
    clearNip55Pubkey();
    setAuthState({ status: 'disconnected' });
  }

  // Register synchronously so fetch helpers see connected auth on first request.
  setAuthTokenProvider((url, method) => getNip98Token(url, method));

  const value: NostrAuthContextValue = {
    authState,
    connect,
    disconnect,
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
