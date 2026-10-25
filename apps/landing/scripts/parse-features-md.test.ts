import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { parseFeaturesMd } from './parse-features-md';

describe('parseFeaturesMd', () => {
  it('parses plugins/todo/FEATURES.md correctly', () => {
    const mdPath = resolve(import.meta.dir, '../../../plugins/todo/FEATURES.md');
    const markdown = readFileSync(mdPath, 'utf8');

    const features = parseFeaturesMd({ markdown, pluginAlias: 'todo' });

    expect(features.length).toBe(7);

    // First item should be order 10: todo.nested-tasks
    const first = features[0];
    expect(first.id).toBe('todo.nested-tasks');
    expect(first.title).toBe('Organize nested tasks');
    expect(first.status).toBe('stable');
    expect(first.tags).toEqual(['tasks', 'hierarchy', 'organization']);
    expect(first.surfaces).toEqual(['web', 'cli', 'dm']);
    expect(first.showcase).toBe('app');
    expect(first.order).toBe(10);
    expect(first.media.poster).toBe('landing/assets/todo-nested-tasks-poster.png');
    expect(first.media.video).toBe('landing/assets/todo-nested-tasks.webm');
    expect(first.description).toContain('Organize work as a tree of tasks and subtasks.');
    expect(first.description).not.toContain('Implementation:');

    // Second item should be order 20: todo.ai-drafts
    const second = features[1];
    expect(second.id).toBe('todo.ai-drafts');
    expect(second.order).toBe(20);

    // Third item should be order 30: todo.prioritize-duels
    const third = features[2];
    expect(third.id).toBe('todo.prioritize-duels');
    expect(third.order).toBe(30);

    // Fourth item should be order 40: todo.filter-champions
    const fourth = features[3];
    expect(fourth.id).toBe('todo.filter-champions');
    expect(fourth.order).toBe(40);
    expect(fourth.media.poster).toBe('landing/assets/todo-filter-champions-poster.png');
    expect(fourth.media.video).toBe('landing/assets/todo-filter-champions.webm');
  });

  it('rejects IDs without plugin prefix', () => {
    const md = `## Bad ID {#wrong.id}\n- Status: stable\n\nSome text`;
    expect(() => parseFeaturesMd({ markdown: md, pluginAlias: 'todo' })).toThrow(
      'must start with prefix "todo."',
    );
  });

  it('rejects duplicate IDs', () => {
    const md = `## One {#todo.dup}\n- Status: stable\n\nText\n\n## Two {#todo.dup}\n- Status: stable\n\nText`;
    expect(() => parseFeaturesMd({ markdown: md, pluginAlias: 'todo' })).toThrow(
      'Duplicate feature ID "todo.dup"',
    );
  });
});
