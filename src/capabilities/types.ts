import { z } from 'zod';

import type { WebNodeRoot } from '@src/web/ui-schema';

export type CapabilityRef = {
  name: string;
  version: number;
};

export const CapabilityRefSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
});

export type CapabilityOperationId = `capability:v${number}:${string}.${string}`;

export const CapabilityOperationIdSchema = z
  .string()
  .refine((value) => parseCapabilityOperationId(value) !== null)
  .transform((value) => value as CapabilityOperationId);

export type CapabilityOperationRef = {
  capability: CapabilityRef;
  operation: string;
};

export type CapabilityOperationDefinition<
  TInputSchema extends z.ZodType<any, any> = z.ZodType<any, any>,
  TOutputSchema extends z.ZodType<any, any> = z.ZodType<any, any>,
> = {
  id: CapabilityOperationId;
  required: boolean;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  webResult?: (output: z.output<TOutputSchema>) => WebNodeRoot | null;
};

export type CapabilityOperationMap = Record<
  string,
  CapabilityOperationDefinition<z.ZodType<any, any>, z.ZodType<any, any>>
>;

export type CapabilityContract<
  TName extends string = string,
  TVersion extends number = number,
  TOperations extends CapabilityOperationMap = CapabilityOperationMap,
> = {
  capability: {
    name: TName;
    version: TVersion;
  };
  addedInCoreVersion: string;
  operations: TOperations;
};

export type AnyCapabilityContract = CapabilityContract<
  string,
  number,
  CapabilityOperationMap
>;

export type AnyCapabilityOperation = CapabilityOperationDefinition<
  z.ZodType<any, any>,
  z.ZodType<any, any>
>;

export type CapabilityResourceRef = {
  capability: CapabilityRef;
  providerId: string;
  resourceType: string;
  resourceId: string;
};

export const CapabilityResourceRefSchema = z.object({
  capability: CapabilityRefSchema,
  providerId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
});

export type ParsedCapabilityOperationId = CapabilityOperationRef & {
  id: CapabilityOperationId;
};

export type CapabilityCaller = {
  type: 'plugin';
  pluginName: string;
  alias: string;
};

export type CapabilityOperationHandlerContext<
  TOperation extends AnyCapabilityOperation = AnyCapabilityOperation,
> = {
  input: z.output<TOperation['inputSchema']>;
  caller: CapabilityCaller;
  providerId: string;
};

export type CapabilityOperationHandler<
  TOperation extends AnyCapabilityOperation = AnyCapabilityOperation,
> = (
  context: CapabilityOperationHandlerContext<TOperation>,
) =>
  | z.input<TOperation['outputSchema']>
  | Promise<z.input<TOperation['outputSchema']>>;

type ContractOperation<TContract extends AnyCapabilityContract> =
  TContract['operations'][keyof TContract['operations']];

type ContractOperationId<TContract extends AnyCapabilityContract> =
  ContractOperation<TContract>['id'];

type ContractOperationById<
  TContract extends AnyCapabilityContract,
  TId extends CapabilityOperationId,
> = Extract<ContractOperation<TContract>, { id: TId }>;

type RequiredContractOperationId<TContract extends AnyCapabilityContract> = {
  [
    TKey in keyof TContract['operations']
  ]: TContract['operations'][TKey] extends {
    required: true;
    id: infer TId extends CapabilityOperationId;
  }
    ? TId
    : never;
}[keyof TContract['operations']];

type OptionalContractOperationId<TContract extends AnyCapabilityContract> =
  Exclude<
    ContractOperationId<TContract>,
    RequiredContractOperationId<TContract>
  >;

export type CapabilityProviderOperations<
  TContract extends AnyCapabilityContract,
> = {
  [TId in RequiredContractOperationId<TContract>]: CapabilityOperationHandler<
    ContractOperationById<TContract, TId>
  >;
} & {
  [TId in OptionalContractOperationId<TContract>]?: CapabilityOperationHandler<
    ContractOperationById<TContract, TId>
  >;
};

export type CapabilityProviderDefinition<
  TContract extends AnyCapabilityContract = AnyCapabilityContract,
> = {
  contract: TContract;
  operations: CapabilityProviderOperations<TContract>;
};

declare const capabilityProviderDefinitionBrand: unique symbol;

export type DefinedCapabilityProvider<
  TContract extends AnyCapabilityContract = AnyCapabilityContract,
> = CapabilityProviderDefinition<TContract> & {
  readonly [capabilityProviderDefinitionBrand]: true;
};

export type CapabilityProviderSource = {
  type: 'plugin';
  pluginName: string;
  alias: string;
  version: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
};

