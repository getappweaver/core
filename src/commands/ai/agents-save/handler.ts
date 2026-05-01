import { z } from 'zod';

import {
  saveOpencodeAgentsDraft,
  type OpencodeAgentsDraft,
} from '@src/backends/opencode-config';
import {
  getSelectedOpencodeAgent,
  setSelectedOpencodeAgent,
  type CoreDb,
} from '@src/db';

const PermissionActionSchema = z.enum(['allow', 'ask', 'deny']);

const PermissionValueSchema: z.ZodType<
  import('@src/backends/opencode-config').PermissionValue
> = z.lazy(() =>
  z.union([
    PermissionActionSchema,
    z.record(z.string(), PermissionActionSchema),
  ]),
);

const AgentPermissionSchema = z.union([
  PermissionActionSchema,
  z.record(z.string(), PermissionValueSchema),
]);

const OpencodeAgentDraftConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  model: z.string().nullable(),
  color: z.string().nullable(),
  steps: z.number().int().nullable(),
  hidden: z.boolean(),
  disabled: z.boolean(),
  mode: z.string().nullable(),
  permission: AgentPermissionSchema.nullable(),
  systemPrompt: z.string(),
});

const OpencodeAgentsDraftSchema = z.object({
  rootModel: z.string().nullable(),
  agents: z.array(OpencodeAgentDraftConfigSchema),
});

type HandleAiAgentsSaveProps = {
  dmBotRoot: string;
  seenDb: CoreDb;
  draft: unknown;
};

export async function handleAiAgentsSave(
  props: HandleAiAgentsSaveProps,
): Promise<string> {
  const draft = OpencodeAgentsDraftSchema.parse(
    props.draft,
  ) as OpencodeAgentsDraft;

  const selectedBefore = getSelectedOpencodeAgent(props.seenDb);
  const saved = await saveOpencodeAgentsDraft(props.dmBotRoot, draft);

  const stillExists = saved.agents.some(
    (agent) => agent.name === selectedBefore,
  );

  if (!stillExists) {
    setSelectedOpencodeAgent(props.seenDb, saved.agents[0]?.name ?? 'agent');
  }

  return 'Saved OpenCode agents config.';
}
