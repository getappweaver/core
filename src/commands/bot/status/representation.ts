import { z } from 'zod';

import type { CoreUpdateSnapshot } from '@src/core/update-check';
import {
  LintingSchema,
  WorkspaceTargetSchema,
  getLinting,
  getState,
  getWorkspaceTarget,
  STATE_CURRENT_SESSION,
  type CoreDb,
} from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export type StatusProps = {
  botRelayUrls: string[];
  seenDb: CoreDb;
  version: string;
  coreUpdate: CoreUpdateSnapshot | null;
  dmBotRoot: string;
  parentOfBotRoot: string;
  attachUrl: string | null;
};

export const BotStatusDataSchema = z.object({
  backend: z.literal('opencode'),
  version: z.string().min(1),
  coreUpdate: z.any().nullable(),
  linting: LintingSchema,
  workspace: WorkspaceTargetSchema,
  botRelayUrls: z.array(z.string()),
  sessionId: z.string().nullable(),
  opencodeServeUrl: z.string().nullable(),
});

export const BotStatusRepresentationSchema = createRepresentationSchema(
  BotStatusDataSchema,
).extend({ kind: z.literal('bot.status') });
export type BotStatusRepresentation = z.infer<
  typeof BotStatusRepresentationSchema
>;
export type BotStatusData = z.infer<typeof BotStatusDataSchema>;

export function buildBotStatusData(props: StatusProps): BotStatusData {
  const workspace = getWorkspaceTarget(props.seenDb);

  return {
    backend: 'opencode',
    version: props.version,
    coreUpdate: props.coreUpdate,
    linting: getLinting(props.seenDb),
    workspace,
    botRelayUrls: props.botRelayUrls,
    sessionId: getState(props.seenDb, STATE_CURRENT_SESSION),
    opencodeServeUrl: props.attachUrl,
  };
}

export function createBotStatusRepresentation(
  props: StatusProps,
): BotStatusRepresentation {
  return {
    kind: 'bot.status',
    version: 1,
    meta: { command: 'bot', subcommand: 'status' },
    data: buildBotStatusData(props),
  };
}
