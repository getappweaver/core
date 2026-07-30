import type {
  CapabilityOperationId,
  CapabilityRef,
} from '@src/capabilities/types';

export type CapabilityErrorCode =
  | 'CAPABILITY_REGISTRATION_FAILED'
  | 'CAPABILITY_REGISTRY_NOT_READY'
  | 'CAPABILITY_OPERATION_MISSING'
  | 'CAPABILITY_CONTRACT_MISMATCH'
  | 'CAPABILITY_INPUT_INVALID'
  | 'CAPABILITY_OUTPUT_INVALID'
  | 'CAPABILITY_INVOCATION_FAILED'
  | 'CAPABILITY_RESOURCE_NOT_FOUND';

export class CapabilityError extends Error {
  readonly code: CapabilityErrorCode;

  constructor(code: CapabilityErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.code = code;
  }
}

export class CapabilityRegistrationError extends CapabilityError {
  constructor(message: string, cause?: unknown) {
    super('CAPABILITY_REGISTRATION_FAILED', message, cause);
  }
}

export class CapabilityRegistryNotReadyError extends CapabilityError {
  constructor() {
    super(
      'CAPABILITY_REGISTRY_NOT_READY',
      'Capability invocation is unavailable until plugin registration is finalized.',
    );
  }
}

export class CapabilityOperationMissingError extends CapabilityError {
  constructor(operation: CapabilityOperationId, providerId: string) {
    super(
      'CAPABILITY_OPERATION_MISSING',
      `Provider ${providerId} does not implement ${operation}.`,
    );
  }
}

export class CapabilityContractMismatchError extends CapabilityError {
  constructor(operation: CapabilityOperationId) {
    super(
      'CAPABILITY_CONTRACT_MISMATCH',
      `Operation ${operation} does not use the registered core contract definition.`,
    );
  }
}

export class CapabilityInputInvalidError extends CapabilityError {
  constructor(operation: CapabilityOperationId, cause: unknown) {
    super('CAPABILITY_INPUT_INVALID', `Invalid input for ${operation}.`, cause);
  }
}

export class CapabilityOutputInvalidError extends CapabilityError {
  constructor(operation: CapabilityOperationId, cause: unknown) {
    super(
      'CAPABILITY_OUTPUT_INVALID',
      `Invalid output from ${operation}.`,
      cause,
    );
  }
}

export class CapabilityInvocationFailedError extends CapabilityError {
  constructor(
    operation: CapabilityOperationId,
    providerId: string,
    cause: unknown,
  ) {
    super(
      'CAPABILITY_INVOCATION_FAILED',
      `Provider ${providerId} failed while invoking ${operation}.`,
      cause,
    );
  }
}

export class CapabilityResourceNotFoundError extends CapabilityError {
  readonly capability: CapabilityRef;
  readonly resourceId: string;

  constructor(capability: CapabilityRef, resourceId: string) {
    super(
      'CAPABILITY_RESOURCE_NOT_FOUND',
      `Capability resource not found: ${resourceId}`,
    );

    this.capability = capability;
    this.resourceId = resourceId;
  }
}
