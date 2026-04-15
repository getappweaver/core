import { z } from 'zod';

import { WorkspaceTargetSchema } from '@src/db';
import { createRepresentationSchema } from '@src/system/representation';

export const BotWorkspaceDataSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('query'),
    target: WorkspaceTargetSchema,
    cwd: z.string().min(1),
    usageOpts: z.string().min(1),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('invalid-usage'),
    usageOpts: z.string().min(1),
    prefix: z.string().min(1),
  }),
  z.object({
    view: z.literal('unchanged'),
    target: WorkspaceTargetSchema,
    cwd: z.string().min(1),
  }),
  z.object({
    view: z.literal('switched'),
    previousTarget: WorkspaceTargetSchema,
    nextTarget: WorkspaceTargetSchema,
    cwd: z.string().min(1),
    newSessionId: z.string().min(1),
  }),
  z.object({
    view: z.literal('switched-session-failed'),
    nextTarget: WorkspaceTargetSchema,
    errorMessage: z.string(),
  }),
]);

export const BotWorkspaceRepresentationSchema = createRepresentationSchema(
  BotWorkspaceDataSchema,
).extend({
  kind: z.literal('bot.workspace'),
});

export type BotWorkspaceRepresentation = z.infer<
  typeof BotWorkspaceRepresentationSchema
>;
