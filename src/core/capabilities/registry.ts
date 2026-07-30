import type { z } from 'zod';

import type {
  AnyCapabilityContract,
  AnyCapabilityOperation,
  CapabilityCaller,
  CapabilityClient,
  CapabilityInvocationResult,
  CapabilityOperationHandler,
  CapabilityOperationId,
  CapabilityProviderSource,
  CapabilityProviderSummary,
  CapabilityRef,
  DefinedCapabilityProvider,
} from '@src/capabilities/types';
import {
  capabilitiesMatch,
  capabilityKey,
  parseCapabilityOperationId,
  validateCapabilityContract,
} from '@src/capabilities/types';
import { debug, log } from '@src/logger';

import {
  CapabilityContractMismatchError,
  CapabilityError,
  CapabilityInputInvalidError,
  CapabilityInvocationFailedError,
  CapabilityOperationMissingError,
  CapabilityOutputInvalidError,
  CapabilityRegistrationError,
  CapabilityRegistryNotReadyError,
} from './errors';
import { selectCapabilityProvider } from './selection';

type RegisteredOperation = {
  definition: AnyCapabilityOperation;
  handler: CapabilityOperationHandler;
};

type RegisteredProvider = {
  summary: CapabilityProviderSummary;
  contract: AnyCapabilityContract;
  operations: Map<CapabilityOperationId, RegisteredOperation>;
};

type RegisterCapabilityProvidersProps = {
  source: CapabilityProviderSource;
  providers: readonly DefinedCapabilityProvider[];
};

type InvokeRegisteredOperationProps<TOperation extends AnyCapabilityOperation> =
  {
    operation: TOperation;
    provider: 'auto' | string;
    input: z.input<TOperation['inputSchema']>;
    caller: CapabilityCaller;
  };

type CreateCapabilityClientProps = {
  registry: CapabilityRegistry;
  caller: CapabilityCaller;
};

type InvokeCapabilityOperationByIdProps = {
  operationId: CapabilityOperationId;
  provider: 'auto' | string;
  input: unknown;
  caller: CapabilityCaller;
};

type InvokeAllCapabilityOperationsByIdProps = Omit<
  InvokeCapabilityOperationByIdProps,
  'provider'
>;

function providerIdFor(
  source: CapabilityProviderSource,
  capability: CapabilityRef,
): string {
  return `${source.pluginName}/${capability.name}/v${capability.version}`;
}

function providerSummary(
  provider: RegisteredProvider,
): CapabilityProviderSummary {
  return provider.summary;
}

function operationForContract(
  contract: AnyCapabilityContract,
  operationId: CapabilityOperationId,
): AnyCapabilityOperation | null {
  return (
    Object.values(contract.operations).find(
      (operation) => operation.id === operationId,
    ) ?? null
  );
}

function prepareProvider({
  source,
  provider,
}: {
  source: CapabilityProviderSource;
  provider: DefinedCapabilityProvider;
}): RegisteredProvider {
  try {
    validateCapabilityContract(provider.contract);
  } catch (err) {
    throw new CapabilityRegistrationError(
      `Invalid capability contract from ${source.pluginName}.`,
      err,
    );
  }

  const providerId = providerIdFor(source, provider.contract.capability);
  const operations = new Map<CapabilityOperationId, RegisteredOperation>();

  for (const [operationId, handler] of Object.entries(provider.operations)) {
    if (typeof handler !== 'function') {
      throw new CapabilityRegistrationError(
        `Provider ${providerId} has no handler for ${operationId}.`,
      );
    }

    const parsed = parseCapabilityOperationId(operationId);

    if (
      !parsed ||
      !capabilitiesMatch(parsed.capability, provider.contract.capability)
    ) {
      throw new CapabilityRegistrationError(
        `Provider ${providerId} registered unknown operation ${operationId}.`,
      );
    }

    const definition = operationForContract(provider.contract, parsed.id);

    if (!definition) {
      throw new CapabilityRegistrationError(
        `Provider ${providerId} registered operation ${operationId} outside its contract.`,
      );
    }

    operations.set(parsed.id, { definition, handler });
  }

  for (const operation of Object.values(provider.contract.operations)) {
    if (operation.required && !operations.has(operation.id)) {
      throw new CapabilityRegistrationError(
        `Provider ${providerId} is missing required operation ${operation.id}.`,
      );
    }
  }

  return {
    summary: {
      providerId,
      capability: { ...provider.contract.capability },
      source: { ...source },
    },
    contract: provider.contract,
    operations,
  };
}

