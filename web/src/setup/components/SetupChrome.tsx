import type { JSX } from 'solid-js';

import { HeaderChrome } from '../../chrome/HeaderChrome';
import { ConnectOverlays } from '../../connect/ConnectOverlays';
import { useConnect } from '../../connect/useConnect';
import { useNostrAuth } from '../../contexts/NostrAuthContext';

export function SetupChrome(props: { children: JSX.Element }): JSX.Element {
  const auth = useNostrAuth();
  const connect = useConnect({ auth });

  return (
    <div class="app-shell setup-app-shell">
      <HeaderChrome
        widgets={() => []}
        isWidgetActive={() => false}
        wsConnected={() => false}
        isConnected={connect.isConnected}
        isDisconnected={connect.isDisconnected}
        connectLabel={connect.connectLabel}
        manageTitle={connect.manageTitle}
        pushBusy={() => false}
        piperTtsBusy={() => false}
        piperTtsEnabled={() => false}
        hasCoreUpdate={() => false}
        onOpenWidget={() => undefined}
        onConnect={connect.handleConnectMenuClick}
        onLogout={auth.logout}
        onEnablePush={() => undefined}
        onEnablePiperTts={() => undefined}
        onOpenNostrSearchRelays={() => undefined}
        onRestartBot={() => undefined}
        onAnyMenuOpenChange={() => undefined}
      />
      {props.children}
      <ConnectOverlays auth={auth} connect={connect} />
    </div>
  );
}
