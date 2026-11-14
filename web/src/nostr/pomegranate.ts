// ---------------------------------------------------------------------------
// web/src/nostr/pomegranate.ts — Pomegranate Google-FROST bunker client
// ---------------------------------------------------------------------------

import { argon2id } from '@noble/hashes/argon2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools';

import { bunkerPool, bunkerSignEvent } from './bunker';
import type { BunkerSignerData } from './storage';

export const DEFAULT_POMEGRANATE_CENTRAL = 'https://auth.njump.me';

export const DEFAULT_POMEGRANATE_OPERATORS: readonly string[] = [
  'https://po.yakihonne.com',
  'https://po.coracle.social',
  'https://po.njump.me',
  'https://po.jumble.social',
];

export const SETUP_ANNOUNCEMENT_RELAYS: readonly string[] = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://relay.ditto.pub',
];

const KIND_OAUTH_TOKEN = 20443;
const KIND_DKG_ATTESTATION = 26436;
const KIND_SETUP_ANNOUNCEMENT = 16440;
export const APPWEAVER_PROFILE_NAME = 'AppWeaver';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PomegranateAccountOperator = {
  url: string;
  pubshard: string;
};

export type PomegranateAccount = {
  email: string;
  pubkey: string;
  operators: PomegranateAccountOperator[];
  threshold: number;
  proofs: NostrEvent[] | null;
};

export type PomegranateProfile = {
  handler_pubkey: string;
  name: string;
  email: string;
};

export type PomegranateDkgAttestation = {
  session: string;
  central: string;
  email: string;
  threshold: number;
  operators: { url: string; pubkey: string }[];
  pubkey: string;
  index: number;
  pubshard: string;
  secretHash: string | null;
};

export type PomegranateExistingAnnouncement = {
  centralUrl: string;
  createdAt: number;
};

export type PomegranateAuthPopupProps = {
  centralUrl: string;
  timeoutMs: number;
  signal: AbortSignal;
};

export type PomegranateApiAuthProps = {
  centralUrl: string;
  token: string;
  signal: AbortSignal;
};

export type PomegranateSearchAnnouncementProps = {
  email: string;
  timeoutMs: number;
};

export type PomegranateVerifyDkgProofsProps = {
  proofs: NostrEvent[];
  email: string;
  centralUrl: string;
  operatorKeys: Record<string, string>;
};

export type PomegranateVerifyAccountProps = {
  account: PomegranateAccount;
  centralUrl: string;
  signal: AbortSignal;
};

export type PomegranateRunDkgProps = {
  centralUrl: string;
  token: string;
  operators: string[];
  threshold: number;
  signal: AbortSignal;
};

export type PomegranateEnsureProfileProps = {
  centralUrl: string;
  token: string;
  profileName: string;
  signal: AbortSignal;
};

export type PomegranatePublishAnnouncementProps = {
  account: PomegranateAccount;
  centralUrl: string;
  bunkerData: BunkerSignerData;
};

type OperatorInfo = {
  pubkey: string;
  hostpubkey: string;
  providers: string[];
};

// ---------------------------------------------------------------------------
// URL & Operator Helpers
// ---------------------------------------------------------------------------

export function massagePomegranateUrl(input: string): string {
  let url = input.trim();

  if (!url) {
    throw new Error('URL cannot be empty');
  }

  if (!url.startsWith('http')) {
    url =
      'http' +
      (url.startsWith('localhost') || url.startsWith('127.0.0.1') ? '' : 's') +
      '://' +
      url;
  }

  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`Invalid coordinator or operator URL: "${input}"`);
  }
}

export function pickDefaultOperators(count: number): string[] {
  const shuffled = [...DEFAULT_POMEGRANATE_OPERATORS].sort(
    () => Math.random() - 0.5,
  );

  return shuffled
    .slice(0, Math.max(1, count))
    .map((u) => massagePomegranateUrl(u));
}

export function computeDefaultThreshold(operatorCount: number): number {
  if (operatorCount < 2) {
    return 2;
  }

  return Math.ceil((operatorCount * 7) / 12);
}

