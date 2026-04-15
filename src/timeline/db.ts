import type { PromptPayload } from '@src/core/plugin';
import type { CoreDb } from '@src/db';
import type { MessageSource } from '@src/messaging';

import type {
  TimelineCommandFormState,
  TimelineEventKind,
  TimelineEventRecord,
  TimelineHistoryItem,
  TimelinePayload,
} from './types';

type TimelineEventRow = {
  id: string;
  timeline_id: string;
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
  prompt_json: string | null;
  request_id: string | null;
  created_at: number;
};

export function createTimelineTables(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      timeline_id TEXT NOT NULL,
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
      prompt_json TEXT,
      request_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  try {
    db.run('ALTER TABLE timeline_events ADD COLUMN form_json TEXT');
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
  event: Omit<TimelineEventRecord, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: number;
  },
): TimelineEventRecord {
  const record: TimelineEventRecord = {
    ...event,
    id: event.id ?? createTimelineEventId(),
    createdAt: event.createdAt ?? Date.now(),
  };

  db.run(
    `INSERT OR REPLACE INTO timeline_events (
      id,
      timeline_id,
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
      prompt_json,
      request_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.timelineId,
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
      record.prompt ? JSON.stringify(record.prompt) : null,
      record.requestId,
      record.createdAt,
    ],
  );

  return record;
}

function rowToTimelineEventRecord(row: TimelineEventRow): TimelineEventRecord {
  return {
    id: row.id,
    timelineId: row.timeline_id,
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
  db.run('DELETE FROM timeline_events WHERE timeline_id = ? AND id = ?', [
    timelineId,
    eventId,
  ]);
}

export function upsertTimelineCommandForm(
  db: CoreDb,
  params: {
    eventId: string;
    timelineId: string;
    source: MessageSource;
    command: string;
    form: TimelineCommandFormState;
    createdAt?: number;
  },
): TimelineEventRecord {
  return insertTimelineEvent(db, {
    id: params.eventId,
    timelineId: params.timelineId,
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
           WHERE timeline_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
          )
          .all(timelineId, limit)
      : db
          .prepare(
            `SELECT * FROM timeline_events
           WHERE timeline_id = ? AND created_at < ?
           ORDER BY created_at DESC
           LIMIT ?`,
          )
          .all(timelineId, beforeCreatedAt, limit)
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
