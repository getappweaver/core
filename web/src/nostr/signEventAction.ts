import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { z } from 'zod';

import type { WebAction, WebNode, WebNodeRoot } from '@src/web/ui-schema';

import type { ChromeModalState } from '../chrome/types';

const OnSuccessCommandSchema = z.object({
  command: z.string().min(1),
  subcommand: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
  options: z.record(z.string(), z.unknown()).default({}),
});

export const SignEventPayloadSchema = z.object({
  kind: z.number().int().positive().default(1),
  content: z.string().default(''),
  tags: z.array(z.array(z.string())).default([]),
  date: z.string().optional(),
  time: z.string().optional(),
  tz: z.string().optional(),
  runAt: z.string().optional(),
  signTitle: z.string().min(1).optional(),
  statusTitle: z.string().min(1).default('Event signed'),
  statusMessage: z.string().optional(),
  onSuccessCommand: OnSuccessCommandSchema,
});

export type SignEventPayload = z.infer<typeof SignEventPayloadSchema>;

type SignEventDeps = {
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

export type SignEventResult = {
  onSuccessCommand: {
    command: string;
    subcommand: string;
    arguments: Record<string, unknown>;
    options: Record<string, unknown>;
  };
  signedEvent: string;
  runAt: string;
  date?: string;
  time?: string;
  tz?: string;
};

function statusRoot({
  title,
  message,
}: {
  title: string;
  message?: string;
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

  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'nostr', subcommand: 'sign' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm' },
      children,
    },
  };
}

export async function handleNostrSignEventAction({
  action,
  currentUserPubkey,
  signEvent,
  setChromeModal,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: SignEventDeps): Promise<SignEventResult | null> {
  const payload = SignEventPayloadSchema.parse(action.payload ?? {});

  setChromeModal({
    command: 'nostr',
    subcommand: 'sign',
    title: payload.statusTitle,
  });

  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    if (!currentUserPubkey) {
      throw new Error('Connect or unlock a Nostr signer to proceed.');
    }

    let targetDate: Date;

    if (payload.runAt) {
      targetDate = new Date(payload.runAt);
    } else if (payload.date && payload.time) {
      targetDate = new Date(`${payload.date}T${payload.time}`);
    } else {
      throw new Error('Date and time are required for scheduling.');
    }

    if (Number.isNaN(targetDate.getTime())) {
      throw new Error('Invalid scheduled date or time.');
    }

    if (targetDate.getTime() <= Date.now()) {
      throw new Error('Scheduled time must be in the future.');
    }

    const template: EventTemplate = {
      kind: payload.kind,
      created_at: Math.floor(targetDate.getTime() / 1000),
      content: payload.content,
      tags: payload.tags,
    };

    const signed = await signEvent(template, {
      title: payload.signTitle ?? 'Sign Event: Schedule publishing',
    });

    if (!signed) {
      throw new Error('Connect or unlock a Nostr signer to proceed.');
    }

    setChromeWeb(
      statusRoot({
        title: payload.statusTitle,
        message: payload.statusMessage ?? 'Event signed successfully.',
      }),
    );

    appendSystemMessage(payload.statusTitle);

    return {
      onSuccessCommand: payload.onSuccessCommand,
      signedEvent: JSON.stringify(signed),
      runAt: targetDate.toISOString(),
      date: payload.date,
      time: payload.time,
      tz: payload.tz,
    };
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));

    return null;
  } finally {
    setChromeLoading(false);
  }
}
