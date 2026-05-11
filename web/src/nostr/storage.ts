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

  const { ephemeralSecret, ephemeralPubkey, remoteSignerPubkey, userPubkey } =
    o;

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

const STORAGE_KEY = 'appweaver:bunker-connection';
const NIP07_KEY = 'appweaver:nip07-pubkey';
const NIP55_KEY = 'appweaver:nip55-pubkey';
const NIP49_NCRYPTSEC_KEY = 'appweaver:nip49-ncryptsec';
const NIP49_PUBKEY_KEY = 'appweaver:nip49-pubkey';

const LEGACY_STORAGE_KEY = 'dm-bot:bunker-connection';
const LEGACY_NIP07_KEY = 'dm-bot:nip07-pubkey';
const LEGACY_NIP55_KEY = 'dm-bot:nip55-pubkey';
const LEGACY_NIP49_NCRYPTSEC_KEY = 'dm-bot:nip49-ncryptsec';
const LEGACY_NIP49_PUBKEY_KEY = 'dm-bot:nip49-pubkey';

function loadStorageValue(key: string, legacyKey: string): string | null {
  const raw = localStorage.getItem(key);

  if (raw !== null) {
    return raw;
  }

  const legacyRaw = localStorage.getItem(legacyKey);

  if (legacyRaw !== null) {
    localStorage.setItem(key, legacyRaw);
  }

  return legacyRaw;
}

function clearStorageValue(key: string, legacyKey: string): void {
  localStorage.removeItem(key);
  localStorage.removeItem(legacyKey);
}

// ---------------------------------------------------------------------------
// NIP-07 / NIP-55 pubkey persistence
// ---------------------------------------------------------------------------

export function saveNip07Pubkey(pubkey: string): void {
  localStorage.setItem(NIP07_KEY, pubkey);
}

export function loadNip07Pubkey(): string | null {
  const raw = loadStorageValue(NIP07_KEY, LEGACY_NIP07_KEY);

  if (!raw) {
    return null;
  }

  return /^[a-fA-F0-9]{64}$/.test(raw) ? raw : null;
}

export function clearNip07Pubkey(): void {
  clearStorageValue(NIP07_KEY, LEGACY_NIP07_KEY);
}

export function saveNip55Pubkey(pubkey: string): void {
  localStorage.setItem(NIP55_KEY, pubkey);
}

export function loadNip55Pubkey(): string | null {
  const raw = loadStorageValue(NIP55_KEY, LEGACY_NIP55_KEY);

  if (!raw) {
    return null;
  }

  return /^[a-fA-F0-9]{64}$/.test(raw) ? raw : null;
}

export function clearNip55Pubkey(): void {
  clearStorageValue(NIP55_KEY, LEGACY_NIP55_KEY);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function saveBunkerData(data: BunkerSignerData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadBunkerData(): BunkerSignerData | null {
  const raw = loadStorageValue(STORAGE_KEY, LEGACY_STORAGE_KEY);

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
  clearStorageValue(STORAGE_KEY, LEGACY_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// NIP-49 (ncryptsec) — ciphertext + pubkey only; decrypted key is never stored
// ---------------------------------------------------------------------------

function isNcryptsecShape(value: string): boolean {
  const t = value.trim();

  return t.startsWith('ncryptsec1') && t.length >= 16;
}

export function saveNip49Bundle(ncryptsec: string, pubkeyHex: string): void {
  localStorage.setItem(NIP49_NCRYPTSEC_KEY, ncryptsec.trim());
  localStorage.setItem(NIP49_PUBKEY_KEY, pubkeyHex);
}

export function loadNip49Ncryptsec(): string | null {
  const raw = loadStorageValue(NIP49_NCRYPTSEC_KEY, LEGACY_NIP49_NCRYPTSEC_KEY);

  if (!raw) {
    return null;
  }

  return isNcryptsecShape(raw) ? raw.trim() : null;
}

export function loadNip49Pubkey(): string | null {
  const raw = loadStorageValue(NIP49_PUBKEY_KEY, LEGACY_NIP49_PUBKEY_KEY);

  if (!raw) {
    return null;
  }

  return /^[a-fA-F0-9]{64}$/.test(raw) ? raw : null;
}

export function loadNip49Bundle(): {
  ncryptsec: string;
  pubkey: string;
} | null {
  const ncryptsec = loadNip49Ncryptsec();
  const pubkey = loadNip49Pubkey();

  if (!ncryptsec || !pubkey) {
    if (ncryptsec === null && pubkey === null) {
      return null;
    }

    clearNip49Bundle();

    return null;
  }

  return { ncryptsec, pubkey };
}

export function clearNip49Bundle(): void {
  clearStorageValue(NIP49_NCRYPTSEC_KEY, LEGACY_NIP49_NCRYPTSEC_KEY);
  clearStorageValue(NIP49_PUBKEY_KEY, LEGACY_NIP49_PUBKEY_KEY);
}

/** Clears bunker, NIP-07, NIP-55, and NIP-49 signer data from localStorage. */
export function clearAllNostrSignerStorage(): void {
  clearBunkerData();
  clearNip07Pubkey();
  clearNip55Pubkey();
  clearNip49Bundle();
}
