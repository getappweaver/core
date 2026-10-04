/** Scheduler v4 adds enable, disable, and delete capability operations. */
import { z } from 'zod';

import { WorkspaceTargetSchema } from '@src/db/shared';
import { WebRenderResultSchema } from '@src/web/ui-schema';

import { CapabilityResourceRefSchema, defineCapability } from './types';

export const SchedulerTaskV4Schema = z.discriminatedUnion('type', [
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

const ScheduleV4Schema = z.discriminatedUnion('type', [
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

export const SchedulerResourceV4Schema = z.object({
  resource: CapabilityResourceRefSchema,
  status: z.enum(['draft', 'created']),
  name: z.string().min(1),
  enabled: z.boolean(),
  scheduleDescription: z.string().min(1),
  nextRunAt: z.number().nullable(),
  task: SchedulerTaskV4Schema,
});

export const SchedulerCreateInputV4Schema = z.object({
  name: z.string().min(1),
  schedule: ScheduleV4Schema,
  task: SchedulerTaskV4Schema,
  enabled: z.boolean(),
});

export const SchedulerCreateOutputV4Schema = SchedulerResourceV4Schema.extend({
  review: WebRenderResultSchema.nullable(),
});

export const SchedulerUpdateTaskInputV4Schema = z.object({
  resourceId: z.string().min(1),
  task: SchedulerTaskV4Schema,
});

export const SchedulerEnableInputV4Schema = z.object({
  resourceId: z.string().min(1),
});

export const SchedulerDisableInputV4Schema = z.object({
  resourceId: z.string().min(1),
});

export const SchedulerDeleteInputV4Schema = z.object({
  resourceId: z.string().min(1),
});

export const SchedulerDeleteOutputV4Schema = z.object({
  resourceId: z.string().min(1),
  deleted: z.boolean(),
});

export const SchedulerV4 = defineCapability({
  capability: { name: 'scheduler', version: 4 },
  addedInCoreVersion: '13.6.0',
  operations: {
    create: {
      id: 'capability:v4:scheduler.create',
      required: true,
      inputSchema: SchedulerCreateInputV4Schema,
      outputSchema: SchedulerCreateOutputV4Schema,
      webResult: (output: z.infer<typeof SchedulerCreateOutputV4Schema>) =>
        output.review,
    },
    list: {
      id: 'capability:v4:scheduler.list',
      required: false,
      inputSchema: z.object({}),
      outputSchema: z.object({
        schedules: z.array(SchedulerResourceV4Schema),
        view: WebRenderResultSchema.nullable(),
      }),
      webResult: (output: {
        view: z.infer<typeof WebRenderResultSchema> | null;
      }) => output.view,
    },
    show: {
      id: 'capability:v4:scheduler.show',
      required: true,
      inputSchema: z.object({ resourceId: z.string().min(1) }),
      outputSchema: SchedulerResourceV4Schema.extend({
        view: WebRenderResultSchema.nullable(),
      }),
      webResult: (output: {
        view: z.infer<typeof WebRenderResultSchema> | null;
      }) => output.view,
    },
    'update-task': {
      id: 'capability:v4:scheduler.update-task',
      required: true,
      inputSchema: SchedulerUpdateTaskInputV4Schema,
      outputSchema: SchedulerResourceV4Schema,
    },
    enable: {
      id: 'capability:v4:scheduler.enable',
      required: true,
      inputSchema: SchedulerEnableInputV4Schema,
      outputSchema: SchedulerResourceV4Schema,
    },
    disable: {
      id: 'capability:v4:scheduler.disable',
      required: true,
      inputSchema: SchedulerDisableInputV4Schema,
      outputSchema: SchedulerResourceV4Schema,
    },
    delete: {
      id: 'capability:v4:scheduler.delete',
      required: true,
      inputSchema: SchedulerDeleteInputV4Schema,
      outputSchema: SchedulerDeleteOutputV4Schema,
    },
  },
});

export type SchedulerTaskV4 = z.infer<typeof SchedulerTaskV4Schema>;
export type SchedulerCreateInputV4 = z.infer<
  typeof SchedulerCreateInputV4Schema
>;
export type SchedulerResourceV4 = z.infer<typeof SchedulerResourceV4Schema>;
export type SchedulerDeleteOutputV4 = z.infer<
  typeof SchedulerDeleteOutputV4Schema
>;
