import { expect, test } from 'bun:test';

import { SchedulerCreateInputV3Schema } from './scheduler.v3';

test('scheduler v3 keeps omitted execution settings inherited and sessions fresh', () => {
  const input = SchedulerCreateInputV3Schema.parse({
    name: 'Brief',
    schedule: {
      type: 'cron',
      expression: '* * * * *',
      description: 'Every minute',
      maxRuns: null,
    },
    task: { type: 'agent-prompt', prompt: 'Summarize activity' },
    enabled: true,
  });

  expect(input.task).toEqual({
    type: 'agent-prompt',
    prompt: 'Summarize activity',
    workspaceTarget: null,
    modelSourceId: null,
    modelId: null,
    stickySession: false,
  });

  expect(
    SchedulerCreateInputV3Schema.parse({
      ...input,
      task: {
        type: 'agent-prompt',
        prompt: 'Summarize activity',
        workspaceTarget: 'parent',
        modelSourceId: 'ppq',
        modelId: 'private/gpt-oss-120b',
        stickySession: true,
      },
    }).task,
  ).toMatchObject({ modelSourceId: 'ppq', stickySession: true });
});
