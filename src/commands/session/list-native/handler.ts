import type { Session } from '@opencode-ai/sdk/v2';
import { createOpencode } from '@opencode-ai/sdk/v2';

import type { CoreDb } from '@src/db';
import { getState, STATE_CURRENT_SESSION } from '@src/db';

import type { SessionListNativeRepresentation } from './representation';

type HandleSessionListNativeProps = {
  db: CoreDb;
  backendFlag: string;
  cwd: string;
  prefix: string;
};

type RuntimeSessionExtras = {
  agent?: string;
  model?: {
    id?: string;
    providerID?: string;
    variant?: string;
  };
};

type TrackedSessionRow = {
  id: string;
};

function isOpencodeFlag(flag: string): boolean {
  return flag === '--opencode' || flag === 'opencode';
}

function formatModel(session: Session): string | null {
  const model = (session as Session & RuntimeSessionExtras).model;

  if (!model?.id && !model?.providerID) {
    return null;
  }

  if (model.id && model.providerID) {
    return `${model.providerID}/${model.id}`;
  }

  return model.id ?? model.providerID ?? null;
}

export async function handleSessionListNative({
  db,
  backendFlag,
  cwd,
  prefix,
}: HandleSessionListNativeProps): Promise<SessionListNativeRepresentation> {
  if (!isOpencodeFlag(backendFlag.toLowerCase())) {
    return {
      kind: 'session.list-native',
      version: 1,
      meta: { command: 'session', subcommand: 'list-native' },
      data: backendFlag
        ? { view: 'backend-unsupported', backend: backendFlag }
        : { view: 'usage', prefix },
    };
  }

  const opencode = await createOpencode({});

  try {
    const result = await opencode.client.session.list({
      directory: cwd,
      roots: true,
      limit: 25,
    });

    const sessions = result.data ?? [];

    if (sessions.length === 0) {
      return {
        kind: 'session.list-native',
        version: 1,
        meta: { command: 'session', subcommand: 'list-native' },
        data: { view: 'empty', directory: cwd },
      };
    }

    const trackedRows = db
      .prepare('SELECT id FROM sessions WHERE backend = ?')
      .all('opencode') as TrackedSessionRow[];

    const trackedIds = new Set(trackedRows.map((row) => row.id));
    const currentSessionId = getState(db, STATE_CURRENT_SESSION);

    return {
      kind: 'session.list-native',
      version: 1,
      meta: { command: 'session', subcommand: 'list-native' },
      data: {
        view: 'rows',
        directory: cwd,
        rows: sessions.map((session) => ({
          id: session.id,
          title: session.title,
          directory: session.directory,
          agent: (session as Session & RuntimeSessionExtras).agent ?? null,
          model: formatModel(session),
          createdAtIso: new Date(session.time.created).toISOString(),
          updatedAtIso: new Date(session.time.updated).toISOString(),
          filesChanged: session.summary?.files ?? null,
          additions: session.summary?.additions ?? null,
          deletions: session.summary?.deletions ?? null,
          isTracked: trackedIds.has(session.id),
          isCurrent: session.id === currentSessionId,
        })),
      },
    };
  } finally {
    opencode.server.close();
  }
}
