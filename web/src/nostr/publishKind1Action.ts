import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

const NIP65_KIND = 10002;

const OnSuccessCommandSchema = z.object({
  command: z.string().min(1),
  subcommand: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
  options: z.record(z.string(), z.unknown()).default({}),
});

const PublishKind1PayloadSchema = z.object({
  kind: z.number().int().positive().default(1),
  content: z.string().default(''),
  tags: z.array(z.array(z.string())),
  fallbackRelays: z.array(z.string().min(1)).min(1),
  signTitle: z.string().min(1).optional(),
  statusTitle: z.string().min(1).default('Published to Nostr'),
  statusMessage: z.string().optional(),
  onSuccessCommand: OnSuccessCommandSchema,
});

type PublishKind1Deps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
  currentUserPubkey: string | null;
  signEvent: (
    event: EventTemplate,
    options?: { title: string | null },
  ) => Promise<NostrEvent | null>;
  setChromeWeb: (root: WebNodeRoot | null) => void;
  setChromeText: (text: string | null) => void;
  setChromeError: (text: string | null) => void;
  setChromeLoading: (loading: boolean) => void;
  appendSystemMessage: (text: string) => void;
};

export type PublishKind1Result = {
  onSuccessCommand: {
    command: string;
    subcommand: string;
    arguments: Record<string, unknown>;
    options: Record<string, unknown>;
  };
  nostrUrl: string;
};

function statusRoot(title: string, body: string): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'publish' },
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
        {
          type: 'element',
          tag: 'text',
          props: { whiteSpace: 'pre-wrap' },
          children: [{ type: 'text', value: body }],
        },
      ],
    },
  };
}

function eventRelayTags(event: NostrEvent): string[] {
  return event.tags
    .filter((tag) => tag[0] === 'r' && typeof tag[1] === 'string')
    .filter((tag) => tag[2] === undefined || tag[2] === 'write')
    .map((tag) => tag[1]!)
    .filter((relay) => relay.startsWith('wss://'));
}

async function fetchUserWriteRelays(
  pubkey: string,
  fallbackRelays: string[],
): Promise<string[]> {
  const pool = new SimplePool();

  try {
    const event = await pool.get(fallbackRelays, {
      kinds: [NIP65_KIND],
      authors: [pubkey],
    });

    if (!event) {
      return fallbackRelays;
    }

    const writeRelays = eventRelayTags(event);

    return writeRelays.length > 0 ? writeRelays : fallbackRelays;
  } finally {
    pool.close(fallbackRelays);
  }
}

function publishEvent(relays: string[], event: NostrEvent): Promise<string[]> {
  const pool = new SimplePool();

  return Promise.allSettled(pool.publish(relays, event))
    .then((results) =>
      results
        .map((result, index) =>
          result.status === 'fulfilled' ? relays[index] : null,
        )
        .filter((relay): relay is string => relay !== null),
    )
    .finally(() => {
      pool.close(relays);
    });
}

export async function handleNostrPublishKind1Action({
  action,
  currentUserPubkey,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: PublishKind1Deps): Promise<PublishKind1Result | null> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = PublishKind1PayloadSchema.parse(action.payload ?? {});

    if (!currentUserPubkey) {
      throw new Error('Connect or unlock a Nostr signer to publish.');
    }

    const template: EventTemplate = {
      kind: payload.kind,
      created_at: Math.floor(Date.now() / 1000),
      content: payload.content,
      tags: payload.tags,
    };

    const signed = await signEvent(template, {
      title: payload.signTitle ?? 'Sign event',
    });

    if (!signed) {
      throw new Error('Connect or unlock a Nostr signer to publish.');
    }

    const relays = await fetchUserWriteRelays(
      signed.pubkey,
      payload.fallbackRelays,
    );

    const acceptedRelays = await publishEvent(relays, signed);

    if (acceptedRelays.length === 0) {
      throw new Error('Publish failed on all NIP-65 write relays.');
    }

    const nostrUrl = `nostr://${nip19.neventEncode({
      id: signed.id,
      relays: acceptedRelays.slice(0, 4),
    })}`;

    setChromeWeb(
      statusRoot(
        payload.statusTitle,
        `${payload.statusMessage ? `${payload.statusMessage}\n\n` : ''}${nostrUrl}\n\nRelays:\n${acceptedRelays.join('\n')}`,
      ),
    );

    appendSystemMessage(payload.statusTitle);

    return {
      onSuccessCommand: payload.onSuccessCommand,
      nostrUrl,
    };
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));

    return null;
  } finally {
    setChromeLoading(false);
  }
}
