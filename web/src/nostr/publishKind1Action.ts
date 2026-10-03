import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { PROFILE_RELAYS_FOR_QUERY } from '@src/nostr/nip65';
import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';

import type { ChromeModalState } from '../chrome/types';

import {
  fetchUserWriteRelays,
  publishEventDetailed,
  type RelayOutcome,
} from './relayLists';

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
  fallbackRelays: z
    .array(z.string().min(1))
    .default([...PROFILE_RELAYS_FOR_QUERY]),
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
  setChromeModal: (modal: ChromeModalState | null) => void;
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

function statusRoot({
  title,
  message,
  nostrUrl,
  outcomes,
}: {
  title: string;
  message?: string;
  nostrUrl: string;
  outcomes: RelayOutcome[];
}): WebNodeRoot {
  const children: WebNode[] = [
    {
      type: 'element',
      tag: 'text',
      props: { weight: 'bold', size: 'lg' },
      children: [{ type: 'text', value: title }],
    },
  ];

  if (message) {
    children.push({
      type: 'element',
      tag: 'text',
      props: { tone: 'muted', size: 'sm' },
      children: [{ type: 'text', value: message }],
    });
  }

  children.push({
    type: 'element',
    tag: 'text',
    props: { whiteSpace: 'pre-wrap' },
    children: [{ type: 'text', value: nostrUrl }],
  });

  const acceptedCount = outcomes.filter((outcome) => outcome.success).length;
  const totalCount = outcomes.length;

  children.push({
    type: 'element',
    tag: 'text',
    props: { weight: 'bold' },
    children: [
      {
        type: 'text',
        value: `Relays (${acceptedCount}/${totalCount} accepted):`,
      },
    ],
  });

  const relayItems: WebNode[] = outcomes.map((outcome) => ({
    type: 'element',
    tag: 'row',
    props: { gap: 'xs' },
    children: [
      {
        type: 'element',
        tag: 'text',
        props: {
          tone: outcome.success ? 'success' : 'danger',
          weight: 'bold',
        },
        children: [{ type: 'text', value: outcome.success ? '✓' : '✗' }],
      },
      {
        type: 'element',
        tag: 'text',
        props: {
          tone: outcome.success ? 'default' : 'muted',
          whiteSpace: 'pre-wrap',
        },
        children: [
          {
            type: 'text',
            value: `${outcome.relay}${!outcome.success && outcome.reason ? ` (${outcome.reason})` : ''}`,
          },
        ],
      },
    ],
  }));

  children.push({
    type: 'element',
    tag: 'stack',
    props: { gap: 'xs' },
    children: relayItems,
  });

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'publish' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm' },
      children,
    },
  };
}

export async function handleNostrPublishKind1Action({
  action,
  currentUserPubkey,
  signEvent,
  setChromeModal,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: PublishKind1Deps): Promise<PublishKind1Result | null> {
  const payload = PublishKind1PayloadSchema.parse(action.payload ?? {});

  setChromeModal({
    command: 'nostr',
    subcommand: 'publish',
    title: payload.statusTitle,
  });

  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    console.info('[nostr.publishKind1] Publish started', {
      kind: payload.kind,
      contentLength: payload.content.length,
      tagCount: payload.tags.length,
      hasCurrentUser: currentUserPubkey !== null,
      fallbackRelays: payload.fallbackRelays,
    });

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

    console.info('[nostr.publishKind1] Event signed', {
      eventId: signed.id,
      pubkey: signed.pubkey,
    });

    const relays = await fetchUserWriteRelays({
      pubkey: signed.pubkey,
      fallbackRelays: payload.fallbackRelays,
    });

    console.info('[nostr.publishKind1] Resolved write relays', {
      eventId: signed.id,
      relays,
    });

    const { acceptedRelays, rejectedRelays, outcomes } =
      await publishEventDetailed(relays, signed);

    if (acceptedRelays.length === 0) {
      const failureDetails = rejectedRelays
        .map((r) => `${r.relay}: ${r.reason}`)
        .join('; ');

      throw new Error(
        `Publish failed on all relays.${failureDetails ? ` (${failureDetails})` : ''}`,
      );
    }

    const nostrUrl = `nostr://${nip19.neventEncode({
      id: signed.id,
      relays: acceptedRelays.slice(0, 4),
    })}`;

    setChromeWeb(
      statusRoot({
        title: payload.statusTitle,
        message: payload.statusMessage,
        nostrUrl,
        outcomes,
      }),
    );

    appendSystemMessage(payload.statusTitle);

    console.info('[nostr.publishKind1] Publish succeeded', {
      eventId: signed.id,
      nostrUrl,
      acceptedRelays,
      rejectedRelays,
    });

    return {
      onSuccessCommand: payload.onSuccessCommand,
      nostrUrl,
    };
  } catch (error) {
    console.error('[nostr.publishKind1] Publish failed', error);
    setChromeError(error instanceof Error ? error.message : String(error));

    return null;
  } finally {
    setChromeLoading(false);
  }
}
