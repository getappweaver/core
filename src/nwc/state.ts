import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  getState,
  setState,
  STATE_NWC_CONNECTIONS,
  type CoreDb,
} from '@src/db';
import {
  decryptSecret,
  EncryptedSecretEnvelopeSchema,
  encryptSecret,
} from '@src/security/encrypted-secret';

import { parseNwcConnectionUri, safeNwcConnection } from './connection';
import { NwcStateError } from './errors';
import type { NwcConnection, SafeNwcConnection } from './types';

const StoredNwcConnectionSchema = z.strictObject({
  id: z.string().uuid(),
  label: z.string().min(1).max(80),
  connectionUri: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  verifiedAt: z.number().int().nonnegative().nullable(),
  walletAlias: z.string().nullable(),
  methods: z.array(z.string()),
});

const NwcConnectionStateV1Schema = z.strictObject({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  connections: z.array(StoredNwcConnectionSchema),
});

const EncryptedStoredNwcConnectionSchema = StoredNwcConnectionSchema.omit({
  connectionUri: true,
}).extend({
  connectionUriCiphertext: EncryptedSecretEnvelopeSchema,
});

const NwcConnectionStateV2Schema = z.strictObject({
  version: z.literal(2),
  revision: z.number().int().nonnegative(),
  connections: z.array(EncryptedStoredNwcConnectionSchema),
});

export type StoredNwcConnection = z.infer<typeof StoredNwcConnectionSchema>;

export type NwcConnectionSummary = SafeNwcConnection & {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  verifiedAt: number | null;
  walletAlias: string | null;
  methods: string[];
};

type NwcConnectionState = {
  version: 2;
  revision: number;
  connections: StoredNwcConnection[];
};

type AddNwcConnectionProps = {
  db: CoreDb;
  label: string;
  connectionUri: string;
};

type UpdateNwcVerificationProps = {
  db: CoreDb;
  id: string;
  walletAlias: string | null;
  methods: string[];
  verifiedAt?: number;
};

const EMPTY_STATE: NwcConnectionState = {
  version: 2,
  revision: 0,
  connections: [],
};

function serializeState(state: NwcConnectionState): string {
  return JSON.stringify({
    ...state,
    connections: state.connections.map(({ connectionUri, ...connection }) => ({
      ...connection,
      connectionUriCiphertext: encryptSecret(connectionUri),
    })),
  });
}

function loadState(db: CoreDb): NwcConnectionState {
  const raw = getState(db, STATE_NWC_CONNECTIONS);

  if (raw === null) {
    return { ...EMPTY_STATE, connections: [] };
  }

  let value: unknown;

  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new NwcStateError();
  }

  const current = NwcConnectionStateV2Schema.safeParse(value);

  if (current.success) {
    return {
      version: 2,
      revision: current.data.revision,
      connections: current.data.connections.map(
        ({ connectionUriCiphertext, ...connection }) => ({
          ...connection,
          connectionUri: decryptSecret(connectionUriCiphertext),
        }),
      ),
    };
  }

  const legacy = NwcConnectionStateV1Schema.safeParse(value);

  if (!legacy.success) {
    throw new NwcStateError();
  }

  for (const connection of legacy.data.connections) {
    try {
      parseNwcConnectionUri(connection.connectionUri);
    } catch {
      throw new NwcStateError();
    }
  }

  const migrated: NwcConnectionState = {
    version: 2,
    revision: legacy.data.revision + 1,
    connections: legacy.data.connections,
  };

  db.transaction(() => {
    setState(db, STATE_NWC_CONNECTIONS, serializeState(migrated));
  })();

  return migrated;
}

function writeState(db: CoreDb, state: NwcConnectionState): void {
  setState(db, STATE_NWC_CONNECTIONS, serializeState(state));
}

export function migrateNwcConnectionState(db: CoreDb): void {
  loadState(db);
}

function normalizeLabel(label: string): string {
  const normalized = label.trim();

  if (normalized.length === 0 || normalized.length > 80) {
    throw new NwcStateError('NWC connection label must be 1-80 characters.');
  }

  return normalized;
}

function findStoredConnection(
  state: NwcConnectionState,
  selector: string,
): StoredNwcConnection | null {
  const normalized = selector.trim().toLowerCase();

  return (
    state.connections.find(
      (connection) =>
        connection.id.toLowerCase() === normalized ||
        connection.label.toLowerCase() === normalized,
    ) ?? null
  );
}

