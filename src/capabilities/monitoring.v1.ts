/**
 * Capability: monitoring:v1
 * Added in AppWeaver core: 10.0.1
 */
import { z } from 'zod';

import { defineCapability } from './types';

export const MonitoringAttributeValueV1Schema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const MonitoringSpanV1Schema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().min(1).nullable(),
  name: z.string().min(1),
  source: z.enum(['browser', 'server']),
  startedAt: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  status: z.enum(['ok', 'error']),
  attributes: z.record(z.string(), MonitoringAttributeValueV1Schema),
});

export const MonitoringRecordInputV1Schema = z.object({
  spans: z.array(MonitoringSpanV1Schema).min(1).max(500),
});

export const MonitoringRecordOutputV1Schema = z.object({
  accepted: z.number().int().nonnegative(),
});

export const MonitoringV1 = defineCapability({
  capability: { name: 'monitoring', version: 1 },
  addedInCoreVersion: '10.0.1',
  operations: {
    record: {
      id: 'capability:v1:monitoring.record',
      required: true,
      inputSchema: MonitoringRecordInputV1Schema,
      outputSchema: MonitoringRecordOutputV1Schema,
      webResult: () => null,
    },
  },
});

export type MonitoringAttributeValueV1 = z.infer<
  typeof MonitoringAttributeValueV1Schema
>;
export type MonitoringSpanV1 = z.infer<typeof MonitoringSpanV1Schema>;
