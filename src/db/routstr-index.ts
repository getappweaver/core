import type { CoreDb } from './shared';

export type RoutstrIndexedProvider = {
  providerKey: string;
  pubkey: string;
  d: string;
  endpointUrl: string;
  mints: string[];
  version: string | null;
  announcementCreatedAt: number;
  announcementEventId: string;
  discoveredAtMs: number;
  modelsFetchedAtMs: number | null;
  modelsFetchError: string | null;
};

export type RoutstrIndexedModelProvider = {
  modelId: string;
  providerKey: string;
  providerPubkey: string;
  providerD: string;
  endpointUrl: string;
  modelName: string | null;
  contextLength: number | null;
  inputPrice: string | null;
  outputPrice: string | null;
  requestPrice: string | null;
  inputPriceNumber: number | null;
  outputPriceNumber: number | null;
  requestPriceNumber: number | null;
  priceJson: string | null;
  modelJson: string;
  fetchedAtMs: number;
};

export type RoutstrUniqueModelRow = {
  modelId: string;
  providerCount: number;
  cheapestInputPrice: number | null;
  cheapestOutputPrice: number | null;
  cheapestRequestPrice: number | null;
  newestFetchedAtMs: number;
};

type UpsertRoutstrIndexedProviderProps = {
  db: CoreDb;
  provider: RoutstrIndexedProvider;
};

type ReplaceRoutstrProviderModelsProps = {
  db: CoreDb;
  providerKey: string;
  models: RoutstrIndexedModelProvider[];
  fetchedAtMs: number;
  fetchError: string | null;
};

type ListRoutstrUniqueModelsProps = {
  db: CoreDb;
  filter: string | null;
  minFetchedAtMs: number | null;
  limit: number;
};

type ListRoutstrModelProvidersProps = {
  db: CoreDb;
  modelId: string;
  minFetchedAtMs: number | null;
};

export function createRoutstrIndexTables(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS routstr_providers (
      provider_key TEXT PRIMARY KEY,
      pubkey TEXT NOT NULL,
      d TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      mints_json TEXT NOT NULL,
      version TEXT,
      announcement_created_at INTEGER NOT NULL,
      announcement_event_id TEXT NOT NULL,
      discovered_at_ms INTEGER NOT NULL,
      models_fetched_at_ms INTEGER,
      models_fetch_error TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS routstr_model_providers (
      model_id TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      provider_pubkey TEXT NOT NULL,
      provider_d TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      model_name TEXT,
      context_length INTEGER,
      input_price TEXT,
      output_price TEXT,
      request_price TEXT,
      input_price_number REAL,
      output_price_number REAL,
      request_price_number REAL,
      price_json TEXT,
      model_json TEXT NOT NULL,
      fetched_at_ms INTEGER NOT NULL,
      PRIMARY KEY (model_id, provider_key),
      FOREIGN KEY (provider_key) REFERENCES routstr_providers(provider_key) ON DELETE CASCADE
    )
  `);

  db.run(
    'CREATE INDEX IF NOT EXISTS idx_routstr_model_providers_model_id ON routstr_model_providers (model_id)',
  );

  db.run(
    'CREATE INDEX IF NOT EXISTS idx_routstr_model_providers_fetched ON routstr_model_providers (fetched_at_ms)',
  );

  db.run(
    'CREATE INDEX IF NOT EXISTS idx_routstr_providers_models_fetched ON routstr_providers (models_fetched_at_ms)',
  );
}

export function upsertRoutstrIndexedProvider({
  db,
  provider,
}: UpsertRoutstrIndexedProviderProps): void {
  db.run(
    `INSERT INTO routstr_providers (
       provider_key, pubkey, d, endpoint_url, mints_json, version,
       announcement_created_at, announcement_event_id, discovered_at_ms,
       models_fetched_at_ms, models_fetch_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_key) DO UPDATE SET
       pubkey = excluded.pubkey,
       d = excluded.d,
       endpoint_url = excluded.endpoint_url,
       mints_json = excluded.mints_json,
       version = excluded.version,
       announcement_created_at = excluded.announcement_created_at,
       announcement_event_id = excluded.announcement_event_id,
       discovered_at_ms = excluded.discovered_at_ms`,
    [
      provider.providerKey,
      provider.pubkey,
      provider.d,
      provider.endpointUrl,
      JSON.stringify(provider.mints),
      provider.version,
      provider.announcementCreatedAt,
      provider.announcementEventId,
      provider.discoveredAtMs,
      provider.modelsFetchedAtMs,
      provider.modelsFetchError,
    ],
  );
}

export function replaceRoutstrProviderModels({
  db,
  providerKey,
  models,
  fetchedAtMs,
  fetchError,
}: ReplaceRoutstrProviderModelsProps): void {
  const transaction = db.transaction(() => {
    if (fetchError === null) {
      db.run('DELETE FROM routstr_model_providers WHERE provider_key = ?', [
        providerKey,
      ]);

      for (const model of models) {
        db.run(
          `INSERT OR REPLACE INTO routstr_model_providers (
             model_id, provider_key, provider_pubkey, provider_d, endpoint_url,
             model_name, context_length, input_price, output_price, request_price,
             input_price_number, output_price_number, request_price_number,
             price_json, model_json, fetched_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            model.modelId,
            model.providerKey,
            model.providerPubkey,
            model.providerD,
            model.endpointUrl,
            model.modelName,
            model.contextLength,
            model.inputPrice,
            model.outputPrice,
            model.requestPrice,
            model.inputPriceNumber,
            model.outputPriceNumber,
            model.requestPriceNumber,
            model.priceJson,
            model.modelJson,
            model.fetchedAtMs,
          ],
        );
      }
    }

    db.run(
      `UPDATE routstr_providers
       SET models_fetched_at_ms = ?, models_fetch_error = ?
       WHERE provider_key = ?`,
      [fetchedAtMs, fetchError, providerKey],
    );
  });

  transaction();
}

