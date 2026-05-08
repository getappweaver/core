import type { EventTemplate, NostrEvent, VerifiedEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import type { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import { getOutputString } from '@src/backends/types';
import type { RunAgentFn, SendReplyFn } from '@src/core/plugin';

import type { CoreDb } from '../db';
import { PROMPT_SESSION_EXIT } from '../prompt-session';

import {
  bunkerNip44Decrypt,
  bunkerNip44Encrypt,
  bunkerSignEvent,
  connectBunker,
} from './bunker';
import {
  getConnection,
  listConnections,
  saveConnection,
  type ConnectionRow,
} from './connections';

type PromptFn = (message: string) => Promise<string>;

const EditableEventTemplateSchema = z.object({
  kind: z.number().int(),
  created_at: z.number().int(),
  content: z.string(),
  tags: z.array(z.array(z.string())),
});

export type SignWithBunkerInteractiveProps = {
  db: CoreDb;
  pool: SimplePool;
  eventTemplate: EventTemplate;
  sendReply: SendReplyFn;
  promptFn: PromptFn;
  runAgent: RunAgentFn | null;
  bunkerName?: string;
};

function formatPubkey(hex: string): string {
  try {
    return `${nip19.npubEncode(hex)} (${hex})`;
  } catch {
    return hex;
  }
}

async function askPrompt(promptFn: PromptFn, message: string): Promise<string> {
  const answer = (await promptFn(message)).trim();

  if (answer === PROMPT_SESSION_EXIT) {
    throw new Error('Bunker signing cancelled.');
  }

  return answer;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const withoutStart = trimmed.replace(/^```(?:json)?\s*/i, '');

  return withoutStart.replace(/\s*```$/, '').trim();
}

function formatEventTemplate(eventTemplate: EventTemplate): string {
  return `\`\`\`json
${JSON.stringify(eventTemplate, null, 2)}
\`\`\``;
}

async function editEventTemplateWithAi(props: {
  eventTemplate: EventTemplate;
  instruction: string;
  runAgent: RunAgentFn;
}): Promise<EventTemplate> {
  const { eventTemplate, instruction, runAgent } = props;

  const result =
    await runAgent(`You are editing a Nostr unsigned event template JSON.

Current event template:
${JSON.stringify(eventTemplate, null, 2)}

User instruction:
${instruction}

Return only valid JSON for the full edited event template. Do not use markdown fences. Preserve the existing kind unless the user explicitly asked to change it.`);

  const raw = stripCodeFence(getOutputString(result));

  const parsed = EditableEventTemplateSchema.parse({
    ...eventTemplate,
    ...JSON.parse(raw),
  });

  return parsed;
}

function formatConnectionChoice(
  connection: ConnectionRow,
  index: number,
): string {
  return `${index + 1}. ${connection.name}
User pubkey: ${formatPubkey(connection.data.userPubkey)}
Remote signer: ${formatPubkey(connection.data.remoteSignerPubkey)}
Relays: ${connection.data.relays.join(', ')}`;
}

async function pickConnection(props: {
  db: CoreDb;
  pool: SimplePool;
  connections: ConnectionRow[];
  sendReply: SendReplyFn;
  promptFn: PromptFn;
}): Promise<ConnectionRow> {
  const { db, pool, connections, sendReply, promptFn } = props;

  await sendReply(
    `Choose bunker signer:\n\n${connections
      .map((connection, index) => formatConnectionChoice(connection, index))
      .join('\n\n')}\n\n${connections.length + 1}. Add new bunker connection`,
  );

  while (true) {
    const answer = await askPrompt(
      promptFn,
      'Select bunker number or type quit.',
    );

    const lowered = answer.toLowerCase();

    if (lowered === 'q' || lowered === 'quit') {
      throw new Error('Bunker signing cancelled.');
    }

    const selected = Number(answer);

    if (
      Number.isInteger(selected) &&
      selected >= 1 &&
      selected <= connections.length + 1
    ) {
      if (selected === connections.length + 1) {
        return connectAndMaybeSaveBunker({ db, pool, sendReply, promptFn });
      }

      return connections[selected - 1];
    }

    await sendReply('Invalid selection.');
  }
}

async function connectAndMaybeSaveBunker(props: {
  db: CoreDb;
  pool: SimplePool;
  sendReply: SendReplyFn;
  promptFn: PromptFn;
}): Promise<ConnectionRow> {
  const { db, pool, sendReply, promptFn } = props;
  const bunkerUrl = await askPrompt(promptFn, 'Bunker URL (bunker://...):');

  if (!bunkerUrl) {
    throw new Error('No bunker URL provided.');
  }

  await sendReply('Connecting to bunker...');

  const data = await connectBunker(pool, bunkerUrl);

  await sendReply(`Connected bunker signer: ${formatPubkey(data.userPubkey)}`);

  const saveName = await askPrompt(
    promptFn,
    'Save this bunker connection? Enter a name, or leave empty to use once.',
  );

  const name = saveName || `temporary-${Date.now()}`;

  if (saveName) {
    saveConnection(db, saveName, 'bunker', data);
    await sendReply(`Saved bunker connection as "${saveName}".`);
  }

  return {
    name,
    method: 'bunker',
    data,
    created_at: Date.now(),
  };
}

async function resolveBunkerConnection(props: {
  db: CoreDb;
  pool: SimplePool;
  sendReply: SendReplyFn;
  promptFn: PromptFn;
  bunkerName?: string;
}): Promise<ConnectionRow> {
  const { db, pool, sendReply, promptFn, bunkerName } = props;
  const selectedByName = bunkerName ? getConnection(db, bunkerName) : null;

  if (bunkerName && !selectedByName) {
    throw new Error(`No bunker connection named "${bunkerName}".`);
  }

  const availableConnections = selectedByName
    ? [selectedByName]
    : listConnections(db);

  if (availableConnections.length === 0) {
    return connectAndMaybeSaveBunker({ db, pool, sendReply, promptFn });
  }

  const selected = selectedByName
    ? selectedByName
    : await pickConnection({
        db,
        pool,
        connections: availableConnections,
        sendReply,
        promptFn,
      });

  if (selectedByName) {
    await sendReply(
      `Using bunker signer:\n\n${formatConnectionChoice(selectedByName, 0)}`,
    );
  }

  return selected;
}

export async function signWithBunkerInteractive({
  db,
  pool,
  eventTemplate,
  sendReply,
  promptFn,
  runAgent,
  bunkerName,
}: SignWithBunkerInteractiveProps): Promise<NostrEvent> {
  let currentTemplate = eventTemplate;

  while (true) {
    await sendReply(
      `Plugin requested bunker signing for this event template:\n\n${formatEventTemplate(currentTemplate)}`,
    );

    const answer = await askPrompt(
      promptFn,
      'Continue, edit with AI, or quit? [c/e <prompt>/q]',
    );

    const lowered = answer.toLowerCase();

    if (lowered === 'c' || lowered === 'continue') {
      break;
    }

    if (lowered === 'q' || lowered === 'quit') {
      throw new Error('Bunker signing cancelled.');
    }

    if (lowered.startsWith('e ') || lowered === 'e') {
      if (!runAgent) {
        await sendReply(
          'AI editing requires an agent backend for this session.',
        );

        continue;
      }

      const instruction = answer.slice(1).trim();

      if (!instruction) {
        await sendReply('Provide an edit instruction after `e`.');

        continue;
      }

      currentTemplate = await editEventTemplateWithAi({
        eventTemplate: currentTemplate,
        instruction,
        runAgent,
      });

      continue;
    }

    await sendReply('Invalid choice.');
  }

  const selected = await resolveBunkerConnection({
    db,
    pool,
    sendReply,
    promptFn,
    bunkerName,
  });

  return bunkerSignEvent(pool, selected.data, currentTemplate);
}

export async function signEncryptedSelfEventWithBunkerInteractive(props: {
  db: CoreDb;
  pool: SimplePool;
  ownerPubkey: string;
  kind: number;
  plaintext: string;
  tags: string[][];
  sendReply: SendReplyFn;
  promptFn: PromptFn;
  bunkerName?: string;
}): Promise<VerifiedEvent> {
  const selected = await resolveBunkerConnection({
    db: props.db,
    pool: props.pool,
    sendReply: props.sendReply,
    promptFn: props.promptFn,
    bunkerName: props.bunkerName,
  });

  if (selected.data.userPubkey !== props.ownerPubkey) {
    throw new Error(
      `Selected bunker signs for ${selected.data.userPubkey}, not wallet owner ${props.ownerPubkey}.`,
    );
  }

  const encrypted = await bunkerNip44Encrypt({
    pool: props.pool,
    data: selected.data,
    pubkey: props.ownerPubkey,
    plaintext: props.plaintext,
  });

  return bunkerSignEvent(props.pool, selected.data, {
    kind: props.kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: props.tags,
    content: encrypted,
  });
}

export async function decryptSelfContentWithBunkerInteractive(props: {
  db: CoreDb;
  pool: SimplePool;
  ownerPubkey: string;
  ciphertext: string;
  sendReply: SendReplyFn;
  promptFn: PromptFn;
  bunkerName?: string;
}): Promise<string> {
  const selected = await resolveBunkerConnection({
    db: props.db,
    pool: props.pool,
    sendReply: props.sendReply,
    promptFn: props.promptFn,
    bunkerName: props.bunkerName,
  });

  if (selected.data.userPubkey !== props.ownerPubkey) {
    throw new Error(
      `Selected bunker signs for ${selected.data.userPubkey}, not wallet owner ${props.ownerPubkey}.`,
    );
  }

  return bunkerNip44Decrypt({
    pool: props.pool,
    data: selected.data,
    pubkey: props.ownerPubkey,
    ciphertext: props.ciphertext,
  });
}
