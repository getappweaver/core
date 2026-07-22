import type { Event, Filter } from 'nostr-tools';
import type { SimplePool } from 'nostr-tools/pool';

import { debug } from '../logger';

export const RELAY_OVERLOAD_COOLDOWN_MS = 60_000;

type RelayReadBlock = {
  permanent: boolean;
  blockedUntilMs: number;
};

const blockedReadRelays = new Map<string, RelayReadBlock>();

function blockForNotice(message: string): RelayReadBlock | null {
  const normalized = message.toLowerCase();

  if (normalized.includes('does not accept reqs')) {
    return { permanent: true, blockedUntilMs: Number.POSITIVE_INFINITY };
  }

  if (normalized.includes('too many concurrent reqs')) {
    return {
      permanent: false,
      blockedUntilMs: Date.now() + RELAY_OVERLOAD_COOLDOWN_MS,
    };
  }

  return null;
}

function activeReadBlock(relayUrl: string): RelayReadBlock | null {
  const block = blockedReadRelays.get(relayUrl);

  if (!block) {
    return null;
  }

  if (!block.permanent && block.blockedUntilMs <= Date.now()) {
    blockedReadRelays.delete(relayUrl);

    return null;
  }

  return block;
}

export function filterBlockedReadRelays(relays: string[]): string[] {
  return relays.filter((relay) => activeReadBlock(relay) === null);
}

export function allowRelayOperation(
  relayUrl: string,
  operation: ['read', Filter[]] | ['write', Event],
): boolean {
  if (operation[0] !== 'read' || activeReadBlock(relayUrl) === null) {
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

      const block = blockForNotice(message);

      if (!block) {
        return;
      }

      const existing = activeReadBlock(relay.url);
      const appliedBlock = existing?.permanent === true ? existing : block;

      blockedReadRelays.set(relay.url, appliedBlock);

      debug(
        `relay notice: ${appliedBlock.permanent ? 'suppressing future' : 'cooling down'} read REQs to ${relay.url}: ${message}`,
      );

      poolWithRelayAccess.close([relay.url]);
    };

    return relay;
  };
}
