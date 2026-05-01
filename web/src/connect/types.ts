import type {
  AuthState,
  NostrAuthContextValue,
} from '../contexts/NostrAuthContext';

export type ConnectAdapters = {
  auth: NostrAuthContextValue;
};

export type ConnectHook = {
  closeConnectModal: () => void;
  closeUnlockModal: () => void;
  connectLabel: () => string;
  handleConnectMenuClick: () => void;
  isConnected: () => boolean;
  isDisconnected: () => boolean;
  isLocked: () => boolean;
  manageTitle: () => string;
  modalOpen: () => boolean;
  unlockModalOpen: () => boolean;
};

export type ConnectState = AuthState;
