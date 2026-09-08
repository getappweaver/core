/**
 * Capability: scheduler:v2
 * Added in AppWeaver core: 12.7.0
 */
import { z } from 'zod';

import { WebRenderResultSchema } from '@src/web/ui-schema';

import { CapabilityResourceRefSchema, defineCapability } from './types';

export const SchedulerTaskV2Schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agent-prompt'),
    prompt: z.string().min(1),
    mode: z.literal('agent'),
    workspaceTarget: z.literal('appweaver'),
  }),
  z.object({
    type: z.literal('plugin-tool'),
    alias: z.string().min(1),
    toolName: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
  }),
]);

const SchedulerScheduleV2Schema = z.discriminatedUnion('type', [
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

export const SchedulerCreateInputV2Schema = z.object({
  name: z.string().min(1),
  schedule: SchedulerScheduleV2Schema,
  task: SchedulerTaskV2Schema,
  enabled: z.boolean(),
});

const SchedulerResourceV2Schema = z.object({
  resource: CapabilityResourceRefSchema,
  status: z.enum(['draft', 'created']),
  name: z.string().min(1),
  enabled: z.boolean(),
  scheduleDescription: z.string().min(1),
  nextRunAt: z.number().nullable(),
  task: SchedulerTaskV2Schema,
});

export const SchedulerCreateOutputV2Schema = SchedulerResourceV2Schema.extend({
  review: WebRenderResultSchema.nullable(),
});

export const SchedulerListInputV2Schema = z.object({});

export const SchedulerListOutputV2Schema = z.object({
  schedules: z.array(SchedulerResourceV2Schema),
  view: WebRenderResultSchema.nullable(),
});

export const SchedulerShowInputV2Schema = z.object({
  resourceId: z.string().min(1),
});

export const SchedulerShowOutputV2Schema = SchedulerResourceV2Schema.extend({
  view: WebRenderResultSchema.nullable(),
});

export const SchedulerUpdateTaskInputV2Schema = z.object({
  resourceId: z.string().min(1),
  task: SchedulerTaskV2Schema,
});

export const SchedulerUpdateTaskOutputV2Schema = SchedulerResourceV2Schema;

export const SchedulerV2 = defineCapability({
  capability: { name: 'scheduler', version: 2 },
  addedInCoreVersion: '12.7.0',
  operations: {
    create: {
      id: 'capability:v2:scheduler.create',
      required: true,
      inputSchema: SchedulerCreateInputV2Schema,
      outputSchema: SchedulerCreateOutputV2Schema,
      webResult: (output: z.infer<typeof SchedulerCreateOutputV2Schema>) =>
        output.review,
    },
    list: {
      id: 'capability:v2:scheduler.list',
      required: false,
      inputSchema: SchedulerListInputV2Schema,
      outputSchema: SchedulerListOutputV2Schema,
      webResult: (output: z.infer<typeof SchedulerListOutputV2Schema>) =>
        output.view,
    },
    show: {
      id: 'capability:v2:scheduler.show',
      required: true,
      inputSchema: SchedulerShowInputV2Schema,
      outputSchema: SchedulerShowOutputV2Schema,
      webResult: (output: z.infer<typeof SchedulerShowOutputV2Schema>) =>
        output.view,
    },
    'update-task': {
      id: 'capability:v2:scheduler.update-task',
      required: true,
      inputSchema: SchedulerUpdateTaskInputV2Schema,
      outputSchema: SchedulerUpdateTaskOutputV2Schema,
    },
  },
});

export type SchedulerTaskV2 = z.infer<typeof SchedulerTaskV2Schema>;
export type SchedulerCreateInputV2 = z.infer<
  typeof SchedulerCreateInputV2Schema
>;
export type SchedulerCreateOutputV2 = z.infer<
  typeof SchedulerCreateOutputV2Schema
>;
