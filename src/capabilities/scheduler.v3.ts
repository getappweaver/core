/** Scheduler v3 adds per-job model selection and opt-in session continuity. */
import { z } from 'zod';

import { WorkspaceTargetSchema } from '@src/db/shared';
import { WebRenderResultSchema } from '@src/web/ui-schema';

import { CapabilityResourceRefSchema, defineCapability } from './types';

export const SchedulerTaskV3Schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agent-prompt'),
    prompt: z.string().min(1),
    workspaceTarget: WorkspaceTargetSchema.nullable().default(null),
    modelSourceId: z.string().min(1).nullable().default(null),
    modelId: z.string().min(1).nullable().default(null),
    stickySession: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('plugin-tool'),
    alias: z.string().min(1),
    toolName: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
  }),
]);

const ScheduleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cron'),
    expression: z.string().min(1),
    description: z.string().min(1),
    maxRuns: z.number().int().positive().nullable(),
  }),
  z.object({
    type: z.literal('one-time'),
    runAt: z.string().datetime(),
    description: z.string().min(1),
  }),
]);

const ResourceSchema = z.object({
  resource: CapabilityResourceRefSchema,
  status: z.enum(['draft', 'created']),
  name: z.string().min(1),
  enabled: z.boolean(),
  scheduleDescription: z.string().min(1),
  nextRunAt: z.number().nullable(),
  task: SchedulerTaskV3Schema,
});

export const SchedulerCreateInputV3Schema = z.object({
  name: z.string().min(1),
  schedule: ScheduleSchema,
  task: SchedulerTaskV3Schema,
  enabled: z.boolean(),
});

const CreateOutputSchema = ResourceSchema.extend({
  review: WebRenderResultSchema.nullable(),
});

export const SchedulerV3 = defineCapability({
  capability: { name: 'scheduler', version: 3 },
  addedInCoreVersion: '13.1.0',
  operations: {
    create: {
      id: 'capability:v3:scheduler.create',
      required: true,
      inputSchema: SchedulerCreateInputV3Schema,
      outputSchema: CreateOutputSchema,
      webResult: (output: z.infer<typeof CreateOutputSchema>) => output.review,
    },
    list: {
      id: 'capability:v3:scheduler.list',
      required: false,
      inputSchema: z.object({}),
      outputSchema: z.object({
        schedules: z.array(ResourceSchema),
        view: WebRenderResultSchema.nullable(),
      }),
      webResult: (output: {
        view: z.infer<typeof WebRenderResultSchema> | null;
      }) => output.view,
    },
    show: {
      id: 'capability:v3:scheduler.show',
      required: true,
      inputSchema: z.object({ resourceId: z.string().min(1) }),
      outputSchema: ResourceSchema.extend({
        view: WebRenderResultSchema.nullable(),
      }),
      webResult: (output: {
        view: z.infer<typeof WebRenderResultSchema> | null;
      }) => output.view,
    },
    'update-task': {
      id: 'capability:v3:scheduler.update-task',
      required: true,
      inputSchema: z.object({
        resourceId: z.string().min(1),
        task: SchedulerTaskV3Schema,
      }),
      outputSchema: ResourceSchema,
    },
  },
});

export type SchedulerTaskV3 = z.infer<typeof SchedulerTaskV3Schema>;
export type SchedulerCreateInputV3 = z.infer<
  typeof SchedulerCreateInputV3Schema
>;
