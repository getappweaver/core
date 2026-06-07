import type { OpenCodeAuthProvider } from './transport';

const SETUP_OPENCODE_PROVIDER_STORAGE_KEY = 'appweaver.setup.opencode.provider';

export function getStoredProviderID(): string {
  return window.localStorage.getItem(SETUP_OPENCODE_PROVIDER_STORAGE_KEY) ?? '';
}

export function storeProviderID(providerID: string): void {
  window.localStorage.setItem(SETUP_OPENCODE_PROVIDER_STORAGE_KEY, providerID);
}

function preferredProvider(providers: OpenCodeAuthProvider[]): string {
  return providers.find((provider) => provider.id === 'opencode')
    ? 'opencode'
    : (providers[0]?.id ?? '');
}

export function storedPreferredProvider(
  providers: OpenCodeAuthProvider[],
): string {
  const stored = getStoredProviderID();

  if (stored && providers.some((provider) => provider.id === stored)) {
    return stored;
  }

  return preferredProvider(providers);
}

export function providerIsConfigured(
  status: { providers: OpenCodeAuthProvider[] } | null | undefined,
  providerID: string,
): boolean {
  return Boolean(
    providerID &&
    status?.providers.find((provider) => provider.id === providerID)
      ?.configured,
  );
}
