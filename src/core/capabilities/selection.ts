import type {
  CapabilityProviderSummary,
  CapabilityRef,
} from '@src/capabilities/types';

export type CapabilityProviderSelection =
  | {
      status: 'ready';
      provider: CapabilityProviderSummary;
    }
  | {
      status: 'missing';
      capability: CapabilityRef;
      requestedProviderId: string | null;
    }
  | {
      status: 'selection-required';
      capability: CapabilityRef;
      providers: CapabilityProviderSummary[];
    };

type SelectCapabilityProviderProps = {
  capability: CapabilityRef;
  providers: CapabilityProviderSummary[];
  requestedProviderId: string | null;
};

export function selectCapabilityProvider({
  capability,
  providers,
  requestedProviderId,
}: SelectCapabilityProviderProps): CapabilityProviderSelection {
  if (requestedProviderId) {
    const explicit = providers.find(
      (provider) => provider.providerId === requestedProviderId,
    );

    return explicit
      ? { status: 'ready', provider: explicit }
      : { status: 'missing', capability, requestedProviderId };
  }

  if (providers.length === 0) {
    return { status: 'missing', capability, requestedProviderId: null };
  }

  if (providers.length === 1) {
    return { status: 'ready', provider: providers[0]! };
  }

  return { status: 'selection-required', capability, providers };
}
