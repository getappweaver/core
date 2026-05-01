import { createEffect, createSignal, on } from 'solid-js';

import type { ConnectAdapters, ConnectHook } from './types';

export function useConnect(adapters: ConnectAdapters): ConnectHook {
  const [modalOpen, setModalOpen] = createSignal(false);
  const [unlockModalOpen, setUnlockModalOpen] = createSignal(false);
  const [unlockSuppressed, setUnlockSuppressed] = createSignal(false);

  createEffect(() => {
    const state = adapters.auth.authState();
    const suppressed = unlockSuppressed();

    if (state.status !== 'locked') {
      setUnlockSuppressed(false);
      setUnlockModalOpen(false);

      return;
    }

    if (!suppressed) {
      setUnlockModalOpen(true);
    }
  });

  createEffect(
    on(
      () => adapters.auth.authState().status,
      (status, prevStatus) => {
        if (
          prevStatus === undefined ||
          prevStatus === 'connected' ||
          status !== 'connected'
        ) {
          return;
        }

        if (modalOpen()) {
          setModalOpen(false);
        }

        if (unlockModalOpen()) {
          setUnlockModalOpen(false);
        }
      },
    ),
  );

  function connectLabel(): string {
    const state = adapters.auth.authState();

    if (state.status === 'disconnected') {
      return 'Connect';
    }

    if (state.status === 'locked') {
      return 'Unlock';
    }

    return `${state.pubkey.slice(0, 8)}...`;
  }

  function handleConnectMenuClick(): void {
    if (adapters.auth.authState().status === 'locked') {
      setUnlockSuppressed(false);
      setUnlockModalOpen(true);

      return;
    }

    setModalOpen(true);
  }

  function closeConnectModal(): void {
    setModalOpen(false);
  }

  function closeUnlockModal(): void {
    setUnlockSuppressed(true);
    setUnlockModalOpen(false);
  }

  function isConnected(): boolean {
    return adapters.auth.authState().status === 'connected';
  }

  function isDisconnected(): boolean {
    return adapters.auth.authState().status === 'disconnected';
  }

  function isLocked(): boolean {
    return adapters.auth.authState().status === 'locked';
  }

  function manageTitle(): string {
    if (isConnected()) {
      return 'Connected — click to manage';
    }

    if (isLocked()) {
      return 'Enter passphrase to unlock NIP-49 key';
    }

    return 'Connect Nostr signer';
  }

  return {
    closeConnectModal,
    closeUnlockModal,
    connectLabel,
    handleConnectMenuClick,
    isConnected,
    isDisconnected,
    isLocked,
    manageTitle,
    modalOpen,
    unlockModalOpen,
  };
}
