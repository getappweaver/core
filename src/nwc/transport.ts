import type { SimplePool } from 'nostr-tools/pool';

/** Relay operations used by NWC without taking ownership of the shared pool. */
export type NwcTransport = Pick<SimplePool, 'publish' | 'subscribe'>;
