import type { SimplePool } from 'nostr-tools';
import type { z } from 'zod';

import type { StoryDefinition } from './story-definition';

export type AiExecuteToolProps<TCall = unknown, TDb = unknown> = {
  alias: string;
  prefix: string;
  call: TCall;
  db: TDb;
  pool?: SimplePool;
  masterPubkey?: string;
  getWotScore?: (pubkey: string, rootPubkey?: string) => number | null;
};

export type AiDefinition<
  TToolCallSchema extends z.ZodType = z.ZodType,
  TCall = unknown,
  TDb = unknown,
  TStoryState = unknown,
> = {
  toolCallSchema: TToolCallSchema;
  skillDescription: string;
  openDb: () => TDb;
  executeTool: (props: AiExecuteToolProps<TCall, TDb>) => Promise<string>;
  agentInstructions?: (alias: string, prefix: string) => string;
  skillNotes?: string;
  skillRules?: string[];
  demoStories?: StoryDefinition<TStoryState>[];
};
