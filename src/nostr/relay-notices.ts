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
  return operation[0] !== 'read' || !blockedReadRelays.has(relayUrl);
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
