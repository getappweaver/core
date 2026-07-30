/**
 * Capability: scheduler:v1
 * Added in AppWeaver core: 10.0.1
 */
import { z } from 'zod';

import { WebRenderResultSchema } from '@src/web/ui-schema';

import { CapabilityResourceRefSchema, defineCapability } from './types';

const SchedulerTaskV1Schema = z.object({
  type: z.literal('agent-prompt'),
  prompt: z.string().min(1),
  mode: z.literal('agent'),
  workspaceTarget: z.literal('appweaver'),
});

const SchedulerScheduleV1Schema = z.discriminatedUnion('type', [
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

export const SchedulerCreateInputV1Schema = z.object({
  name: z.string().min(1),
  schedule: SchedulerScheduleV1Schema,
  task: SchedulerTaskV1Schema,
  enabled: z.boolean(),
});

const SchedulerResourceV1Schema = z.object({
  resource: CapabilityResourceRefSchema,
  status: z.enum(['draft', 'created']),
  name: z.string().min(1),
  enabled: z.boolean(),
  scheduleDescription: z.string().min(1),
  nextRunAt: z.number().nullable(),
});

export const SchedulerCreateOutputV1Schema = SchedulerResourceV1Schema.extend({
  review: WebRenderResultSchema.nullable(),
});

export const SchedulerListInputV1Schema = z.object({});

export const SchedulerListOutputV1Schema = z.object({
  schedules: z.array(SchedulerResourceV1Schema),
  view: WebRenderResultSchema.nullable(),
});

export const SchedulerShowInputV1Schema = z.object({
  resourceId: z.string().min(1),
});

export const SchedulerShowOutputV1Schema = SchedulerResourceV1Schema.extend({
  view: WebRenderResultSchema.nullable(),
});

export const SchedulerV1 = defineCapability({
  capability: { name: 'scheduler', version: 1 },
  addedInCoreVersion: '10.0.1',
  operations: {
    create: {
      id: 'capability:v1:scheduler.create',
      required: true,
      inputSchema: SchedulerCreateInputV1Schema,
      outputSchema: SchedulerCreateOutputV1Schema,
      webResult: (output: z.infer<typeof SchedulerCreateOutputV1Schema>) =>
        output.review,
    },
    list: {
      id: 'capability:v1:scheduler.list',
      required: false,
      inputSchema: SchedulerListInputV1Schema,
      outputSchema: SchedulerListOutputV1Schema,
      webResult: (output: z.infer<typeof SchedulerListOutputV1Schema>) =>
        output.view,
    },
    show: {
      id: 'capability:v1:scheduler.show',
      required: true,
      inputSchema: SchedulerShowInputV1Schema,
      outputSchema: SchedulerShowOutputV1Schema,
      webResult: (output: z.infer<typeof SchedulerShowOutputV1Schema>) =>
        output.view,
    },
  },
});

export type SchedulerCreateInputV1 = z.infer<
  typeof SchedulerCreateInputV1Schema
>;
export type SchedulerCreateOutputV1 = z.infer<
  typeof SchedulerCreateOutputV1Schema
>;
