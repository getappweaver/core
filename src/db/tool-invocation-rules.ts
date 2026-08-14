import { randomUUID } from 'crypto';

import type { CoreDb } from './shared';

export type ToolInvocationRulePhase = 'before' | 'after';
export type ToolInvocationRuleAction = 'continue' | 'stop' | 'send';

export type ToolInvocationRule = {
  id: string;
  phase: ToolInvocationRulePhase;
  tool: string;
  args: Record<string, unknown>;
  argumentKey: string | null;
  pattern: string | null;
  action: ToolInvocationRuleAction;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
}

function canonicalArgs(args: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(args));
}

export function createToolInvocationRulesTable(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS tool_invocation_rules (
      id TEXT PRIMARY KEY,
      phase TEXT NOT NULL CHECK (phase IN ('before', 'after')),
      tool TEXT NOT NULL,
      tool_normalized TEXT NOT NULL,
      args_json TEXT NOT NULL,
      argument_key TEXT,
      pattern TEXT,
      action TEXT NOT NULL CHECK (action IN ('continue', 'stop', 'send')),
      created_at INTEGER NOT NULL,
      UNIQUE (phase, tool_normalized, args_json)
    )
  `);

  for (const column of ['argument_key TEXT', 'pattern TEXT']) {
    try {
      db.run(`ALTER TABLE tool_invocation_rules ADD COLUMN ${column}`);
    } catch {
      // Column already exists.
    }
  }
}

function parseRule(row: {
  id: string;
  phase: ToolInvocationRulePhase;
  tool: string;
  args_json: string;
  argument_key: string | null;
  pattern: string | null;
  action: ToolInvocationRuleAction;
}): ToolInvocationRule {
  return {
    id: row.id,
    phase: row.phase,
    tool: row.tool,
    args: JSON.parse(row.args_json) as Record<string, unknown>,
    argumentKey: row.argument_key,
    pattern: row.pattern,
    action: row.action,
  };
}

export function listToolInvocationRules(db: CoreDb): ToolInvocationRule[] {
  const rows = db
    .prepare(
      `SELECT id, phase, tool, args_json, argument_key, pattern, action
       FROM tool_invocation_rules
       ORDER BY created_at DESC`,
    )
    .all() as {
    id: string;
    phase: ToolInvocationRulePhase;
    tool: string;
    args_json: string;
    argument_key: string | null;
    pattern: string | null;
    action: ToolInvocationRuleAction;
  }[];

  return rows.map(parseRule);
}

export function findToolInvocationRule(props: {
  db: CoreDb;
  phase: ToolInvocationRulePhase;
  tool: string;
  args: Record<string, unknown>;
}): ToolInvocationRule | null {
  const rows = props.db
    .prepare(
      `SELECT id, phase, tool, args_json, argument_key, pattern, action
       FROM tool_invocation_rules
       WHERE phase = ? AND tool_normalized = ?
       ORDER BY created_at DESC`,
    )
    .all(props.phase, props.tool.toLowerCase()) as {
    id: string;
    phase: ToolInvocationRulePhase;
    tool: string;
    args_json: string;
    argument_key: string | null;
    pattern: string | null;
    action: ToolInvocationRuleAction;
  }[];

  const exactArgs = canonicalArgs(props.args);

  const row = rows.find((candidate) => {
    if (!candidate.argument_key || !candidate.pattern) {
      return candidate.args_json === exactArgs;
    }

    const values = invocationArgumentValues({
      tool: props.tool,
      args: props.args,
      argumentKey: candidate.argument_key,
    });

    return (
      values.length > 0 &&
      values.every((value) =>
        invocationPatternMatches({
          value,
          pattern: candidate.pattern!,
          argumentKey: candidate.argument_key!,
        }),
      )
    );
  });

  return row ? parseRule(row) : null;
}

function invocationArgumentValues(props: {
  tool: string;
  args: Record<string, unknown>;
  argumentKey: string;
}): string[] {
  if (props.argumentKey === '$file') {
    const patchText = props.args.patchText;

    if (typeof patchText !== 'string') {
      return [];
    }

    return [
      ...patchText.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm),
    ].map((match) => match[1]);
  }

  const value = props.args[props.argumentKey];

  return typeof value === 'string' ? [value] : [];
}

function invocationPatternMatches(props: {
  value: string;
  pattern: string;
  argumentKey: string;
}): boolean {
  if (
    props.argumentKey === '$file' ||
    ['filePath', 'filepath', 'path'].includes(props.argumentKey)
  ) {
    return pathGlobMatches(props.value, props.pattern);
  }

  return wildcardMatches(props.value, props.pattern);
}

function wildcardMatches(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  const source = escaped.replace(/\*/g, '.*');

  return new RegExp(`^${source}$`).test(value);
}

function pathGlobMatches(value: string, pattern: string): boolean {
  const normalizedValue = value.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');
  let source = '^';

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];

    if (character === '*' && normalizedPattern[index + 1] === '*') {
      index += 1;

      if (normalizedPattern[index + 1] === '/') {
        index += 1;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }

      continue;
    }

    if (character === '*') {
      source += '[^/]*';
      continue;
    }

    if (character === '?') {
      source += '[^/]';
      continue;
    }

    source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }

  return new RegExp(`${source}$`).test(normalizedValue);
}

export function saveToolInvocationRule(props: {
  db: CoreDb;
  phase: ToolInvocationRulePhase;
  tool: string;
  args: Record<string, unknown>;
  action: ToolInvocationRuleAction;
  argumentKey: string | null;
  pattern: string | null;
}): void {
  props.db
    .prepare(
      `INSERT INTO tool_invocation_rules
         (id, phase, tool, tool_normalized, args_json, argument_key, pattern, action, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (phase, tool_normalized, args_json) DO UPDATE SET
         tool = excluded.tool,
         argument_key = excluded.argument_key,
         pattern = excluded.pattern,
         action = excluded.action,
         created_at = excluded.created_at`,
    )
    .run(
      randomUUID(),
      props.phase,
      props.tool,
      props.tool.toLowerCase(),
      canonicalArgs(props.args),
      props.argumentKey,
      props.pattern,
      props.action,
      Date.now(),
    );
}

export function deleteToolInvocationRule(db: CoreDb, ruleId: string): boolean {
  return (
    db.prepare('DELETE FROM tool_invocation_rules WHERE id = ?').run(ruleId)
      .changes > 0
  );
}

export function updateToolInvocationRulePattern(props: {
  db: CoreDb;
  ruleId: string;
  pattern: string;
}): boolean {
  return (
    props.db
      .prepare(
        `UPDATE tool_invocation_rules
         SET pattern = ?, created_at = ?
         WHERE id = ? AND argument_key IS NOT NULL`,
      )
      .run(props.pattern, Date.now(), props.ruleId).changes > 0
  );
}