export class CapabilityRegistry {
  private readonly providersById = new Map<string, RegisteredProvider>();
  private readonly providerIdsByCapability = new Map<string, Set<string>>();
  private readonly contractsByCapability = new Map<
    string,
    AnyCapabilityContract
  >();
  private finalized = false;

  private prepareProviders({
    source,
    providers,
  }: RegisterCapabilityProvidersProps): RegisteredProvider[] {
    const prepared = providers.map((provider) =>
      prepareProvider({ source, provider }),
    );

    const pendingIds = new Set<string>();

    for (const provider of prepared) {
      const { providerId, capability } = provider.summary;
      const key = capabilityKey(capability);

      if (pendingIds.has(providerId) || this.providersById.has(providerId)) {
        throw new CapabilityRegistrationError(
          `Capability provider already registered: ${providerId}`,
        );
      }

      const registeredContract = this.contractsByCapability.get(key);

      if (registeredContract && registeredContract !== provider.contract) {
        throw new CapabilityRegistrationError(
          `Capability ${key} was registered with a different contract object. Import the shared contract from src/capabilities.`,
        );
      }

      pendingIds.add(providerId);
    }

    return prepared;
  }

  validateProviders(props: RegisterCapabilityProvidersProps): void {
    if (this.finalized) {
      throw new CapabilityRegistrationError(
        'Cannot validate capability providers after finalization.',
      );
    }

    this.prepareProviders(props);
  }

  registerProviders({
    source,
    providers,
  }: RegisterCapabilityProvidersProps): void {
    if (this.finalized) {
      throw new CapabilityRegistrationError(
        'Cannot register capability providers after finalization.',
      );
    }

    const prepared = this.prepareProviders({ source, providers });

    for (const provider of prepared) {
      const { providerId, capability } = provider.summary;
      const key = capabilityKey(capability);
      const ids = this.providerIdsByCapability.get(key) ?? new Set<string>();

      ids.add(providerId);
      this.providerIdsByCapability.set(key, ids);
      this.providersById.set(providerId, provider);
      this.contractsByCapability.set(key, provider.contract);

      log.info(`Registered capability provider: ${providerId}`);
    }
  }

  finalize(): void {
    this.finalized = true;
  }

  listProviders(capability: CapabilityRef): CapabilityProviderSummary[] {
    if (!this.finalized) {
      throw new CapabilityRegistryNotReadyError();
    }

    return this.listRegisteredProviders(capability);
  }

  listCapabilities(): CapabilityRef[] {
    if (!this.finalized) {
      throw new CapabilityRegistryNotReadyError();
    }

    return [...this.providerIdsByCapability.values()].flatMap((ids) => {
      const providerId = ids.values().next().value;
      const provider = providerId ? this.providersById.get(providerId) : null;

      return provider ? [{ ...provider.summary.capability }] : [];
    });
  }

  listOperationProviders(
    operationId: CapabilityOperationId,
  ): CapabilityProviderSummary[] {
    const parsed = parseCapabilityOperationId(operationId);

    if (!parsed) {
      return [];
    }

    return this.listRegisteredProviders(parsed.capability).filter(
      (provider) =>
        this.providersById
          .get(provider.providerId)
          ?.operations.has(operationId) === true,
    );
  }

  private listRegisteredProviders(
    capability: CapabilityRef,
  ): CapabilityProviderSummary[] {
    const ids = this.providerIdsByCapability.get(capabilityKey(capability));

    if (!ids) {
      return [];
    }

    return [...ids]
      .flatMap((providerId) => {
        const provider = this.providersById.get(providerId);

        return provider ? [providerSummary(provider)] : [];
      })
      .sort((left, right) =>
        left.source.title.localeCompare(right.source.title),
      );
  }

  async invokeById({
    operationId,
    provider,
    input,
    caller,
  }: InvokeCapabilityOperationByIdProps): Promise<
    CapabilityInvocationResult<unknown>
  > {
    const parsed = parseCapabilityOperationId(operationId);

    if (!parsed) {
      throw new CapabilityContractMismatchError(operationId);
    }

    const registered = this.listRegisteredProviders(parsed.capability)
      .map((summary) => this.providersById.get(summary.providerId))
      .find((candidate) => candidate?.operations.has(operationId));

    const operation = registered?.operations.get(operationId)?.definition;

    if (!operation) {
      return {
        status: 'missing',
        capability: parsed.capability,
        operation: operationId,
        requestedProviderId: provider === 'auto' ? null : provider,
      };
    }

    return this.invoke({ operation, provider, input, caller });
  }

