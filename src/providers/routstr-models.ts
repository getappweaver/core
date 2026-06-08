import type { NostrEvent } from 'nostr-tools';
import type { SimplePool } from 'nostr-tools/pool';

import type { CoreDb, RoutstrIndexedModelProvider } from '@src/db';
import {
  replaceRoutstrProviderModels,
  upsertRoutstrIndexedProvider,
} from '@src/db';

export type RoutstrModel = {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
  pricing?: unknown;
  price?: unknown;
  prompt_price?: unknown;
  completion_price?: unknown;
  input_price?: unknown;
  output_price?: unknown;
  request_price?: unknown;
};

export type OpenCodeModelEntry = {
  name: string;
  limit?: { context: number; output: number };
  modalities?: { input?: string[]; output?: string[] };
};

export function buildOpenCodeModelEntry(
  model: RoutstrModel,
): OpenCodeModelEntry {
  const entry: OpenCodeModelEntry = {
    name: model.name ?? model.id,
  };

  const hasContext = model.context_length != null;
  const hasOutput = model.top_provider?.max_completion_tokens != null;

  if (hasContext || hasOutput) {
    entry.limit = {
      context: model.context_length ?? 131072,
      output: model.top_provider?.max_completion_tokens ?? 16384,
    };
  }

  const inputMods = model.architecture?.input_modalities;
  const outputMods = model.architecture?.output_modalities;

  if (inputMods?.length || outputMods?.length) {
    entry.modalities = {
      ...(inputMods?.length ? { input: inputMods } : {}),
      ...(outputMods?.length ? { output: outputMods } : {}),
    };
  }

  return entry;
}

const ROUTSTR_BASE_URL = 'https://api.routstr.com/v1';
export const ROUTSTR_MODEL_INDEX_TTL_MS = 60 * 60 * 1000;

const ROUTSTR_PROVIDER_KIND = 38421;
const ROUTSTR_DISCOVERY_MAX_WAIT_MS = 5_000;
const ROUTSTR_PROVIDER_FETCH_TIMEOUT_MS = 10_000;

export const ROUTSTR_DISCOVERY_RELAYS = [
  'wss://relay.routstr.com',
  'wss://nos.lol',
  'wss://relay.primal.net',
] as const;

type ParsedProviderAnnouncement = {
  providerKey: string;
  pubkey: string;
  d: string;
  endpointUrl: string;
  mints: string[];
  version: string | null;
  announcementCreatedAt: number;
  announcementEventId: string;
};

type SyncRoutstrModelIndexProps = {
  db: CoreDb;
  pool: SimplePool;
};

export type SyncRoutstrModelIndexResult = {
  discoveredProviders: number;
  fetchedProviders: number;
  failedProviders: number;
  modelProviderRows: number;
  uniqueModels: number;
  fetchedAtMs: number;
};

function getTagValue(event: NostrEvent, name: string): string | null {
  return event.tags.find((tag) => tag[0] === name && tag[1])?.[1] ?? null;
}

function getTagValues(event: NostrEvent, name: string): string[] {
  return event.tags
    .filter((tag) => tag[0] === name && tag[1])
    .map((tag) => tag[1]);
}

function normalizeProviderEndpoint(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }

    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');

    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function providerApiUrl(endpointUrl: string, path: string): string {
  const base = endpointUrl.replace(/\/+$/, '');

  if (base.endsWith('/v1')) {
    return `${base}${path}`;
  }

  return `${base}/v1${path}`;
}

function parseProviderAnnouncement(
  event: NostrEvent,
): ParsedProviderAnnouncement | null {
  const d = getTagValue(event, 'd');

  const endpointUrl = getTagValues(event, 'u')
    .map(normalizeProviderEndpoint)
    .find((url) => url !== null);

  if (!d || !endpointUrl) {
    return null;
  }

  return {
    providerKey: `${event.pubkey}:${d}`,
    pubkey: event.pubkey,
    d,
    endpointUrl,
    mints: getTagValues(event, 'mint'),
    version: getTagValue(event, 'version'),
    announcementCreatedAt: event.created_at,
    announcementEventId: event.id,
  };
}

async function discoverRoutstrProviders(
  pool: SimplePool,
): Promise<ParsedProviderAnnouncement[]> {
  const eventsById = new Map<string, NostrEvent>();

  const events = await new Promise<NostrEvent[]>((resolve) => {
    let settled = false;

    const timer = setTimeout(
      () => finish('timeout'),
      ROUTSTR_DISCOVERY_MAX_WAIT_MS,
    );

    const sub = pool.subscribeMany(
      [...ROUTSTR_DISCOVERY_RELAYS],
      { kinds: [ROUTSTR_PROVIDER_KIND], limit: 200 },
      {
        maxWait: ROUTSTR_DISCOVERY_MAX_WAIT_MS,
        onevent: (event) => {
          eventsById.set(event.id, event as NostrEvent);
        },
        oneose: () => finish('eose'),
        onclose: () => finish('closed'),
      },
    );

    function finish(reason: 'closed' | 'eose' | 'timeout'): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      sub.close(`routstr discovery ${reason}`);
      resolve([...eventsById.values()]);
    }
  });

  const latestByProvider = new Map<string, ParsedProviderAnnouncement>();

  for (const event of events) {
    const parsed = parseProviderAnnouncement(event);

    if (!parsed) {
      continue;
    }

    const existing = latestByProvider.get(parsed.providerKey);

    if (
      !existing ||
      parsed.announcementCreatedAt > existing.announcementCreatedAt
    ) {
      latestByProvider.set(parsed.providerKey, parsed);
    }
  }

  return [...latestByProvider.values()];
}

