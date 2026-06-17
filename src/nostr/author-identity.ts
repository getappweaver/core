import { nip19 } from 'nostr-tools';

const NIP05_VERIFY_MAX_WAIT_MS = 3_000;

export type AuthorIdentity = {
  label: string;
  href: string;
  verified: boolean;
  nip05: string | null;
  lud16: string | null;
  lud06: string | null;
};

export function maskedNpub(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);

    return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
  } catch {
    return `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;
  }
}

export function npubHref(pubkey: string): string {
  try {
    return `https://nosta.me/${nip19.npubEncode(pubkey)}`;
  } catch {
    return `https://nosta.me/${pubkey}`;
  }
}

export function fallbackAuthorIdentity(pubkey: string): AuthorIdentity {
  return {
    label: maskedNpub(pubkey),
    href: npubHref(pubkey),
    verified: false,
    nip05: null,
    lud16: null,
    lud06: null,
  };
}

export function authorHref(nip05: string): string {
  return `https://nosta.me/${nip05.replace(/^_@/, '')}`;
}

export function normalizeNip05(value: string): string | null {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('@')) {
    return `_${trimmed}`;
  }

  if (!trimmed.includes('@')) {
    return `_${trimmed.startsWith('@') ? '' : '@'}${trimmed}`;
  }

  return trimmed;
}

export function decodeNpub(value: string): string | null {
  try {
    const decoded = nip19.decode(value);

    return decoded.type === 'npub' && typeof decoded.data === 'string'
      ? decoded.data
      : null;
  } catch {
    return null;
  }
}

export async function verifyNip05({
  nip05,
  expectedPubkey,
}: {
  nip05: string;
  expectedPubkey: string;
}): Promise<boolean> {
  const normalized = normalizeNip05(nip05);

  if (!normalized) {
    return false;
  }

  const [name, domain] = normalized.split('@');

  if (!name || !domain) {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NIP05_VERIFY_MAX_WAIT_MS);

  try {
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { names?: Record<string, unknown> };
    const pubkey = data.names?.[name];

    return typeof pubkey === 'string' && pubkey === expectedPubkey;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifiedNip05AuthorIdentity({
  pubkey,
  nip05,
}: {
  pubkey: string;
  nip05: string | null;
}): Promise<AuthorIdentity> {
  const fallback = fallbackAuthorIdentity(pubkey);
  const normalized = nip05 ? normalizeNip05(nip05) : null;

  if (!normalized) {
    return fallback;
  }

  if (await verifyNip05({ nip05: normalized, expectedPubkey: pubkey })) {
    return {
      label: normalized,
      href: authorHref(normalized),
      verified: true,
      nip05: normalized,
      lud16: fallback.lud16,
      lud06: fallback.lud06,
    };
  }

  return fallback;
}
