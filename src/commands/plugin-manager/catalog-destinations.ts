import { getState, setState, type CoreDb } from '@src/db';
import { uniqueRelays } from '@src/nostr/nip65';

const KEY = 'plugins.catalog-destinations';

export function catalogDestinations(db: CoreDb): string[] {
  try {
    const value: unknown = JSON.parse(getState(db, KEY) ?? '[]');

    return Array.isArray(value)
      ? value
          .filter(
            (relay): relay is string =>
              typeof relay === 'string' && /^wss?:\/\//.test(relay),
          )
          .slice(0, 32)
      : [];
  } catch {
    return [];
  }
}

export function rememberCatalogDestinations(
  db: CoreDb,
  relays: string[],
): void {
  setState(
    db,
    KEY,
    JSON.stringify(
      uniqueRelays([...relays, ...catalogDestinations(db)]).slice(0, 32),
    ),
  );
}
