import { expect, test } from 'bun:test';

import {
  SchedulerCreateInputV2Schema,
  SchedulerTaskV2Schema,
} from './scheduler.v2';

test('scheduler v2 accepts deterministic plugin-tool tasks', () => {
  expect(
    SchedulerCreateInputV2Schema.parse({
      name: 'Radar fetch',
      schedule: {
        type: 'cron',
        expression: '5 * * * *',
        description: 'Hourly',
        maxRuns: null,
      },
      task: {
        type: 'plugin-tool',
        alias: 'nr',
        toolName: 'fetch_evaluate',
        input: {},
      },
      enabled: true,
    }).task,
  ).toEqual({
    type: 'plugin-tool',
    alias: 'nr',
    toolName: 'fetch_evaluate',
    input: {},
  });
});

test('scheduler v2 keeps agent-prompt tasks compatible', () => {
  expect(
    SchedulerTaskV2Schema.parse({
      type: 'agent-prompt',
      prompt: 'Send a summary.',
      mode: 'agent',
      workspaceTarget: 'appweaver',
    }).type,
  ).toBe('agent-prompt');
});
