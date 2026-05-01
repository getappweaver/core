import type { JSX } from 'solid-js';
import { createContext, createSignal, useContext } from 'solid-js';

import type {
  AuthState,
  NostrAuthContextValue,
} from '@web/src/contexts/NostrAuthContext';
import { setAuthTokenProvider } from '@web/src/utils';

const DEMO_PUBKEY =
  'demoappweaverpubkey0000000000000000000000000000000000000000';

const NostrAuthContext = createContext<NostrAuthContextValue>();

export function NostrAuthProvider(props: {
  children: JSX.Element;
}): JSX.Element {
  const [authState, setAuthState] = createSignal<AuthState>({
    status: 'connected',
    method: 'nip07',
    pubkey: DEMO_PUBKEY,
  });

  const getNip98Token = async (): Promise<string | null> => 'demo-token';

  setAuthTokenProvider(getNip98Token);

  const value: NostrAuthContextValue = {
    authState,
    connect: (args) => {
      if (args.method === 'bunker') {
        setAuthState({
          status: 'connected',
          method: 'bunker',
          pubkey: args.bunkerData.userPubkey,
          bunkerData: args.bunkerData,
        });

        return;
      }

      if (args.method === 'nip49') {
        setAuthState({
          status: 'connected',
          method: 'nip49',
          pubkey: args.pubkey,
          secretKey: args.secretKey,
          unlockExpiresAt: Date.now() + 60_000,
        });

        return;
      }

      setAuthState({
        status: 'connected',
        method: args.method,
        pubkey: args.pubkey,
      });
    },
    disconnect: () => {
      setAuthState({ status: 'disconnected' });
    },
    logout: () => {
      setAuthState({
        status: 'connected',
        method: 'nip07',
        pubkey: DEMO_PUBKEY,
      });
    },
    unlockNip49: async () => {},
    getNip98Token,
  };

  return (
    <NostrAuthContext.Provider value={value}>
      {props.children}
    </NostrAuthContext.Provider>
  );
}

export function useNostrAuth(): NostrAuthContextValue {
  const value = useContext(NostrAuthContext);

  if (!value) {
    throw new Error('useNostrAuth must be used within NostrAuthProvider');
  }

  return value;
}
