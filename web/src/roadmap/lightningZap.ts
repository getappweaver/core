import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import { PROFILE_RELAYS_FOR_QUERY } from '@src/nostr/nip65';
import type { WebAction } from '@src/web/ui-schema';

const ISSUE_KIND = 1621;
const REPO_KIND = 30617;
const PROFILE_KIND = 0;
const RELAY_TIMEOUT_MS = 12_000;
const HTTP_TIMEOUT_MS = 20_000;

const LOG_PREFIX = '[roadmap.lightningZap]';

const LightningZapPayloadSchema = z.object({
  issueId: z.string().min(1),
  title: z.string().min(1),
  relay: z.string().min(1),
  relays: z.array(z.string()).optional(),
  amount: z.string().min(1),
  comment: z.string().optional(),
  anonymous: z.string().optional(),
});

const LnUrlpResponseSchema = z.object({
  callback: z.string().url(),
  nostrPubkey: z.string().regex(/^[0-9a-f]{64}$/i),
  allowsNostr: z.boolean(),
  minSendable: z.number(),
  maxSendable: z.number(),
  tag: z.literal('payRequest'),
});

type LightningProfile = {
  lud06?: string;
  lud16?: string;
};

type LightningZapDeps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
  signEvent: (event: EventTemplate) => Promise<NostrEvent | null>;
  setChromeText: (text: string | null) => void;
  setChromeError: (text: string | null) => void;
  setChromeLoading: (loading: boolean) => void;
  requestPayment: (payload: {
    invoice: string;
    amount: string;
    title: string;
    recipient: string;
    issueId: string;
    recipientPubkey: string;
    receiptPubkey: string;
    zapRequestId: string;
    relays: string;
  }) => void;
};

type SignZapRequestProps = {
  anonymous: boolean;
  signEvent: (event: EventTemplate) => Promise<NostrEvent | null>;
  zapTemplate: EventTemplate;
};

type FetchInvoiceProps = {
  callback: string;
  amountMsats: number;
  zapRequest: NostrEvent;
  comment: string;
};

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: number | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

async function fetchJson(url: string, stage: string): Promise<unknown> {
  const response = await withTimeout(
    fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) }),
    HTTP_TIMEOUT_MS,
    `${stage} timed out.`,
  );

  if (!response.ok) {
    throw new Error(`${stage} failed with HTTP ${response.status}.`);
  }

  return withTimeout(
    response.json(),
    HTTP_TIMEOUT_MS,
    `${stage} returned an incomplete response.`,
  );
}

function tagValue(event: NostrEvent, name: string): string {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? '';
}

function parseRepoOwner(repoAddress: string): string {
  const [kind, pubkey] = repoAddress.split(':');

  return kind === String(REPO_KIND) ? (pubkey ?? '') : '';
}

function parseAmountSats(value: string): number {
  const normalized = value.trim().toLowerCase();

  if (normalized.endsWith('k')) {
    return Math.floor(Number(normalized.slice(0, -1)) * 1000);
  }

  return Math.floor(Number(normalized));
}

function lightningAddressUrl(lud16: string): string | null {
  const [name, domain] = lud16.split('@');

  if (!name || !domain) {
    return null;
  }

  return `https://${domain}/.well-known/lnurlp/${name}`;
}

function bech32DecodeWords(value: string): number[] | null {
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const lowered = value.toLowerCase();
  const separatorIndex = lowered.lastIndexOf('1');

  if (separatorIndex <= 0) {
    return null;
  }

  const data = lowered.slice(separatorIndex + 1);

  if (data.length <= 6) {
    return null;
  }

  const words = [...data].map((char) => charset.indexOf(char));

  if (words.some((word) => word < 0)) {
    return null;
  }

  return words.slice(0, -6);
}

function convertBits({
  data,
  fromBits,
  toBits,
}: {
  data: number[];
  fromBits: number;
  toBits: number;
}): number[] | null {
  let accumulator = 0;
  let bits = 0;
  const maxValue = (1 << toBits) - 1;
  const result: number[] = [];

  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) {
      return null;
    }

    accumulator = (accumulator << fromBits) | value;
    bits += fromBits;

    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }

  return result;
}

function lnurlFromLud06(lud06: string): string | null {
  const words = bech32DecodeWords(lud06.trim());

  if (!words) {
    return null;
  }

  const bytes = convertBits({ data: words, fromBits: 5, toBits: 8 });

  if (!bytes) {
    return null;
  }

  const decoded = new TextDecoder()
    .decode(new Uint8Array(bytes))
    .replace(/\0+$/, '');

  return decoded.startsWith('https://') || decoded.startsWith('http://')
    ? decoded
    : null;
}

function lightningProfileUrl(profile: LightningProfile | null): string | null {
  if (profile?.lud16) {
    return lightningAddressUrl(profile.lud16);
  }

  if (profile?.lud06) {
    return lnurlFromLud06(profile.lud06);
  }

  return null;
}

function parseProfile(content: string | undefined): LightningProfile | null {
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as LightningProfile;
  } catch {
    return null;
  }
}

async function signZapRequest({
  anonymous,
  signEvent,
  zapTemplate,
}: SignZapRequestProps): Promise<NostrEvent | null> {
  if (!anonymous) {
    return signEvent(zapTemplate);
  }

  return finalizeEvent(zapTemplate, generateSecretKey());
}