export type CapabilityProviderSummary = {
  providerId: string;
  capability: CapabilityRef;
  source: CapabilityProviderSource;
};

export type CapabilityInvocationSuccess<TOutput> = {
  status: 'success';
  provider: CapabilityProviderSummary;
  output: TOutput;
};

export type CapabilityInvocationMissing = {
  status: 'missing';
  capability: CapabilityRef;
  operation: CapabilityOperationId;
  requestedProviderId: string | null;
};

export type CapabilityInvocationSelectionRequired = {
  status: 'selection-required';
  capability: CapabilityRef;
  operation: CapabilityOperationId;
  providers: CapabilityProviderSummary[];
};

export type CapabilityInvocationResult<TOutput> =
  | CapabilityInvocationSuccess<TOutput>
  | CapabilityInvocationMissing
  | CapabilityInvocationSelectionRequired;

export type InvokeCapabilityOperationRequest<
  TOperation extends AnyCapabilityOperation,
> = {
  operation: TOperation;
  provider: 'auto' | string;
  input: z.input<TOperation['inputSchema']>;
};

export type CapabilityClient = {
  listProviders: (capability: CapabilityRef) => CapabilityProviderSummary[];
  invoke: <TOperation extends AnyCapabilityOperation>(
    request: InvokeCapabilityOperationRequest<TOperation>,
  ) => Promise<
    CapabilityInvocationResult<z.output<TOperation['outputSchema']>>
  >;
};

const CAPABILITY_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const OPERATION_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CORE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const OPERATION_ID_PATTERN =
  /^capability:v([1-9]\d*):([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;

export function capabilityKey(capability: CapabilityRef): string {
  return `${capability.name}:v${capability.version}`;
}

export function capabilitiesMatch(
  left: CapabilityRef,
  right: CapabilityRef,
): boolean {
  return left.name === right.name && left.version === right.version;
}

export function parseCapabilityOperationId(
  value: string,
): ParsedCapabilityOperationId | null {
  const match = OPERATION_ID_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const version = Number(match[1]);
  const name = match[2];
  const operation = match[3];

  if (!Number.isSafeInteger(version) || version < 1 || !name || !operation) {
    return null;
  }

  return {
    id: value as CapabilityOperationId,
    capability: { name, version },
    operation,
  };
}

export function validateCapabilityContract(
  contract: AnyCapabilityContract,
): void {
  const { name, version } = contract.capability;

  if (!CAPABILITY_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid capability name: ${name}`);
  }

  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`Invalid capability version: ${String(version)}`);
  }

  if (!CORE_VERSION_PATTERN.test(contract.addedInCoreVersion)) {
    throw new Error(
      `Invalid addedInCoreVersion for ${capabilityKey(contract.capability)}: ${contract.addedInCoreVersion}`,
    );
  }

  const ids = new Set<string>();
  const entries = Object.entries(contract.operations);

  if (entries.length === 0) {
    throw new Error(
      `Capability ${capabilityKey(contract.capability)} has no operations`,
    );
  }

  for (const [operationName, operation] of entries) {
    if (!OPERATION_NAME_PATTERN.test(operationName)) {
      throw new Error(`Invalid capability operation name: ${operationName}`);
    }

    const parsed = parseCapabilityOperationId(operation.id);

    if (!parsed) {
      throw new Error(`Invalid capability operation id: ${operation.id}`);
    }

    if (!capabilitiesMatch(parsed.capability, contract.capability)) {
      throw new Error(
        `Operation ${operation.id} does not belong to ${capabilityKey(contract.capability)}`,
      );
    }

    if (parsed.operation !== operationName) {
      throw new Error(
        `Operation key ${operationName} does not match id ${operation.id}`,
      );
    }

    if (ids.has(operation.id)) {
      throw new Error(`Duplicate capability operation id: ${operation.id}`);
    }

    ids.add(operation.id);
  }
}

export function defineCapability<
  const TName extends string,
  const TVersion extends number,
  const TOperations extends CapabilityOperationMap,
>(
  contract: CapabilityContract<TName, TVersion, TOperations>,
): CapabilityContract<TName, TVersion, TOperations> {
  validateCapabilityContract(contract);

  for (const operation of Object.values(contract.operations)) {
    Object.freeze(operation);
  }

  Object.freeze(contract.capability);
  Object.freeze(contract.operations);

  return Object.freeze(contract);
}

export function defineCapabilityProvider<
  const TContract extends AnyCapabilityContract,
>(
  provider: CapabilityProviderDefinition<TContract>,
): DefinedCapabilityProvider<TContract> {
  return provider as DefinedCapabilityProvider<TContract>;
}
