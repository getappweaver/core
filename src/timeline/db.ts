import type { PromptPayload } from '@src/core/plugin';
import type { CoreDb } from '@src/db';
import type { MessageSource } from '@src/messaging';

import type {
  TimelineCommandFormState,
  TimelineDiffSummary,
  TimelineEventKind,
  TimelineEventMeta,
  TimelineEventRecord,
  TimelineFileDiff,
  TimelineHistoryItem,
  TimelinePayload,
  TimelineToolCall,
} from './types';

type TimelineEventRow = {
  id: string;
  timeline_id: string;
  session_id: string | null;
  source: MessageSource;
  kind: TimelineEventKind;
  role: 'user' | 'assistant' | null;
  command: string | null;
  subcommand: string | null;
  subcommand_tag: string | null;
  values_json: string | null;
  form_json: string | null;
  text: string | null;
  web_json: string | null;
  client_view_json: string | null;
  diff_json: string | null;
  meta_json: string | null;
  diff_summary_json: string | null;
  tool_json: string | null;
  prompt_json: string | null;
  request_id: string | null;
  created_at: number;
};

export function createTimelineTables(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      timeline_id TEXT NOT NULL,
      session_id TEXT,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      role TEXT,
      command TEXT,
      subcommand TEXT,
      subcommand_tag TEXT,
      values_json TEXT,
      form_json TEXT,
      text TEXT,
      web_json TEXT,
      client_view_json TEXT,
      diff_json TEXT,
      meta_json TEXT,
      diff_summary_json TEXT,
      tool_json TEXT,
      prompt_json TEXT,
      request_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  try {
    db.run('ALTER TABLE timeline_events ADD COLUMN session_id TEXT');
  } catch {
    /* Column already exists; historical rows remain NULL and are not shown. */
  }

  db.run(
    'CREATE INDEX IF NOT EXISTS timeline_events_session_created_idx ON timeline_events (session_id, created_at DESC)',
  );

  try {
    db.run('ALTER TABLE timeline_events ADD COLUMN form_json TEXT');
  } catch {
    /* Column already exists */
  }

  try {
    db.run('ALTER TABLE timeline_events ADD COLUMN client_view_json TEXT');
  } catch {
    /* Column already exists */
  }

  try {
    db.run('ALTER TABLE timeline_events ADD COLUMN diff_json TEXT');
  } catch {
    /* Column already exists */
  }

  try {
    db.run('ALTER TABLE timeline_events ADD COLUMN diff_summary_json TEXT');
  } catch {
    /* Column already exists */
  }

  try {
    db.run('ALTER TABLE timeline_events ADD COLUMN meta_json TEXT');
  } catch {
    /* Column already exists */
  }

  try {
    db.run('ALTER TABLE timeline_events ADD COLUMN tool_json TEXT');
  } catch {
    /* Column already exists */
  }

  db.run(
    'CREATE INDEX IF NOT EXISTS timeline_events_timeline_created_idx ON timeline_events (timeline_id, created_at DESC)',
  );

  db.run(
    'CREATE INDEX IF NOT EXISTS timeline_events_timeline_id_idx ON timeline_events (timeline_id, id)',
  );
}

