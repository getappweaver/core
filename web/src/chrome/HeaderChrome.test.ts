import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('../pwaUpdates', () => ({
  pwaReloading: () => false,
  pwaUpdateReady: () => false,
  reloadPwaManually: async () => {},
}));

const { resolveSetupUrl } = await import('./HeaderChrome');

describe('resolveSetupUrl', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  test('returns fallback /setup when window is undefined', () => {
    expect(resolveSetupUrl()).toBe('/setup');
  });

  test('resolves http localhost with custom port', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          protocol: 'http:',
          host: 'localhost:5551',
        },
      },
    });

    expect(resolveSetupUrl()).toBe('http://localhost:5551/setup');
  });

  test('resolves local IP host', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          protocol: 'http:',
          host: '127.0.0.1:5551',
        },
      },
    });

    expect(resolveSetupUrl()).toBe('http://127.0.0.1:5551/setup');
  });

  test('resolves LAN IP host', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          protocol: 'http:',
          host: '192.168.1.120:5551',
        },
      },
    });

    expect(resolveSetupUrl()).toBe('http://192.168.1.120:5551/setup');
  });

  test('resolves HTTPS proxy host', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          protocol: 'https:',
          host: 'custom-proxy.internal',
        },
      },
    });

    expect(resolveSetupUrl()).toBe('https://custom-proxy.internal/setup');
  });

  test('resolves HTTPS proxy host with non-standard port', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          protocol: 'https:',
          host: 'custom-proxy.internal:8443',
        },
      },
    });

    expect(resolveSetupUrl()).toBe('https://custom-proxy.internal:8443/setup');
  });
});
