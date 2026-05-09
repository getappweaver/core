// ---------------------------------------------------------------------------
// env.ts — Environment variable parsing and bot configuration
// ---------------------------------------------------------------------------
import { delimiter, join } from 'path';

import { log } from './logger';
import { dmBotRoot } from './paths';

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type BotConfig = {
  botKeyHex: string;
  botPubkey: string | null;
  masterPubkey: string;
  botRelayUrls: string[];
  opencodeServeUrl: string | null;
  cashuMnemonic: string | null;
  cashuDefaultMintUrl: string | null;
  routstrBaseUrl: string;
  webPush: WebPushConfig | null;
  browser: {
    profileDir: string;
    headless: boolean;
  };
};

const REQUIRED_BOT_ENV = [
  'BOT_KEY',
  'BOT_MASTER_PUBKEY',
  'BOT_RELAYS',
] as const;

export type RequiredBotEnvName = (typeof REQUIRED_BOT_ENV)[number];

/** BOT_KEY + BOT_RELAYS only — for Nostr file share without loading full bot config. */
export type FileShareNostrConfig = {
  botKeyHex: string;
  botRelayUrls: string[];
};

export function requireEnv(name: string): string {
  const val = process.env[name];

  if (!val) {
    log.error(`Missing required env: ${name}`);
    process.exit(1);
  }

  return val;
}

export function getMissingRequiredBotEnv(): RequiredBotEnvName[] {
  return REQUIRED_BOT_ENV.filter(
    (name) => (process.env[name]?.trim() ?? '').length === 0,
  );
}

export function ensureWss(url: string): string {
  if (url.startsWith('wss://') || url.startsWith('ws://')) {
    return url;
  }

  return `wss://${url}`;
}

export function parseRelayUrls(envValue: string): string[] {
  const urls = envValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(ensureWss);

  return [...new Set(urls)];
}

export function normalizePath(pathValue: string): string {
  const parts = pathValue
    .split(delimiter)
    .map((p) => p.trim())
    .filter(Boolean);

  return [...new Set(parts)].join(delimiter);
}

export function loadFileShareNostrConfig(): FileShareNostrConfig {
  const botKeyHex = requireEnv('BOT_KEY');
  const relayUrls = parseRelayUrls(requireEnv('BOT_RELAYS'));

  if (relayUrls.length === 0) {
    log.error(
      'BOT_RELAYS must contain at least one relay URL (comma-separated)',
    );

    process.exit(1);
  }

  return { botKeyHex, botRelayUrls: relayUrls };
}

const VAPID_SUBJECT_PROTOCOLS = new Set(['mailto:', 'https:', 'http:']);

/**
 * VAPID `subject` must be a URI per RFC 8292 (`mailto:` or `https:` is typical).
 * `web-push` rejects bare strings like `bot-notifications`.
 * Exported for `bot:setup` when writing `.env`.
 */
export function normalizeVapidSubject(raw: string): string | null {
  const s = raw.trim();

  if (s.length === 0) {
    return null;
  }

  try {
    const u = new URL(s);

    if (VAPID_SUBJECT_PROTOCOLS.has(u.protocol)) {
      return s;
    }

    log.warn(
      `BOT_WEB_PUSH_SUBJECT must use mailto:, https:, or http: (got ${u.protocol}). Example: mailto:you@example.com`,
    );

    return null;
  } catch {
    /* not a full URL — allow bare email */
  }

  if (s.includes('@') && !s.includes(' ') && !s.includes('/')) {
    return `mailto:${s}`;
  }

  log.warn(
    `BOT_WEB_PUSH_SUBJECT must be a URI, e.g. mailto:you@example.com or https://example.com/ — not a label like ${JSON.stringify(s)}. Web Push disabled until fixed.`,
  );

  return null;
}

/** All three env vars required when enabling Web Push (VAPID). */
export function loadWebPushConfig(): WebPushConfig | null {
  const publicKey = process.env.BOT_WEB_PUSH_PUBLIC_KEY?.trim() ?? '';
  const privateKey = process.env.BOT_WEB_PUSH_PRIVATE_KEY?.trim() ?? '';
  const subjectRaw = process.env.BOT_WEB_PUSH_SUBJECT?.trim() ?? '';

  if (!publicKey || !privateKey || !subjectRaw) {
    return null;
  }

  const subject = normalizeVapidSubject(subjectRaw);

  if (!subject) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

function parseBooleanEnv(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function loadBrowserConfig(): { profileDir: string; headless: boolean } {
  return {
    profileDir:
      process.env.BOT_BROWSER_PROFILE_DIR?.trim() ||
      join(dmBotRoot, '.data', 'browser-profile'),
    headless: parseBooleanEnv(process.env.BOT_BROWSER_HEADLESS, false),
  };
}

export function loadBotConfig(): BotConfig {
  const { botKeyHex, botRelayUrls: relayUrls } = loadFileShareNostrConfig();
  const masterPubkey = requireEnv('BOT_MASTER_PUBKEY');

  return {
    botKeyHex,
    botPubkey: process.env.BOT_PUBKEY ?? null,
    masterPubkey,
    botRelayUrls: relayUrls,
    opencodeServeUrl: process.env.BOT_OPENCODE_SERVE_URL ?? null,
    cashuMnemonic: process.env.CASHU_MNEMONIC ?? null,
    cashuDefaultMintUrl: process.env.CASHU_DEFAULT_MINT_URL ?? null,
    routstrBaseUrl:
      process.env.ROUTSTR_BASE_URL ?? 'https://api.routstr.com/v1',
    webPush: loadWebPushConfig(),
    browser: loadBrowserConfig(),
  };
}