  async invokeAllById({
    operationId,
    input,
    caller,
  }: InvokeAllCapabilityOperationsByIdProps): Promise<void> {
    if (!this.finalized) {
      return;
    }

    await Promise.allSettled(
      this.listOperationProviders(operationId).map((provider) =>
        this.invokeById({
          operationId,
          provider: provider.providerId,
          input,
          caller,
        }),
      ),
    );
  }

  webResultFor(operationId: CapabilityOperationId, output: unknown) {
    const parsed = parseCapabilityOperationId(operationId);

    if (!parsed) {
      return null;
    }

    const registered = this.listRegisteredProviders(parsed.capability)
      .map((summary) => this.providersById.get(summary.providerId))
      .find((candidate) => candidate?.operations.has(operationId));

    const operation = registered?.operations.get(operationId)?.definition;

    if (!operation?.webResult) {
      return null;
    }

    return operation.webResult(output);
  }

  async invoke<TOperation extends AnyCapabilityOperation>({
    operation,
    provider: requestedProvider,
    input,
    caller,
  }: InvokeRegisteredOperationProps<TOperation>): Promise<
    CapabilityInvocationResult<z.output<TOperation['outputSchema']>>
  > {
    const startedAt = Date.now();
    let resolvedProviderId =
      requestedProvider === 'auto' ? 'unresolved' : requestedProvider;

    const fail = (failure: CapabilityError): never => {
      log.error(
        `Capability ${operation.id} failed via ${resolvedProviderId} for ${caller.pluginName} after ${Date.now() - startedAt}ms: ${failure.code}`,
      );

      throw failure;
    };

    if (!this.finalized) {
      return fail(new CapabilityRegistryNotReadyError());
    }

    const parsed = parseCapabilityOperationId(operation.id);

    if (!parsed) {
      return fail(new CapabilityContractMismatchError(operation.id));
    }

    const providers = this.listRegisteredProviders(parsed.capability).filter(
      (provider) =>
        this.providersById
          .get(provider.providerId)
          ?.operations.has(operation.id) === true,
    );

    const selection = selectCapabilityProvider({
      capability: parsed.capability,
      providers,
      requestedProviderId:
        requestedProvider === 'auto' ? null : requestedProvider,
    });

    if (selection.status === 'missing') {
      return {
        status: 'missing',
        capability: selection.capability,
        operation: operation.id,
        requestedProviderId: selection.requestedProviderId,
      };
    }

    if (selection.status === 'selection-required') {
      return {
        status: 'selection-required',
        capability: selection.capability,
        operation: operation.id,
        providers: selection.providers,
      };
    }

    const registeredProvider = this.providersById.get(
      selection.provider.providerId,
    )!;

    resolvedProviderId = selection.provider.providerId;

    const registeredOperation = registeredProvider.operations.get(operation.id);

    if (!registeredOperation) {
      return fail(
        new CapabilityOperationMissingError(
          operation.id,
          selection.provider.providerId,
        ),
      );
    }

    if (registeredOperation.definition !== operation) {
      return fail(new CapabilityContractMismatchError(operation.id));
    }

    const parsedInput = operation.inputSchema.safeParse(input);

    if (!parsedInput.success) {
      return fail(
        new CapabilityInputInvalidError(operation.id, parsedInput.error),
      );
    }

    try {
      const rawOutput = await registeredOperation.handler({
        input: parsedInput.data,
        caller,
        providerId: selection.provider.providerId,
      });

      const parsedOutput = operation.outputSchema.safeParse(rawOutput);

      if (!parsedOutput.success) {
        throw new CapabilityOutputInvalidError(
          operation.id,
          parsedOutput.error,
        );
      }

      debug(
        `Capability ${operation.id} completed via ${selection.provider.providerId} for ${caller.pluginName} in ${Date.now() - startedAt}ms`,
      );

      return {
        status: 'success',
        provider: selection.provider,
        output: parsedOutput.data as z.output<TOperation['outputSchema']>,
      };
    } catch (err) {
      const failure =
        err instanceof CapabilityError
          ? err
          : new CapabilityInvocationFailedError(
              operation.id,
              selection.provider.providerId,
              err,
            );

      return fail(failure);
    }
  }
}

export function createCapabilityClient({
  registry,
  caller,
}: CreateCapabilityClientProps): CapabilityClient {
  return {
    listProviders: (capability) => registry.listProviders(capability),
    invoke: (request) =>
      registry.invoke({
        ...request,
        caller,
      }),
  };
}

export const capabilityRegistry = new CapabilityRegistry();
