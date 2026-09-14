export type NwcErrorCode =
  | 'NWC_CONNECTION_INVALID'
  | 'NWC_STATE_INVALID'
  | 'NWC_REQUEST_INVALID'
  | 'NWC_RESPONSE_INVALID'
  | 'NWC_UNSUPPORTED_ENCRYPTION'
  | 'NWC_METHOD_UNSUPPORTED'
  | 'NWC_NETWORK_FAILED'
  | 'NWC_PUBLISH_FAILED'
  | 'NWC_PUBLISH_TIMEOUT'
  | 'NWC_REPLY_TIMEOUT'
  | 'NWC_ABORTED'
  | 'NWC_WALLET_ERROR';

export type NwcWalletErrorCode =
  | 'RATE_LIMITED'
  | 'NOT_IMPLEMENTED'
  | 'INSUFFICIENT_BALANCE'
  | 'QUOTA_EXCEEDED'
  | 'RESTRICTED'
  | 'UNAUTHORIZED'
  | 'INTERNAL'
  | 'UNSUPPORTED_ENCRYPTION'
  | 'PAYMENT_FAILED'
  | 'NOT_FOUND'
  | 'OTHER';

export class NwcError extends Error {
  readonly code: NwcErrorCode;

  constructor(code: NwcErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.code = code;
  }
}

export class NwcConnectionError extends NwcError {
  constructor(message = 'Invalid NWC connection.') {
    super('NWC_CONNECTION_INVALID', message);
  }
}

export class NwcStateError extends NwcError {
  constructor(message = 'Stored NWC connection state is invalid.') {
    super('NWC_STATE_INVALID', message);
  }
}

export class NwcRequestError extends NwcError {
  constructor(message = 'Invalid NWC request.', cause?: unknown) {
    super('NWC_REQUEST_INVALID', message, cause);
  }
}

export class NwcResponseError extends NwcError {
  constructor(message = 'Invalid NWC response.', cause?: unknown) {
    super('NWC_RESPONSE_INVALID', message, cause);
  }
}

export class NwcUnsupportedEncryptionError extends NwcError {
  constructor() {
    super(
      'NWC_UNSUPPORTED_ENCRYPTION',
      'The NWC wallet does not advertise NIP-44 v2 support.',
    );
  }
}

export class NwcMethodUnsupportedError extends NwcError {
  readonly method: string;

  constructor(method: string) {
    super(
      'NWC_METHOD_UNSUPPORTED',
      `The NWC wallet does not advertise support for ${method}.`,
    );

    this.method = method;
  }
}

export class NwcNetworkError extends NwcError {
  constructor(message = 'Could not connect to an NWC relay.', cause?: unknown) {
    super('NWC_NETWORK_FAILED', message, cause);
  }
}

export class NwcPublishError extends NwcError {
  constructor(message = 'Could not publish the NWC request.', cause?: unknown) {
    super('NWC_PUBLISH_FAILED', message, cause);
  }
}

export class NwcPublishTimeoutError extends NwcError {
  constructor() {
    super('NWC_PUBLISH_TIMEOUT', 'Publishing the NWC request timed out.');
  }
}

export class NwcReplyTimeoutError extends NwcError {
  constructor() {
    super('NWC_REPLY_TIMEOUT', 'Waiting for the NWC wallet timed out.');
  }
}

export class NwcAbortedError extends NwcError {
  constructor() {
    super('NWC_ABORTED', 'The NWC request was cancelled.');
  }
}

export class NwcWalletError extends NwcError {
  readonly walletCode: NwcWalletErrorCode | string;

  constructor(walletCode: NwcWalletErrorCode | string, message: string) {
    super('NWC_WALLET_ERROR', message);
    this.walletCode = walletCode;
  }
}
