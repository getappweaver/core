import { expect, test } from 'bun:test';

import {
  SchedulerCreateInputV4Schema,
  SchedulerDeleteInputV4Schema,
  SchedulerDisableInputV4Schema,
  SchedulerEnableInputV4Schema,
  SchedulerV4,
} from './scheduler.v4';

test('scheduler v4 contract includes enable, disable, and delete operations', () => {
  expect(SchedulerV4.operations.enable.id).toBe(
    'capability:v4:scheduler.enable',
  );

  expect(SchedulerV4.operations.disable.id).toBe(
    'capability:v4:scheduler.disable',
  );

  expect(SchedulerV4.operations.delete.id).toBe(
    'capability:v4:scheduler.delete',
  );

  expect(SchedulerEnableInputV4Schema.parse({ resourceId: 'res-1' })).toEqual({
    resourceId: 'res-1',
  });

  expect(SchedulerDisableInputV4Schema.parse({ resourceId: 'res-1' })).toEqual({
    resourceId: 'res-1',
  });

  expect(SchedulerDeleteInputV4Schema.parse({ resourceId: 'res-1' })).toEqual({
    resourceId: 'res-1',
  });
});

test('scheduler v4 creates valid schedule input', () => {
  const input = SchedulerCreateInputV4Schema.parse({
    name: 'Brief',
    schedule: {
      type: 'one-time',
      runAt: new Date(Date.now() + 60000).toISOString(),
      description: 'Run soon',
    },
    task: {
      type: 'plugin-tool',
      alias: 'journal',
      toolName: 'publish_scheduled',
      input: { id: 1 },
    },
    enabled: true,
  });

  expect(input.name).toBe('Brief');
  expect(input.task.type).toBe('plugin-tool');
});