async function fetchInvoice({
  callback,
  amountMsats,
  zapRequest,
  comment,
}: FetchInvoiceProps): Promise<string> {
  const url = new URL(callback);
  url.searchParams.set('amount', String(amountMsats));
  url.searchParams.set('nostr', JSON.stringify(zapRequest));
  url.searchParams.set('comment', comment);

  const json = (await fetchJson(
    url.toString(),
    'Lightning invoice creation',
  )) as {
    pr?: string;
    status?: string;
    reason?: string;
  };

  if (json.status === 'ERROR' || !json.pr) {
    throw new Error(json.reason || 'Lightning invoice could not be created.');
  }

  return json.pr;
}

export async function handleRoadmapLightningZap({
  action,
  signEvent,
  setChromeText,
  setChromeError,
  setChromeLoading,
  requestPayment,
}: LightningZapDeps): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = LightningZapPayloadSchema.parse(action.payload ?? {});
    const amountSats = parseAmountSats(payload.amount);

    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      throw new Error('Enter a positive amount in sats.');
    }

    setChromeText('Loading Lightning recipient...');

    const pool = new SimplePool();

    const relays = Array.from(
      new Set([payload.relay, ...(payload.relays ?? [])]),
    );

    if (relays.length === 0) {
      throw new Error('No relays available to load roadmap issue data.');
    }

    let issue: NostrEvent | null = null;
    let profileEvent: NostrEvent | null = null;
    let repoOwner = '';

    console.info(LOG_PREFIX, 'query issue', {
      issueId: payload.issueId,
      kinds: [ISSUE_KIND],
      relays,
    });

    try {
      issue = await withTimeout(
        pool.get(relays, {
          ids: [payload.issueId],
          kinds: [ISSUE_KIND],
        }),
        RELAY_TIMEOUT_MS,
        'Roadmap issue lookup timed out.',
      );

      console.info(LOG_PREFIX, 'issue result', {
        found: Boolean(issue),
        event: issue,
      });

      if (!issue) {
        throw new Error(
          `Issue event could not be loaded from relays: ${relays.join(', ')}`,
        );
      }

      repoOwner = parseRepoOwner(tagValue(issue, 'a'));

      console.info(LOG_PREFIX, 'repo owner from issue a-tag', {
        aTag: tagValue(issue, 'a'),
        repoOwner,
      });

      if (!repoOwner) {
        throw new Error('Issue is missing a NIP-34 repository owner.');
      }

      console.info(LOG_PREFIX, 'query profile', {
        authors: [repoOwner],
        kinds: [PROFILE_KIND],
        relays,
      });

      profileEvent = await withTimeout(
        pool.get(PROFILE_RELAYS_FOR_QUERY as string[], {
          kinds: [PROFILE_KIND],
          authors: [repoOwner],
        }),
        RELAY_TIMEOUT_MS,
        'Lightning profile lookup timed out.',
      );

      console.info(LOG_PREFIX, 'profile result', {
        found: Boolean(profileEvent),
        event: profileEvent,
      });
    } finally {
      pool.close(Array.from(new Set([...relays, ...PROFILE_RELAYS_FOR_QUERY])));
    }

    if (!profileEvent) {
      throw new Error(
        `Repository author profile could not be loaded for ${repoOwner}`,
      );
    }

    const profile = parseProfile(profileEvent.content);

    console.info(LOG_PREFIX, 'parsed profile lightning fields', {
      profile,
      lud06: profile?.lud06 ?? null,
      lud16: profile?.lud16 ?? null,
    });

    const lnurl = lightningProfileUrl(profile);

    if (!lnurl) {
      throw new Error(
        'Repository author does not have a supported Lightning address (lud16 or lud06).',
      );
    }

    const lnurlData = LnUrlpResponseSchema.parse(
      await fetchJson(lnurl, 'Lightning address lookup'),
    );

    if (!lnurlData.allowsNostr) {
      throw new Error('Lightning address does not support Nostr zaps.');
    }

    const amountMsats = amountSats * 1000;

    if (
      amountMsats < lnurlData.minSendable ||
      amountMsats > lnurlData.maxSendable
    ) {
      throw new Error(
        `Amount must be between ${Math.ceil(lnurlData.minSendable / 1000)} and ${Math.floor(lnurlData.maxSendable / 1000)} sats.`,
      );
    }

    const comment = payload.comment?.trim() ?? '';
    const anonymous = payload.anonymous === 'on';

    const zapRelays = Array.from(
      new Set([payload.relay, ...(payload.relays ?? [])]),
    );

    const zapTemplate: EventTemplate = {
      kind: 9734,
      created_at: Math.floor(Date.now() / 1000),
      content: comment,
      tags: [
        ['e', issue.id, payload.relay],
        ['p', repoOwner],
        ['amount', String(amountMsats)],
        ['relays', ...zapRelays],
      ],
    };

    setChromeText('Approve the Nostr zap request...');

    const zapRequest = await signZapRequest({
      anonymous,
      signEvent,
      zapTemplate,
    });

    if (!zapRequest) {
      throw new Error('Could not sign zap request.');
    }

    setChromeText('Creating Lightning invoice...');

    const invoice = await fetchInvoice({
      callback: lnurlData.callback,
      amountMsats,
      zapRequest,
      comment,
    });

    requestPayment({
      invoice,
      amount: String(amountSats),
      title: payload.title,
      recipient: profile?.lud16 || profile?.lud06 || lnurl,
      issueId: issue.id,
      recipientPubkey: repoOwner,
      receiptPubkey: lnurlData.nostrPubkey,
      zapRequestId: zapRequest.id,
      relays: zapRelays.join(','),
    });
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeText(null);
    setChromeLoading(false);
  }
}