function toSummary(connection: StoredNwcConnection): NwcConnectionSummary {
  let safe: SafeNwcConnection;

  try {
    safe = safeNwcConnection(parseNwcConnectionUri(connection.connectionUri));
  } catch {
    throw new NwcStateError();
  }

  return {
    id: connection.id,
    label: connection.label,
    ...safe,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    verifiedAt: connection.verifiedAt,
    walletAlias: connection.walletAlias,
    methods: [...connection.methods],
  };
}

export function listNwcConnections(db: CoreDb): NwcConnectionSummary[] {
  return loadState(db).connections.map(toSummary);
}

export function getStoredNwcConnection(
  db: CoreDb,
  selector: string,
): (StoredNwcConnection & { connection: NwcConnection }) | null {
  const stored = findStoredConnection(loadState(db), selector);

  if (!stored) {
    return null;
  }

  try {
    return {
      ...stored,
      methods: [...stored.methods],
      connection: parseNwcConnectionUri(stored.connectionUri),
    };
  } catch {
    throw new NwcStateError();
  }
}

export function addNwcConnection({
  db,
  label,
  connectionUri,
}: AddNwcConnectionProps): StoredNwcConnection {
  const normalizedLabel = normalizeLabel(label);

  parseNwcConnectionUri(connectionUri);

  const mutate = db.transaction(() => {
    const state = loadState(db);

    if (
      state.connections.some(
        (connection) =>
          connection.label.toLowerCase() === normalizedLabel.toLowerCase(),
      )
    ) {
      throw new NwcStateError(
        `An NWC connection named ${JSON.stringify(normalizedLabel)} already exists.`,
      );
    }

    const now = Date.now();

    const connection: StoredNwcConnection = {
      id: randomUUID(),
      label: normalizedLabel,
      connectionUri: connectionUri.trim(),
      createdAt: now,
      updatedAt: now,
      verifiedAt: null,
      walletAlias: null,
      methods: [],
    };

    writeState(db, {
      ...state,
      revision: state.revision + 1,
      connections: [...state.connections, connection],
    });

    return connection;
  });

  return mutate();
}

export function updateNwcConnectionVerification({
  db,
  id,
  walletAlias,
  methods,
  verifiedAt = Date.now(),
}: UpdateNwcVerificationProps): StoredNwcConnection {
  const mutate = db.transaction(() => {
    const state = loadState(db);
    const existing = findStoredConnection(state, id);

    if (!existing) {
      throw new NwcStateError('NWC connection not found.');
    }

    const updated: StoredNwcConnection = {
      ...existing,
      updatedAt: Date.now(),
      verifiedAt,
      walletAlias,
      methods: [...new Set(methods)].sort(),
    };

    writeState(db, {
      ...state,
      revision: state.revision + 1,
      connections: state.connections.map((connection) =>
        connection.id === existing.id ? updated : connection,
      ),
    });

    return updated;
  });

  return mutate();
}

export function renameNwcConnection(
  db: CoreDb,
  selector: string,
  label: string,
): StoredNwcConnection {
  const normalizedLabel = normalizeLabel(label);

  const mutate = db.transaction(() => {
    const state = loadState(db);
    const existing = findStoredConnection(state, selector);

    if (!existing) {
      throw new NwcStateError('NWC connection not found.');
    }

    if (
      state.connections.some(
        (connection) =>
          connection.id !== existing.id &&
          connection.label.toLowerCase() === normalizedLabel.toLowerCase(),
      )
    ) {
      throw new NwcStateError(
        `An NWC connection named ${JSON.stringify(normalizedLabel)} already exists.`,
      );
    }

    const updated = {
      ...existing,
      label: normalizedLabel,
      updatedAt: Date.now(),
    };

    writeState(db, {
      ...state,
      revision: state.revision + 1,
      connections: state.connections.map((connection) =>
        connection.id === existing.id ? updated : connection,
      ),
    });

    return updated;
  });

  return mutate();
}

export function removeNwcConnection(
  db: CoreDb,
  selector: string,
): StoredNwcConnection | null {
  const mutate = db.transaction(() => {
    const state = loadState(db);
    const existing = findStoredConnection(state, selector);

    if (!existing) {
      return null;
    }

    writeState(db, {
      ...state,
      revision: state.revision + 1,
      connections: state.connections.filter(
        (connection) => connection.id !== existing.id,
      ),
    });

    return existing;
  });

  return mutate();
}
