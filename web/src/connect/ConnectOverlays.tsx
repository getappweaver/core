import type { JSX } from 'solid-js';

import { ConnectModal } from '../components/ConnectModal';
import { UnlockModal } from '../components/UnlockModal';
import type { NostrAuthContextValue } from '../contexts/NostrAuthContext';

import type { ConnectHook } from './types';

type ConnectOverlaysProps = {
  auth: NostrAuthContextValue;
  connect: ConnectHook;
};

export function ConnectOverlays(props: ConnectOverlaysProps): JSX.Element {
  return (
    <>
      {props.connect.modalOpen() && (
        <ConnectModal
          auth={props.auth}
          onClose={props.connect.closeConnectModal}
        />
      )}
      {props.connect.unlockModalOpen() && props.connect.isLocked() && (
        <UnlockModal
          auth={props.auth}
          onClose={props.connect.closeUnlockModal}
        />
      )}
    </>
  );
}
