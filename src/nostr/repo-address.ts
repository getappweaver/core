import { nip19 } from 'nostr-tools';

import { normalizeNip05 } from './author-identity';
import { normalizeRelay, uniqueRelays } from './nip65';

export type NostrRepoAddress = {
  source: string;
  authorHint: string;
  repoId: string;
  relayHints: string[];
};

export function parseNostrRepoAddress(value: string): NostrRepoAddress | null {
  const source = value.trim();

  if (!source.startsWith('nostr://')) {
    return null;
  }

  const parts = source
    .slice('nostr://'.length)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const authorHint = parts[0] ?? '';
  const repoId = parts.at(-1) ?? '';
  const relayHints = uniqueRelays(parts.slice(1, -1));

  if (!authorHint || !repoId) {
    return null;
  }

  return { source, authorHint, repoId, relayHints };
}

export function repoAddressAuthorNpub(authorHint: string): string | null {
  try {
    const decoded = nip19.decode(authorHint);

    return decoded.type === 'npub' && typeof decoded.data === 'string'
      ? decoded.data
      : null;
  } catch {
    return null;
  }
}

export function repoAddressAuthorNip05(authorHint: string): string | null {
  return repoAddressAuthorNpub(authorHint) ? null : normalizeNip05(authorHint);
}

export function nostrRepoAddress({
  authorHint,
  repoId,
  relayHints,
}: {
  authorHint: string;
  repoId: string;
  relayHints: readonly string[];
}): string {
  const relay = relayHints
    .map((hint) => normalizeRelay(hint))
    .find((hint): hint is string => hint !== null);

  const relayHost = relay ? new URL(relay).host : null;

  return relayHost
    ? `nostr://${authorHint}/${relayHost}/${repoId}`
    : `nostr://${authorHint}/${repoId}`;
}
