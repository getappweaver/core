import { NwcConnectionError } from './errors';
import type { NwcConnection, SafeNwcConnection } from './types';

const NWC_PROTOCOL = 'nostr+walletconnect:';
const HEX_32_BYTES_PATTERN = /^[0-9a-fA-F]{64}$/;

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

function parseRelayUrl(value: string): string {
  let relay: URL;

  try {
    relay = new URL(value);
  } catch {
    throw new NwcConnectionError('NWC connection contains an invalid relay.');
  }

  const secure = relay.protocol === 'wss:';

  const localDevelopment =
    relay.protocol === 'ws:' && isLocalHostname(relay.hostname);

  if (!secure && !localDevelopment) {
    throw new NwcConnectionError(
      'NWC relays must use wss, except for local-development ws relays.',
    );
  }

  if (relay.username || relay.password || relay.hash) {
    throw new NwcConnectionError(
      'NWC relay URLs cannot contain credentials or fragments.',
    );
  }

  return relay.toString();
}

export function parseNwcConnectionUri(value: string): NwcConnection {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new NwcConnectionError();
  }

  if (
    url.protocol !== NWC_PROTOCOL ||
    url.username ||
    url.password ||
    url.hash ||
    (url.pathname !== '' && url.pathname !== '/')
  ) {
    throw new NwcConnectionError();
  }

  const walletPubkey = url.hostname;
  const secrets = url.searchParams.getAll('secret');
  const relayValues = url.searchParams.getAll('relay');
  const lud16Values = url.searchParams.getAll('lud16');

  if (!HEX_32_BYTES_PATTERN.test(walletPubkey)) {
    throw new NwcConnectionError('NWC wallet public key must be 32-byte hex.');
  }

  if (secrets.length !== 1 || !HEX_32_BYTES_PATTERN.test(secrets[0] ?? '')) {
    throw new NwcConnectionError('NWC client secret must be 32-byte hex.');
  }

  if (relayValues.length === 0) {
    throw new NwcConnectionError(
      'NWC connection must contain at least one relay.',
    );
  }

  if (lud16Values.length > 1) {
    throw new NwcConnectionError(
      'NWC connection cannot contain more than one lud16 value.',
    );
  }

  const relayUrls = [...new Set(relayValues.map(parseRelayUrl))];
  const lud16 = lud16Values[0]?.trim() || null;

  return {
    walletPubkey: walletPubkey.toLowerCase(),
    relayUrls,
    secret: secrets[0]!.toLowerCase(),
    lud16,
  };
}

export function safeNwcConnection(
  connection: NwcConnection,
): SafeNwcConnection {
  return {
    walletPubkey: connection.walletPubkey,
    relayUrls: [...connection.relayUrls],
    lud16: connection.lud16,
  };
}

export function redactNwcConnectionUri(value: string): string {
  if (value.toLowerCase().includes('walletconnect')) {
    return '[redacted NWC connection]';
  }

  return '[redacted secret]';
}
