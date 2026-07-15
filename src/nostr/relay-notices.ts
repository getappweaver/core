import type { Event, Filter } from 'nostr-tools';
import type { SimplePool } from 'nostr-tools/pool';

import { debug } from '../logger';

const blockedReadRelays = new Set<string>();

function shouldBlockRelayForNotice(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('does not accept reqs') ||
    normalized.includes('too many concurrent reqs')
  );
}

export function filterBlockedReadRelays(relays: string[]): string[] {
  return relays.filter((relay) => !blockedReadRelays.has(relay));
}

export function allowRelayOperation(
  relayUrl: string,
  operation: ['read', Filter[]] | ['write', Event],
): boolean {
  if (operation[0] !== 'read' || !blockedReadRelays.has(relayUrl)) {
    return true;
  }

  const isDmSubscription = operation[1].some(
    (filter) => filter.kinds?.includes(1059) === true,
  );

  if (isDmSubscription) {
    debug(
      `relay notice: allowing blocked relay ${relayUrl} for NIP-17 DM subscription`,
    );

    return true;
  }

  debug(
    `relay notice: blocked read REQ to ${relayUrl}: ${JSON.stringify(operation[1])}`,
  );

  return false;
}

export function installRelayNoticeTracking(pool: SimplePool): void {
  const poolWithRelayAccess = pool as SimplePool & {
    ensureRelay: SimplePool['ensureRelay'];
    close: SimplePool['close'];
  };

  const ensureRelay = poolWithRelayAccess.ensureRelay.bind(poolWithRelayAccess);

  poolWithRelayAccess.ensureRelay = async (...args) => {
    const relay = await ensureRelay(...args);

    const relayWithNotice = relay as typeof relay & {
      __appweaverNoticeTracking?: true;
    };

    if (relayWithNotice.__appweaverNoticeTracking === true) {
      return relay;
    }

    relayWithNotice.__appweaverNoticeTracking = true;
    const previousNoticeHandler = relay.onnotice.bind(relay);

    relay.onnotice = (message: string) => {
      previousNoticeHandler(message);

      if (!shouldBlockRelayForNotice(message)) {
        return;
      }

      blockedReadRelays.add(relay.url);

      debug(
        `relay notice: suppressing future read REQs to ${relay.url}: ${message}`,
      );

      poolWithRelayAccess.close([relay.url]);
    };

    return relay;
  };
}