function getFirstTagValue(tags: string[][], name: string): string | null {
  const tag = tags.find(
    (t) => t[0] === name && typeof t[1] === 'string' && t[1].length > 0,
  );

  return tag?.[1] ?? null;
}

export function extractEmailFromToken(token: string): string {
  const decoded = atob(token);
  const parsed = JSON.parse(decoded) as NostrEvent;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    parsed.kind !== KIND_OAUTH_TOKEN ||
    !verifyEvent(parsed)
  ) {
    throw new Error('Invalid or unverified OAuth token signature (kind 20443)');
  }

  if (!Array.isArray(parsed.tags)) {
    throw new Error('Auth token missing tags array');
  }

  const emailTag = parsed.tags.find(
    (tag): tag is [string, string] =>
      Array.isArray(tag) &&
      tag.length > 1 &&
      tag[0] === 'email' &&
      typeof tag[1] === 'string' &&
      tag[1].trim().length > 0,
  );

  if (!emailTag || !emailTag[1]) {
    throw new Error('Auth token missing email tag');
  }

  return emailTag[1].trim();
}

// ---------------------------------------------------------------------------
// Authentication Popup
// ---------------------------------------------------------------------------

export function authenticateWithGooglePopup(
  props: PomegranateAuthPopupProps,
): Promise<{ token: string; email: string }> {
  return new Promise((resolve, reject) => {
    if (props.signal.aborted) {
      reject(new Error('Authentication aborted'));

      return;
    }

    const centralOrigin = massagePomegranateUrl(props.centralUrl);

    const popup = window.open(
      `${centralOrigin}/login/google`,
      'PomegranateOAuth',
      'width=600,height=650',
    );

    if (!popup) {
      reject(new Error('Login popup was blocked by the browser'));

      return;
    }

    let intervalId: number | null = null;
    let timeoutId: number | null = null;

    function cleanup(): void {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      window.removeEventListener('message', onMessage);
      props.signal.removeEventListener('abort', onAbort);
    }

    function onAbort(): void {
      cleanup();
      try {
        popup?.close();
      } catch {
        // ignore
      }

      reject(new Error('Authentication aborted'));
    }

    function onMessage(event: MessageEvent): void {
      if (event.origin !== centralOrigin) {
        return;
      }

      if (typeof event.data !== 'object' || event.data === null) {
        return;
      }

      const rawToken = (event.data as Record<string, unknown>).token;

      if (typeof rawToken !== 'string' || rawToken.length === 0) {
        return;
      }

      cleanup();
      try {
        popup?.close();
      } catch {
        // ignore
      }

      try {
        const email = extractEmailFromToken(rawToken);
        resolve({ token: rawToken, email });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    props.signal.addEventListener('abort', onAbort, { once: true });
    window.addEventListener('message', onMessage);

    intervalId = window.setInterval(() => {
      if (popup.closed) {
        cleanup();

        reject(
          new Error('Login window was closed before completing authentication'),
        );
      }
    }, 400);

    timeoutId = window.setTimeout(() => {
      cleanup();
      try {
        popup?.close();
      } catch {
        // ignore
      }

      reject(new Error('Login timed out'));
    }, props.timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Account API
// ---------------------------------------------------------------------------

export async function fetchPomegranateAccount(
  props: PomegranateApiAuthProps,
): Promise<PomegranateAccount | null> {
  const centralOrigin = massagePomegranateUrl(props.centralUrl);

  const resp = await fetch(`${centralOrigin}/account`, {
    method: 'GET',
    headers: {
      Authorization: `Token ${props.token}`,
    },
    signal: props.signal,
  });

  if (resp.status === 404) {
    return null;
  }

  if (resp.status === 401) {
    throw new Error('Coordinator rejected authentication token (401)');
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(
      `Failed to fetch Pomegranate account (${resp.status}): ${errText}`.trim(),
    );
  }

  const raw = (await resp.json()) as {
    email?: unknown;
    pubkey?: unknown;
    operators?: unknown;
    threshold?: unknown;
    proofs?: unknown;
  };

  if (typeof raw.pubkey !== 'string' || !Array.isArray(raw.operators)) {
    throw new Error('Invalid account response payload from coordinator');
  }

  const email =
    typeof raw.email === 'string' && raw.email.length > 0
      ? raw.email
      : extractEmailFromToken(props.token);

  const operators: PomegranateAccountOperator[] = raw.operators
    .filter(
      (op): op is { url: unknown; pubshard: unknown } =>
        typeof op === 'object' && op !== null,
    )
    .map((op) => ({
      url: typeof op.url === 'string' ? op.url : '',
      pubshard: typeof op.pubshard === 'string' ? op.pubshard : '',
    }))
    .filter((op) => op.url.length > 0 && op.pubshard.length > 0);

  const threshold =
    typeof raw.threshold === 'number'
      ? raw.threshold
      : computeDefaultThreshold(operators.length);

  const proofs = Array.isArray(raw.proofs)
    ? (raw.proofs as NostrEvent[])
    : null;

  return {
    email,
    pubkey: raw.pubkey,
    operators,
    threshold,
    proofs,
  };
}

// ---------------------------------------------------------------------------
// Discovery via Setup Announcement (NIP Kind 16440)
// ---------------------------------------------------------------------------

export async function searchSetupAnnouncement(
  props: PomegranateSearchAnnouncementProps,
): Promise<PomegranateExistingAnnouncement | null> {
  if (props.email.trim().length === 0) {
    return null;
  }

  const utf8 = new TextEncoder();
  const lowerEmail = props.email.trim().toLowerCase();
  const rawEmail = props.email.trim();

  const hashes = [
    bytesToHex(
      argon2id(utf8.encode(lowerEmail), 'pomegranate', {
        t: 1,
        m: 65536,
        p: 4,
      }),
    ),
  ];

  if (rawEmail !== lowerEmail) {
    hashes.push(
      bytesToHex(
        argon2id(utf8.encode(rawEmail), 'pomegranate', {
          t: 1,
          m: 65536,
          p: 4,
        }),
      ),
    );
  }

  try {
    const event = await bunkerPool.get(
      Array.from(SETUP_ANNOUNCEMENT_RELAYS),
      {
        kinds: [KIND_SETUP_ANNOUNCEMENT],
        '#m': hashes,
      },
      { maxWait: props.timeoutMs },
    );

    if (!event) {
      return null;
    }

    const centralTag = getFirstTagValue(event.tags, 'central');

    if (!centralTag) {
      return null;
    }

    return {
      centralUrl: massagePomegranateUrl(centralTag),
      createdAt: event.created_at,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// DKG Proof Verification
// ---------------------------------------------------------------------------

export function verifyPubshardId(
  pubshardHex: string,
  expectedId: number,
): boolean {
  if (!/^[0-9a-fA-F]{70}$/.test(pubshardHex)) {
    return false;
  }

  const id = parseInt(pubshardHex.slice(0, 4), 16);
  const prefix = pubshardHex.slice(4, 6).toLowerCase();

  return id === expectedId && (prefix === '02' || prefix === '03');
}

async function fetchOperatorKeys(
  operatorUrls: string[],
  signal: AbortSignal,
): Promise<Record<string, string>> {
  const keys: Record<string, string> = {};

  await Promise.all(
    operatorUrls.map(async (url) => {
      const resp = await fetch(`${url}/po/info`, { signal });

      if (!resp.ok) {
        throw new Error(
          `Operator ${url} doesn't support key generation (${resp.status})`,
        );
      }

      const info = (await resp.json()) as OperatorInfo;

      if (
        typeof info.pubkey !== 'string' ||
        typeof info.hostpubkey !== 'string' ||
        info.hostpubkey.length !== 66 ||
        info.hostpubkey.slice(2) !== info.pubkey
      ) {
        throw new Error(`Operator ${url} has an invalid key`);
      }

      keys[url] = info.pubkey;
    }),
  );

  return keys;
}

export function parseDkgAttestation(
  event: NostrEvent,
): PomegranateDkgAttestation {
  if (event.kind !== KIND_DKG_ATTESTATION) {
    throw new Error(`Wrong attestation kind: ${event.kind}`);
  }

  if (!verifyEvent(event)) {
    throw new Error('Invalid attestation event signature');
  }

  const session = getFirstTagValue(event.tags, 'session');
  const central = getFirstTagValue(event.tags, 'central');
  const email = getFirstTagValue(event.tags, 'email');
  const thresholdRaw = getFirstTagValue(event.tags, 'threshold');
  const threshold = parseInt(thresholdRaw ?? '', 10);
  const pubkey = getFirstTagValue(event.tags, 'p');
  const indexRaw = getFirstTagValue(event.tags, 'index');
  const index = parseInt(indexRaw ?? '', 10);
  const pubshard = getFirstTagValue(event.tags, 'pubshard');
  const secretHash = getFirstTagValue(event.tags, 'secret');

  const operators = event.tags
    .filter((tag) => tag[0] === 'operator')
    .map((tag) => {
      if (tag.length < 3 || tag[2].length !== 66) {
        throw new Error('Invalid operator tag in attestation');
      }

      return { url: tag[1], pubkey: tag[2].slice(2) };
    });

  if (!session || !central || !email || !pubkey || !pubshard) {
    throw new Error('Missing required tags in DKG attestation');
  }

  if (operators.length < 2) {
    throw new Error('DKG requires at least 2 operators');
  }

  if (
    Number.isNaN(threshold) ||
    threshold < 1 ||
    threshold > operators.length
  ) {
    throw new Error(`Invalid threshold in attestation: ${thresholdRaw}`);
  }

  if (Number.isNaN(index) || index < 0 || index >= operators.length) {
    throw new Error(`Invalid operator index in attestation: ${indexRaw}`);
  }

  if (operators[index].pubkey !== event.pubkey) {
    throw new Error(
      `Attestation signed by ${event.pubkey}, but operator index ${index} has pubkey ${operators[index].pubkey}`,
    );
  }

  if (!verifyPubshardId(pubshard, index + 1)) {
    throw new Error(
      `Pubshard id mismatch: expected ${index + 1} for index ${index}`,
    );
  }

  return {
    session,
    central,
    email,
    threshold,
    operators,
    pubkey,
    index,
    pubshard,
    secretHash,
  };
}

function sameCeremony(
  a: PomegranateDkgAttestation,
  b: PomegranateDkgAttestation,
): boolean {
  return (
    a.session === b.session &&
    a.central === b.central &&
    a.email === b.email &&
    a.threshold === b.threshold &&
    a.pubkey === b.pubkey &&
    a.operators.length === b.operators.length &&
    a.operators.every(
      (op, i) =>
        op.url === b.operators[i].url && op.pubkey === b.operators[i].pubkey,
    )
  );
}

export function verifyDKGProofs(
  props: PomegranateVerifyDkgProofsProps,
): PomegranateDkgAttestation {
  const operatorUrls = Object.keys(props.operatorKeys);

  if (props.proofs.length !== operatorUrls.length) {
    throw new Error(
      `Got ${props.proofs.length} proofs for ${operatorUrls.length} operators`,
    );
  }

  const attestations = props.proofs.map((proof, i) => {
    try {
      return parseDkgAttestation(proof);
    } catch (err) {
      throw new Error(
        `Proof ${i}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  const first = attestations[0];

  if (first.email.trim().toLowerCase() !== props.email.trim().toLowerCase()) {
    throw new Error(`Key was generated for ${first.email}, not ${props.email}`);
  }

  if (
    massagePomegranateUrl(first.central) !==
    massagePomegranateUrl(props.centralUrl)
  ) {
    throw new Error(
      `Key generation was coordinated by ${first.central}, not ${props.centralUrl}`,
    );
  }

  if (first.operators.length !== operatorUrls.length) {
    throw new Error(
      `Key was generated by ${first.operators.length} operators, expected ${operatorUrls.length}`,
    );
  }

  for (const op of first.operators) {
    const key = props.operatorKeys[massagePomegranateUrl(op.url)];

    if (!key) {
      throw new Error(`Unexpected operator ${op.url}`);
    }

    if (key !== op.pubkey) {
      throw new Error(
        `Operator ${op.url} took part with key ${op.pubkey}, but its verified key is ${key}`,
      );
    }
  }

  const seen = new Set<number>();
  for (const [i, a] of attestations.entries()) {
    if (!sameCeremony(a, first)) {
      throw new Error(`Proof ${i} is from a different ceremony`);
    }

    if (seen.has(a.index)) {
      throw new Error(`Two proofs from operator ${a.index}`);
    }

    seen.add(a.index);

    if (a.secretHash !== null) {
      throw new Error(
        `Operator ${a.operators[a.index].url} can be unlocked with a secret credential`,
      );
    }
  }

  return first;
}

export async function verifyAccountProofs(
  props: PomegranateVerifyAccountProps,
): Promise<PomegranateDkgAttestation> {
  if (!props.account.proofs || props.account.proofs.length === 0) {
    throw new Error('Account has no DKG proofs to verify');
  }

  const operatorUrls = props.account.operators.map((op) =>
    massagePomegranateUrl(op.url),
  );

  const operatorKeys = await fetchOperatorKeys(operatorUrls, props.signal);

  const attestation = verifyDKGProofs({
    proofs: props.account.proofs,
    email: props.account.email,
    centralUrl: props.centralUrl,
    operatorKeys,
  });

  if (attestation.pubkey !== props.account.pubkey) {
    throw new Error(
      `Central reported pubkey ${props.account.pubkey}, but operators generated ${attestation.pubkey}`,
    );
  }

  if (attestation.threshold !== props.account.threshold) {
    throw new Error(
      `Central reported threshold ${props.account.threshold}, but operators agreed on ${attestation.threshold}`,
    );
  }

  for (const [i, op] of props.account.operators.entries()) {
    const proof = parseDkgAttestation(props.account.proofs[i]);

    if (
      massagePomegranateUrl(attestation.operators[i].url) !== operatorUrls[i] ||
      proof.index !== i ||
      proof.pubshard !== op.pubshard
    ) {
      throw new Error(
        `Central's record for operator ${op.url} doesn't match the proofs`,
      );
    }
  }

  return attestation;
}

// ---------------------------------------------------------------------------
// Run DKG (Distributed Key Generation)
// ---------------------------------------------------------------------------

export async function runPomegranateDkg(
  props: PomegranateRunDkgProps,
): Promise<PomegranateAccount> {
  const centralOrigin = massagePomegranateUrl(props.centralUrl);

  const normalizedOperators = Array.from(
    new Set(props.operators.map((u) => massagePomegranateUrl(u))),
  );

  const resp = await fetch(`${centralOrigin}/dkg`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${props.token}`,
    },
    body: JSON.stringify({
      operators: normalizedOperators,
      threshold: props.threshold,
    }),
    signal: props.signal,
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => '');
    throw new Error(
      `Key generation failed (${resp.status}): ${errorText}`.trim(),
    );
  }

  const raw = (await resp.json()) as {
    email?: unknown;
    pubkey?: unknown;
    operators?: unknown;
    threshold?: unknown;
    proofs?: unknown;
  };

  const email =
    typeof raw.email === 'string' && raw.email.length > 0
      ? raw.email
      : extractEmailFromToken(props.token);

  if (typeof raw.pubkey !== 'string' || !Array.isArray(raw.operators)) {
    throw new Error('Invalid DKG account response from central');
  }

  const accountOps: PomegranateAccountOperator[] = raw.operators
    .filter(
      (op): op is { url: unknown; pubshard: unknown } =>
        typeof op === 'object' && op !== null,
    )
    .map((op) => ({
      url: typeof op.url === 'string' ? op.url : '',
      pubshard: typeof op.pubshard === 'string' ? op.pubshard : '',
    }));

  const account: PomegranateAccount = {
    email,
    pubkey: raw.pubkey,
    operators: accountOps,
    threshold:
      typeof raw.threshold === 'number' ? raw.threshold : props.threshold,
    proofs: Array.isArray(raw.proofs) ? (raw.proofs as NostrEvent[]) : null,
  };

  await verifyAccountProofs({
    account,
    centralUrl: centralOrigin,
    signal: props.signal,
  });

  return account;
}

// ---------------------------------------------------------------------------
// Profiles & Bunker Setup
// ---------------------------------------------------------------------------

export async function ensureAppWeaverProfile(
  props: PomegranateEnsureProfileProps,
): Promise<{ bunkerUrl: string; handlerPubkey: string }> {
  const centralOrigin = massagePomegranateUrl(props.centralUrl);

  async function listProfiles(): Promise<PomegranateProfile[]> {
    const resp = await fetch(`${centralOrigin}/profiles`, {
      method: 'GET',
      headers: {
        Authorization: `Token ${props.token}`,
      },
      signal: props.signal,
    });

    if (!resp.ok) {
      throw new Error(`Failed to list profiles from central (${resp.status})`);
    }

    const data = (await resp.json()) as unknown;

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .filter(
        (p): p is Record<string, unknown> =>
          typeof p === 'object' && p !== null,
      )
      .map((p) => ({
        handler_pubkey:
          typeof p.handler_pubkey === 'string' ? p.handler_pubkey : '',
        name: typeof p.name === 'string' ? p.name : '',
        email: typeof p.email === 'string' ? p.email : '',
      }))
      .filter((p) => p.handler_pubkey.length === 64);
  }

  let profiles = await listProfiles();
  let matching = profiles.find(
    (p) => p.name.toLowerCase() === props.profileName.toLowerCase(),
  );

  if (!matching) {
    const createResp = await fetch(`${centralOrigin}/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${props.token}`,
      },
      body: JSON.stringify({ name: props.profileName }),
      signal: props.signal,
    });

    if (!createResp.ok) {
      const errText = await createResp.text().catch(() => '');
      throw new Error(
        `Failed to create ${props.profileName} profile (${createResp.status}): ${errText}`.trim(),
      );
    }

    profiles = await listProfiles();

    matching =
      profiles.find(
        (p) => p.name.toLowerCase() === props.profileName.toLowerCase(),
      ) ||
      profiles.find((p) => p.name.toLowerCase() === 'default') ||
      profiles[0];
  }

  if (!matching) {
    throw new Error(
      'No profile available on Pomegranate coordinator after provisioning',
    );
  }

  const wsRelay = centralOrigin.replace(/^http/, 'ws');
  const bunkerUrl = `bunker://${matching.handler_pubkey}?relay=${encodeURIComponent(wsRelay)}`;

  return {
    bunkerUrl,
    handlerPubkey: matching.handler_pubkey,
  };
}

export async function publishSetupAnnouncementViaBunker(
  props: PomegranatePublishAnnouncementProps,
): Promise<void> {
  const utf8 = new TextEncoder();
  const lowerEmail = props.account.email.trim().toLowerCase();

  const emailHash = bytesToHex(
    argon2id(utf8.encode(lowerEmail), 'pomegranate', {
      t: 1,
      m: 65536,
      p: 4,
    }),
  );

  const template: EventTemplate = {
    kind: KIND_SETUP_ANNOUNCEMENT,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['m', emailHash],
      ['central', massagePomegranateUrl(props.centralUrl)],
      ...props.account.operators.map((op) => [
        'operator',
        massagePomegranateUrl(op.url),
      ]),
      ['threshold', String(props.account.threshold)],
    ],
    content: '',
  };

  const signed = await bunkerSignEvent(props.bunkerData, template);

  await Promise.allSettled(
    bunkerPool.publish(Array.from(SETUP_ANNOUNCEMENT_RELAYS), signed),
  );
}