export function createTimelineEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function insertTimelineEvent(
  db: CoreDb,
  event: Omit<
    TimelineEventRecord,
    'id' | 'createdAt' | 'diff' | 'meta' | 'diffSummary' | 'tool'
  > & {
    id?: string;
    createdAt?: number;
    diff?: TimelineFileDiff[] | null;
    meta?: TimelineEventMeta | null;
    diffSummary?: TimelineDiffSummary | null;
    tool?: TimelineToolCall | null;
  },
): TimelineEventRecord {
  const record: TimelineEventRecord = {
    ...event,
    diff: event.diff ?? null,
    meta: event.meta ?? null,
    diffSummary: event.diffSummary ?? null,
    tool: event.tool ?? null,
    id: event.id ?? createTimelineEventId(),
    createdAt: event.createdAt ?? Date.now(),
  };

  if (
    event.createdAt === undefined &&
    record.kind === 'chat' &&
    record.role === 'assistant'
  ) {
    const latest = db
      .prepare(
        "SELECT MAX(created_at) AS created_at FROM timeline_events WHERE session_id = ? AND kind = 'chat' AND role = 'assistant'",
      )
      .get(event.sessionId) as { created_at: number | null };

    if (latest.created_at !== null) {
      record.createdAt = Math.max(record.createdAt, latest.created_at + 1);
    }
  }

  if (record.timelineId !== event.sessionId) {
    throw new Error('Timeline must match its session.');
  }

  db.run(
    `INSERT OR REPLACE INTO timeline_events (
      id,
      timeline_id,
      session_id,
      source,
      kind,
      role,
      command,
      subcommand,
      subcommand_tag,
      values_json,
      form_json,
      text,
      web_json,
      client_view_json,
      diff_json,
      meta_json,
      diff_summary_json,
      tool_json,
      prompt_json,
      request_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.timelineId,
      event.sessionId,
      record.source,
      record.kind,
      record.role,
      record.command,
      record.subcommand,
      record.subcommandTag,
      record.values ? JSON.stringify(record.values) : null,
      record.form ? JSON.stringify(record.form) : null,
      record.text,
      record.web ? JSON.stringify(record.web) : null,
      record.clientView ? JSON.stringify(record.clientView) : null,
      record.diff ? JSON.stringify(record.diff) : null,
      record.meta ? JSON.stringify(record.meta) : null,
      record.diffSummary ? JSON.stringify(record.diffSummary) : null,
      record.tool ? JSON.stringify(record.tool) : null,
      record.prompt ? JSON.stringify(record.prompt) : null,
      record.requestId,
      record.createdAt,
    ],
  );

  db.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [
    Math.floor(record.createdAt / 1000),
    event.sessionId,
  ]);

  return record;
}

function rowToTimelineEventRecord(row: TimelineEventRow): TimelineEventRecord {
  if (!row.session_id) {
    throw new Error('Historical timeline events do not have a session.');
  }

  return {
    id: row.id,
    timelineId: row.timeline_id,
    sessionId: row.session_id,
    source: row.source,
    kind: row.kind,
    role: row.role,
    command: row.command,
    subcommand: row.subcommand,
    subcommandTag: row.subcommand_tag,
    values: row.values_json
      ? (JSON.parse(row.values_json) as TimelinePayload)
      : null,
    form: row.form_json
      ? (JSON.parse(row.form_json) as TimelineCommandFormState)
      : null,
    text: row.text,
    web: row.web_json ? JSON.parse(row.web_json) : null,
    clientView: row.client_view_json ? JSON.parse(row.client_view_json) : null,
    diff: row.diff_json
      ? (JSON.parse(row.diff_json) as TimelineFileDiff[])
      : null,
    meta: row.meta_json
      ? (JSON.parse(row.meta_json) as TimelineEventMeta)
      : null,
    diffSummary: row.diff_summary_json
      ? (JSON.parse(row.diff_summary_json) as TimelineDiffSummary)
      : null,
    tool: row.tool_json
      ? (JSON.parse(row.tool_json) as TimelineToolCall)
      : null,
    prompt: row.prompt_json
      ? (JSON.parse(row.prompt_json) as PromptPayload)
      : null,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

export function timelineEventToHistoryItem(
  event: TimelineEventRecord,
): TimelineHistoryItem | null {
  switch (event.kind) {
    case 'system':
      return event.text
        ? {
            id: event.id,
            type: 'system',
            text: event.text,
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    case 'chat':
      return event.text && event.role
        ? {
            id: event.id,
            type: 'chat',
            role: event.role,
            text: event.text,
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    case 'reasoning':
      return event.text
        ? {
            id: event.id,
            type: 'reasoning',
            text: event.text,
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    case 'agent_summary':
      return event.text
        ? {
            id: event.id,
            type: 'agent_summary',
            text: event.text,
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    case 'diff':
      return event.diff
        ? {
            id: event.id,
            type: 'diff',
            files: event.diff,
            meta: event.meta,
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    case 'diff_summary':
      return event.diffSummary
        ? {
            id: event.id,
            type: 'diff_summary',
            summary: event.diffSummary,
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    case 'tool':
      return event.tool
        ? {
            id: event.id,
            type: 'tool',
            tool: event.tool,
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    case 'prompt': {
      const prompt = event.prompt;

      if (!prompt || !event.requestId) {
        return null;
      }

      return {
        id: event.id,
        type: 'prompt',
        requestId: event.requestId,
        text: prompt.type === 'text-prompt' ? prompt.value : null,
        web: prompt.type === 'web-prompt' ? prompt.value : null,
        createdAt: event.createdAt,
        source: event.source,
      };
    }

    case 'command_result':
      return event.command && event.subcommand && event.subcommandTag
        ? {
            id: event.id,
            type: 'command_result',
            command: event.command,
            subcommand: event.subcommand,
            subcommandTag: event.subcommandTag,
            values: event.values,
            text: event.text,
            web: event.web,
            clientView: event.clientView,
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    case 'command_form':
      return event.command && event.form
        ? {
            id: event.id,
            type: 'command_form',
            command: event.command,
            subcommand: event.form.subcommand,
            values: event.form.values,
            autoRun: event.form.autoRun,
            ...(event.form.optionHints
              ? { optionHints: event.form.optionHints }
              : {}),
            ...(event.form.argumentChoices
              ? { argumentChoices: event.form.argumentChoices }
              : {}),
            createdAt: event.createdAt,
            source: event.source,
          }
        : null;
    default:
      return null;
  }
}

export function deleteTimelineEvent(
  db: CoreDb,
  timelineId: string,
  eventId: string,
): void {
  db.run(
    'DELETE FROM timeline_events WHERE session_id = ? AND timeline_id = ? AND id = ?',
    [timelineId, timelineId, eventId],
  );
}

export function upsertTimelineCommandForm(
  db: CoreDb,
  params: {
    eventId: string;
    timelineId: string;
    sessionId: string;
    source: MessageSource;
    command: string;
    form: TimelineCommandFormState;
    createdAt?: number;
  },
): TimelineEventRecord {
  return insertTimelineEvent(db, {
    id: params.eventId,
    timelineId: params.timelineId,
    sessionId: params.sessionId,
    source: params.source,
    kind: 'command_form',
    role: null,
    command: params.command,
    subcommand: params.form.subcommand.name,
    subcommandTag: params.form.subcommand.name,
    values: params.form.values,
    form: params.form,
    text: null,
    web: null,
    clientView: null,
    prompt: null,
    requestId: null,
    createdAt: params.createdAt,
  });
}

function listTimelineEventRows(
  db: CoreDb,
  timelineId: string,
  limit: number,
  beforeCreatedAt?: number,
): TimelineEventRow[] {
  const rows = (
    beforeCreatedAt == null
      ? db
          .prepare(
            `SELECT * FROM timeline_events
          WHERE session_id = ? AND timeline_id = ?
            ORDER BY created_at DESC, id DESC
           LIMIT ?`,
          )
          .all(timelineId, timelineId, limit)
      : db
          .prepare(
            `SELECT * FROM timeline_events
          WHERE session_id = ? AND timeline_id = ? AND created_at < ?
            ORDER BY created_at DESC, id DESC
           LIMIT ?`,
          )
          .all(timelineId, timelineId, beforeCreatedAt, limit)
  ) as TimelineEventRow[];

  return rows;
}

export function listTimelineHistoryLatest(
  db: CoreDb,
  timelineId: string,
  limit: number,
): { items: TimelineHistoryItem[]; hasMore: boolean } {
  const rows = listTimelineEventRows(db, timelineId, limit + 1);
  const hasMore = rows.length > limit;
  const visibleRows = rows.slice(0, limit).reverse();

  return {
    items: visibleRows
      .map((row) => timelineEventToHistoryItem(rowToTimelineEventRecord(row)))
      .filter((item): item is TimelineHistoryItem => item !== null),
    hasMore,
  };
}

export function listTimelineHistoryBefore(
  db: CoreDb,
  timelineId: string,
  beforeCreatedAt: number,
  limit: number,
): { items: TimelineHistoryItem[]; hasMore: boolean } {
  const rows = listTimelineEventRows(
    db,
    timelineId,
    limit + 1,
    beforeCreatedAt,
  );

  const hasMore = rows.length > limit;
  const visibleRows = rows.slice(0, limit).reverse();

  return {
    items: visibleRows
      .map((row) => timelineEventToHistoryItem(rowToTimelineEventRecord(row)))
      .filter((item): item is TimelineHistoryItem => item !== null),
    hasMore,
  };
}

type ReadCursor = {
  last_read_message_created_at: number | null;
  last_read_message_id: string | null;
};

type MessagePosition = { id: string; created_at: number };

export function getSessionUnreadWindow(
  db: CoreDb,
  sessionId: string,
  minimumLimit: number,
): { firstUnreadId: string | null; limit: number } {
  const cursor = db
    .prepare(
      'SELECT last_read_message_created_at, last_read_message_id FROM sessions WHERE id = ?',
    )
    .get(sessionId) as ReadCursor | undefined;

  if (!cursor || cursor.last_read_message_created_at === null) {
    return { firstUnreadId: null, limit: minimumLimit };
  }

  const first = db
    .prepare(
      `SELECT id, created_at FROM timeline_events
       WHERE session_id = ? AND kind = 'chat' AND role = 'assistant'
         AND (created_at > ? OR (created_at = ? AND id > ?))
       ORDER BY created_at ASC, id ASC LIMIT 1`,
    )
    .get(
      sessionId,
      cursor.last_read_message_created_at,
      cursor.last_read_message_created_at,
      cursor.last_read_message_id ?? '',
    ) as MessagePosition | undefined;

  if (!first) {
    return { firstUnreadId: null, limit: minimumLimit };
  }

  const count = db
    .prepare(
      'SELECT COUNT(*) AS count FROM timeline_events WHERE session_id = ? AND (created_at > ? OR (created_at = ? AND id >= ?))',
    )
    .get(sessionId, first.created_at, first.created_at, first.id) as {
    count: number;
  };

  return {
    firstUnreadId: first.id,
    limit: Math.max(minimumLimit, count.count + 20),
  };
}

export function markSessionRead(
  db: CoreDb,
  sessionId: string,
  messageId: string | null,
): void {
  const latest = messageId
    ? (db
        .prepare(
          "SELECT id, created_at FROM timeline_events WHERE session_id = ? AND kind = 'chat' AND role = 'assistant' AND id = ?",
        )
        .get(sessionId, messageId) as MessagePosition | undefined)
    : null;

  if (messageId && !latest) {
    return;
  }

  const createdAt = latest?.created_at ?? 0;
  const id = latest?.id ?? '';

  db.run(
    `UPDATE sessions
     SET last_read_message_created_at = ?, last_read_message_id = ?
     WHERE id = ? AND (
       last_read_message_created_at IS NULL OR
       last_read_message_created_at < ? OR
       (last_read_message_created_at = ? AND COALESCE(last_read_message_id, '') < ?)
     )`,
    [createdAt, id, sessionId, createdAt, createdAt, id],
  );
}