function modelArrayFromResponse(data: unknown): RoutstrModel[] {
  if (Array.isArray(data)) {
    return data as RoutstrModel[];
  }

  if (typeof data !== 'object' || data === null) {
    return [];
  }

  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj.data)) {
    return obj.data as RoutstrModel[];
  }

  if (Array.isArray(obj.models)) {
    return obj.models as RoutstrModel[];
  }

  return [];
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringFromUnknown(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function valueByKeys(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] != null) {
      return source[key];
    }
  }

  return null;
}

function priceObjectForModel(
  model: RoutstrModel,
): Record<string, unknown> | null {
  const source = model.pricing ?? model.price;

  return typeof source === 'object' && source !== null
    ? (source as Record<string, unknown>)
    : null;
}

type PriceValueForModelProps = {
  model: RoutstrModel;
  keys: string[];
  directKeys: (keyof RoutstrModel)[];
};

function priceValueForModel({
  model,
  keys,
  directKeys,
}: PriceValueForModelProps): unknown {
  for (const key of directKeys) {
    if (model[key] != null) {
      return model[key];
    }
  }

  const prices = priceObjectForModel(model);

  return prices ? valueByKeys(prices, keys) : null;
}

type ToIndexedModelProviderProps = {
  model: RoutstrModel;
  provider: ParsedProviderAnnouncement;
  fetchedAtMs: number;
};

function toIndexedModelProvider({
  model,
  provider,
  fetchedAtMs,
}: ToIndexedModelProviderProps): RoutstrIndexedModelProvider | null {
  if (!model.id || typeof model.id !== 'string') {
    return null;
  }

  const inputPrice = priceValueForModel({
    model,
    keys: [
      'input',
      'prompt',
      'input_price',
      'prompt_price',
      'input_cost_per_token',
    ],
    directKeys: ['input_price', 'prompt_price'],
  });

  const outputPrice = priceValueForModel({
    model,
    keys: [
      'output',
      'completion',
      'output_price',
      'completion_price',
      'output_cost_per_token',
    ],
    directKeys: ['output_price', 'completion_price'],
  });

  const requestPrice = priceValueForModel({
    model,
    keys: ['request', 'request_price', 'per_request'],
    directKeys: ['request_price'],
  });

  const priceObject = priceObjectForModel(model);

  return {
    modelId: model.id,
    providerKey: provider.providerKey,
    providerPubkey: provider.pubkey,
    providerD: provider.d,
    endpointUrl: provider.endpointUrl,
    modelName: model.name ?? null,
    contextLength: model.context_length ?? null,
    inputPrice: stringFromUnknown(inputPrice),
    outputPrice: stringFromUnknown(outputPrice),
    requestPrice: stringFromUnknown(requestPrice),
    inputPriceNumber: numberFromUnknown(inputPrice),
    outputPriceNumber: numberFromUnknown(outputPrice),
    requestPriceNumber: numberFromUnknown(requestPrice),
    priceJson: priceObject ? JSON.stringify(priceObject) : null,
    modelJson: JSON.stringify(model),
    fetchedAtMs,
  };
}

async function fetchProviderModels(
  provider: ParsedProviderAnnouncement,
): Promise<RoutstrModel[]> {
  const res = await fetch(providerApiUrl(provider.endpointUrl, '/models'), {
    signal: AbortSignal.timeout(ROUTSTR_PROVIDER_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`/v1/models returned ${res.status}`);
  }

  return modelArrayFromResponse(await res.json());
}

export async function fetchRoutstrModels(): Promise<RoutstrModel[]> {
  const res = await fetch(`${ROUTSTR_BASE_URL}/models`);

  if (!res.ok) {
    throw new Error(`/v1/models returned ${res.status}`);
  }

  const data = await res.json();

  return data.data ?? data.models ?? [];
}

export async function syncRoutstrModelIndex({
  db,
  pool,
}: SyncRoutstrModelIndexProps): Promise<SyncRoutstrModelIndexResult> {
  const fetchedAtMs = Date.now();
  const providers = await discoverRoutstrProviders(pool);
  let fetchedProviders = 0;
  let failedProviders = 0;
  let modelProviderRows = 0;
  const uniqueModels = new Set<string>();

  for (const provider of providers) {
    upsertRoutstrIndexedProvider({
      db,
      provider: {
        ...provider,
        discoveredAtMs: fetchedAtMs,
        modelsFetchedAtMs: null,
        modelsFetchError: null,
      },
    });

    try {
      const models = await fetchProviderModels(provider);

      const indexedModels = models
        .map((model) =>
          toIndexedModelProvider({ model, provider, fetchedAtMs }),
        )
        .filter((model) => model !== null);

      replaceRoutstrProviderModels({
        db,
        providerKey: provider.providerKey,
        models: indexedModels,
        fetchedAtMs,
        fetchError: null,
      });

      fetchedProviders += 1;
      modelProviderRows += indexedModels.length;
      indexedModels.forEach((model) => uniqueModels.add(model.modelId));
    } catch (err) {
      failedProviders += 1;

      replaceRoutstrProviderModels({
        db,
        providerKey: provider.providerKey,
        models: [],
        fetchedAtMs,
        fetchError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    discoveredProviders: providers.length,
    fetchedProviders,
    failedProviders,
    modelProviderRows,
    uniqueModels: uniqueModels.size,
    fetchedAtMs,
  };
}
