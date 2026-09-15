import { describe, expect, test } from 'bun:test';

import { CapabilityInvocationFailedError } from './errors';

const operation = 'capability:v1:translation.translate';
const providerId = 'appweaver-ai-translate-plugin/translation/v1';

describe('CapabilityInvocationFailedError', () => {
  test('includes an Error cause message', () => {
    const cause = new Error(
      "The 'gpt-5.4-mini' model is not supported when using Codex with a ChatGPT account.",
    );

    const error = new CapabilityInvocationFailedError(
      operation,
      providerId,
      cause,
    );

    expect(error.message).toBe(
      `Provider ${providerId} failed while invoking ${operation}. ${cause.message}`,
    );

    expect(error.cause).toBe(cause);
  });

  test('includes a string cause', () => {
    const error = new CapabilityInvocationFailedError(
      operation,
      providerId,
      'Provider request failed',
    );

    expect(error.message).toEndWith('. Provider request failed');
  });

  test('keeps the generic message for an opaque cause', () => {
    const error = new CapabilityInvocationFailedError(operation, providerId, {
      status: 500,
    });

    expect(error.message).toBe(
      `Provider ${providerId} failed while invoking ${operation}.`,
    );
  });
});
