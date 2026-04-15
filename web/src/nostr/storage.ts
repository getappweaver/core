// ---------------------------------------------------------------------------
// web/src/nostr/storage.ts — localStorage persistence for signer data
//
// Browser analogue of src/nostr/connections.ts.
// Validates on load (no zod — avoids Vite @fs/… URLs for deps outside web/).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types (mirrors BunkerSignerData in src/nostr/connections.ts)
// ---------------------------------------------------------------------------

export type BunkerSignerData = {
  relays: string[];
  ephemeralSecret: string;
  ephemeralPubkey: string;
  remoteSignerPubkey: string;
  userPubkey: string;
};

const HEX64 = /^[a-fA-F0-9]{64}$/;

function isHex64(value: string): boolean {
  return HEX64.test(value);
}

function parseBunkerSignerData(parsed: unknown): BunkerSignerData | null {
  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }

  const o = parsed as Record<string, unknown>;

  if (!Array.isArray(o.relays)) {
    return null;
  }

  const relays: string[] = [];

  for (const r of o.relays) {
    if (typeof r !== 'string' || r.trim().length === 0) {
      return null;
    }

    relays.push(r);
  }

  if (
    typeof o.ephemeralSecret !== 'string' ||
    typeof o.ephemeralPubkey !== 'string' ||
    typeof o.remoteSignerPubkey !== 'string' ||
    typeof o.userPubkey !== 'string'
  ) {
    return null;
  }

  const {
    ephemeralSecret,
    ephemeralPubkey,
    remoteSignerPubkey,
    userPubkey,
  } = o;

  if (
    !isHex64(ephemeralSecret) ||
    !isHex64(ephemeralPubkey) ||
    !isHex64(remoteSignerPubkey) ||
    !isHex64(userPubkey)
  ) {
    return null;
  }

  return {
    relays,
    ephemeralSecret,
    ephemeralPubkey,
    remoteSignerPubkey,
    userPubkey,
  };
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'dm-bot:bunker-connection';
const NIP07_KEY = 'dm-bot:nip07-pubkey';
const NIP55_KEY = 'dm-bot:nip55-pubkey';

// ---------------------------------------------------------------------------
// NIP-07 / NIP-55 pubkey persistence
// ---------------------------------------------------------------------------

export function saveNip07Pubkey(pubkey: string): void {
  localStorage.setItem(NIP07_KEY, pubkey);
}

export function loadNip07Pubkey(): string | null {
  const raw = localStorage.getItem(NIP07_KEY);

  if (!raw) {
    return null;
  }

  return /^[a-fA-F0-9]{64}$/.test(raw) ? raw : null;
}

export function clearNip07Pubkey(): void {
  localStorage.removeItem(NIP07_KEY);
}

export function saveNip55Pubkey(pubkey: string): void {
  localStorage.setItem(NIP55_KEY, pubkey);
}

export function loadNip55Pubkey(): string | null {
  const raw = localStorage.getItem(NIP55_KEY);

  if (!raw) {
    return null;
  }

  return /^[a-fA-F0-9]{64}$/.test(raw) ? raw : null;
}

export function clearNip55Pubkey(): void {
  localStorage.removeItem(NIP55_KEY);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function saveBunkerData(data: BunkerSignerData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadBunkerData(): BunkerSignerData | null {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const data = parseBunkerSignerData(parsed);

    if (data !== null) {
      return data;
    }

    clearBunkerData();
    return null;
  } catch {
    clearBunkerData();
    return null;
  }
}

export function clearBunkerData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
