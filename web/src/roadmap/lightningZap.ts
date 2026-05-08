import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import QRCode from 'qrcode';
import { z } from 'zod';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

const ISSUE_KIND = 1621;
const REPO_KIND = 30617;
const PROFILE_KIND = 0;

const DEFAULT_ZAP_RELAYS = [
  'wss://relay.damus.io/',
  'wss://nos.lol/',
  'wss://relay.primal.net/',
  'wss://relay.nostr.band/',
];

const LOG_PREFIX = '[roadmap.lightningZap]';

const LightningZapPayloadSchema = z.object({
  issueId: z.string().min(1),
  title: z.string().min(1),
  relay: z.string().min(1),
  amount: z.string().min(1),
  comment: z.string().optional(),
  anonymous: z.string().optional(),
});

const LnUrlpResponseSchema = z.object({
  callback: z.string().url(),
  nostrPubkey: z.string().min(1),
  allowsNostr: z.boolean(),
  minSendable: z.number(),
  maxSendable: z.number(),
  tag: z.literal('payRequest'),
});

type LightningProfile = {
  lud16?: string;
};

type LightningZapDeps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
  signEvent: (event: EventTemplate) => Promise<NostrEvent | null>;
  setChromeWeb: (root: WebNodeRoot | null) => void;
  setChromeText: (text: string | null) => void;
  setChromeError: (text: string | null) => void;
  setChromeLoading: (loading: boolean) => void;
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

declare global {
  interface Window {
    webln?: {
      enable(): Promise<void>;
      isEnabled?(): Promise<boolean>;
      sendPayment(invoice: string): Promise<unknown>;
    };
  }
}

function text(value: string): WebNodeRoot['tree'] {
  return { type: 'element', tag: 'text', children: [{ type: 'text', value }] };
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

  const response = await fetch(url);

  const json = (await response.json()) as {
    pr?: string;
    status?: string;
    reason?: string;
  };

  if (json.status === 'ERROR' || !json.pr) {
    throw new Error(json.reason || 'Lightning invoice could not be created.');
  }

  return json.pr;
}

function statusRoot(title: string, body: string): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'fund' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'md' },
      children: [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold' },
          children: [{ type: 'text', value: title }],
        },
        text(body),
      ],
    },
  };
}

async function invoiceRoot(invoice: string): Promise<WebNodeRoot> {
  const dataUrl = await QRCode.toDataURL(invoice, { margin: 1, width: 280 });

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'fund' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'md' },
      children: [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold' },
          children: [{ type: 'text', value: 'Pay Lightning invoice' }],
        },
        {
          type: 'element',
          tag: 'image',
          props: { src: dataUrl, alt: 'Lightning invoice QR code' },
        },
        {
          type: 'element',
          tag: 'text',
          props: { whiteSpace: 'pre-wrap' },
          children: [{ type: 'text', value: invoice }],
        },
      ],
    },
  };
}

export async function handleRoadmapLightningZap({
  action,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
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

    const pool = new SimplePool();
    const relays = Array.from(new Set([payload.relay, ...DEFAULT_ZAP_RELAYS]));
    let issue: NostrEvent | null = null;
    let profileEvent: NostrEvent | null = null;
    let repoOwner = '';

    console.info(LOG_PREFIX, 'query issue', {
      issueId: payload.issueId,
      kinds: [ISSUE_KIND],
      relays,
    });

    try {
      issue = await pool.get(relays, {
        ids: [payload.issueId],
        kinds: [ISSUE_KIND],
      });

      console.info(LOG_PREFIX, 'issue result', {
        found: Boolean(issue),
        event: issue,
      });

      if (!issue) {
        throw new Error('Issue event could not be loaded.');
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

      profileEvent = await pool.get(relays, {
        kinds: [PROFILE_KIND],
        authors: [repoOwner],
      });

      console.info(LOG_PREFIX, 'profile result', {
        found: Boolean(profileEvent),
        event: profileEvent,
      });
    } finally {
      pool.close(relays);
    }

    const profile = parseProfile(profileEvent?.content);

    console.info(LOG_PREFIX, 'parsed profile lightning fields', {
      profile,
      lud16: profile?.lud16 ?? null,
    });

    const lnurl = profile?.lud16 ? lightningAddressUrl(profile.lud16) : null;

    if (!lnurl) {
      throw new Error(
        'Repository author does not have a lud16 Lightning address.',
      );
    }

    const lnurlData = LnUrlpResponseSchema.parse(
      await (await fetch(lnurl)).json(),
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
      new Set([payload.relay, ...DEFAULT_ZAP_RELAYS]),
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

    const zapRequest = await signZapRequest({
      anonymous,
      signEvent,
      zapTemplate,
    });

    if (!zapRequest) {
      throw new Error('Could not sign zap request.');
    }

    const invoice = await fetchInvoice({
      callback: lnurlData.callback,
      amountMsats,
      zapRequest,
      comment,
    });

    try {
      if (!window.webln) {
        throw new Error('WebLN not available.');
      }

      if (window.webln.isEnabled) {
        const enabled = await window.webln.isEnabled();

        if (!enabled) {
          await window.webln.enable();
        }
      } else {
        await window.webln.enable();
      }

      await window.webln.sendPayment(invoice);

      setChromeWeb(
        statusRoot(
          'Payment sent',
          'Waiting for AppWeaver relay verification...',
        ),
      );
    } catch {
      setChromeWeb(await invoiceRoot(invoice));
    }
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