export function listRoutstrUniqueModels({
  db,
  filter,
  minFetchedAtMs,
  limit,
}: ListRoutstrUniqueModelsProps): RoutstrUniqueModelRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter && filter.trim() !== '') {
    where.push('model_id LIKE ?');
    params.push(`%${filter.trim()}%`);
  }

  if (minFetchedAtMs !== null) {
    where.push('fetched_at_ms >= ?');
    params.push(minFetchedAtMs);
  }

  params.push(limit);

  return db
    .prepare(
      `SELECT
         model_id AS modelId,
         COUNT(*) AS providerCount,
         MIN(input_price_number) AS cheapestInputPrice,
         MIN(output_price_number) AS cheapestOutputPrice,
         MIN(request_price_number) AS cheapestRequestPrice,
         MAX(fetched_at_ms) AS newestFetchedAtMs
       FROM routstr_model_providers
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY model_id
       ORDER BY model_id COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .all(...params) as RoutstrUniqueModelRow[];
}

export function listRoutstrModelProviders({
  db,
  modelId,
  minFetchedAtMs,
}: ListRoutstrModelProvidersProps): RoutstrIndexedModelProvider[] {
  const params: (string | number)[] = [modelId];
  const staleFilter = minFetchedAtMs === null ? '' : 'AND fetched_at_ms >= ?';

  if (minFetchedAtMs !== null) {
    params.push(minFetchedAtMs);
  }

  return db
    .prepare(
      `SELECT
         model_id AS modelId,
         provider_key AS providerKey,
         provider_pubkey AS providerPubkey,
         provider_d AS providerD,
         endpoint_url AS endpointUrl,
         model_name AS modelName,
         context_length AS contextLength,
         input_price AS inputPrice,
         output_price AS outputPrice,
         request_price AS requestPrice,
         input_price_number AS inputPriceNumber,
         output_price_number AS outputPriceNumber,
         request_price_number AS requestPriceNumber,
         price_json AS priceJson,
         model_json AS modelJson,
         fetched_at_ms AS fetchedAtMs
       FROM routstr_model_providers
       WHERE model_id = ? ${staleFilter}
       ORDER BY
         COALESCE(input_price_number, 999999999) ASC,
         COALESCE(output_price_number, 999999999) ASC,
         endpoint_url COLLATE NOCASE ASC`,
    )
    .all(...params) as RoutstrIndexedModelProvider[];
}

export function countRoutstrUniqueModels(db: CoreDb): number {
  const row = db
    .prepare(
      'SELECT COUNT(DISTINCT model_id) AS count FROM routstr_model_providers',
    )
    .get() as { count: number } | undefined;

  return row?.count ?? 0;
}

export function countRoutstrModelProviderRows(db: CoreDb): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM routstr_model_providers')
    .get() as { count: number } | undefined;

  return row?.count ?? 0;
}

export function countRoutstrProviders(db: CoreDb): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM routstr_providers')
    .get() as { count: number } | undefined;

  return row?.count ?? 0;
}

export function getNewestRoutstrModelFetchMs(db: CoreDb): number | null {
  const row = db
    .prepare(
      'SELECT MAX(fetched_at_ms) AS newestFetchedAtMs FROM routstr_model_providers',
    )
    .get() as { newestFetchedAtMs: number | null } | undefined;

  return row?.newestFetchedAtMs ?? null;
}
