import type { WebOptionFieldHintValue } from '@src/web/ui-schema';

import type {
  CommandDetail,
  CommandField,
  CommandPayload,
  CommandSubcommand,
} from './types';

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatFieldLabel(field: CommandField): string {
  if (field.flag) {
    return field.shortFlag ? `${field.shortFlag}, ${field.flag}` : field.flag;
  }

  return field.name;
}

type FormatWebFormOptionHintProps = {
  field: CommandField;
  currentValue: unknown;
  hint: WebOptionFieldHintValue;
};

/** Renders `optionHints` for timeline forms: object `{ hint }` + integer field → `#<id> = <hint>`. */
export function formatWebFormOptionHint({
  field,
  currentValue,
  hint,
}: FormatWebFormOptionHintProps): string {
  if (typeof hint === 'string') {
    return hint;
  }

  const text = hint.hint.replace(/\s+/g, ' ').trim();

  if (field.kind !== 'integer') {
    return text;
  }

  let n: number;

  if (typeof currentValue === 'number' && !Number.isNaN(currentValue)) {
    n = currentValue;
  } else if (
    typeof currentValue === 'string' &&
    currentValue.trim().length > 0
  ) {
    n = Number.parseInt(currentValue, 10);
  } else {
    return text;
  }

  if (Number.isNaN(n)) {
    return text;
  }

  return `#${n} = ${text}`;
}

export function matchesCommandToken(
  command: { name: string; aliases: string[] },
  token: string,
): boolean {
  const normalized = token.trim().toLowerCase();

  return (
    command.name.toLowerCase() === normalized ||
    command.aliases.some((alias) => alias.toLowerCase() === normalized)
  );
}

export function defaultPayload(subcommand: CommandSubcommand): CommandPayload {
  const payload: CommandPayload = { arguments: {}, options: {} };

  for (const argument of subcommand.arguments) {
    if (argument.webDefaultValue !== undefined) {
      payload.arguments[argument.name] = argument.webDefaultValue;
    }
  }

  for (const option of subcommand.options) {
    if (option.webDefaultValue !== undefined) {
      payload.options[option.name] = option.webDefaultValue;
    } else if (option.kind === 'boolean') {
      payload.options[option.name] = false;
    }
  }

  return payload;
}

/** Merge CLI defaults with prefilled web action arguments/options (e.g. `/todo add` with `--under`). */
export function mergeCommandPayload(
  subcommand: CommandSubcommand,
  overlay: CommandPayload | undefined,
): CommandPayload {
  const base = defaultPayload(subcommand);

  if (!overlay) {
    return base;
  }

  return {
    arguments: { ...base.arguments, ...overlay.arguments },
    options: { ...base.options, ...overlay.options },
  };
}

export function payloadFromPathTokens(
  subcommand: CommandSubcommand,
  tokens: string[],
): CommandPayload {
  const payload = defaultPayload(subcommand);
  const positional: string[] = [];
  const optionByFlag = new Map<string, CommandField>();

  for (const option of subcommand.options) {
    if (option.flag) {
      optionByFlag.set(option.flag, option);
    }

    if (option.shortFlag) {
      optionByFlag.set(option.shortFlag, option);
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';

    if (!token.startsWith('-')) {
      positional.push(token);
      continue;
    }

    const option = optionByFlag.get(token);

    if (!option) {
      throw new Error(`Unknown flag: ${token}`);
    }

    if (option.kind === 'boolean') {
      payload.options[option.name] = true;
      continue;
    }

    const next = tokens[i + 1];

    if (next == null || next.startsWith('-')) {
      throw new Error(`Missing value for ${token}`);
    }

    payload.options[option.name] =
      option.kind === 'integer' ? Number.parseInt(next, 10) : next;

    i += 1;
  }

  let index = 0;

  for (const argument of subcommand.arguments) {
    if (argument.variadic) {
      payload.arguments[argument.name] = positional.slice(index).join(' ');
      break;
    }

    if (index >= positional.length) {
      break;
    }

    payload.arguments[argument.name] =
      argument.kind === 'integer'
        ? Number.parseInt(positional[index] ?? '', 10)
        : (positional[index] ?? '');

    index += 1;
  }

  return payload;
}

export function hasMissingRequiredInputs(
  subcommand: CommandSubcommand,
  payload: CommandPayload,
): boolean {
  for (const argument of subcommand.arguments) {
    if (argument.required !== true) {
      continue;
    }

    const value = payload.arguments[argument.name];

    if (value === '' || value == null) {
      return true;
    }
  }

  for (const option of subcommand.options) {
    if (option.required !== true) {
      continue;
    }

    const value = payload.options[option.name];

    if (option.kind === 'boolean') {
      if (value !== true) {
        return true;
      }

      continue;
    }

    if (value === '' || value == null) {
      return true;
    }
  }

  return false;
}

export function getSubcommandQueryFromPalette(
  command: CommandDetail,
  rawQuery: string,
): string {
  let query = rawQuery.trim().toLowerCase();

  for (const token of [command.name, ...command.aliases]) {
    const normalized = token.toLowerCase();

    if (query === normalized) {
      return '';
    }

    if (query.startsWith(`${normalized} `)) {
      query = query.slice(normalized.length + 1).trimStart();
      break;
    }
  }

  return query;
}

export function scoreCommandMatch(
  command: CommandDetail,
  query: string,
): number {
  const q = query.trim().toLowerCase();

  if (!q) {
    return 0;
  }

  const names = [command.name, ...command.aliases].map((value) =>
    value.toLowerCase(),
  );

  const summary = command.summary.toLowerCase();

  if (names.includes(q)) {
    return 1000;
  }

  if (names.some((value) => value.startsWith(q))) {
    return 800;
  }

  if (names.some((value) => value.includes(q))) {
    return 650;
  }

  if (summary.includes(q)) {
    return 100;
  }

  const subcommandScore = Math.max(
    ...command.subcommands.map((subcommand) =>
      scoreSubcommandMatch(subcommand, q),
    ),
  );

  return subcommandScore;
}

export function scoreSubcommandMatch(
  subcommand: CommandSubcommand,
  query: string,
): number {
  const q = query.trim().toLowerCase();

  if (!q) {
    return 0;
  }

  const names = [subcommand.name, ...subcommand.aliases].map((value) =>
    value.toLowerCase(),
  );

  const summary = subcommand.summary.toLowerCase();
  const usage = subcommand.usage.toLowerCase();

  if (names.includes(q)) {
    return 1000;
  }

  if (names.some((value) => value.startsWith(q))) {
    return 800;
  }

  if (names.some((value) => value.includes(q))) {
    return 650;
  }

  if (usage.startsWith(q)) {
    return 500;
  }

  if (usage.includes(q)) {
    return 350;
  }

  if (summary.includes(q)) {
    return 100;
  }

  return -1;
}

export function summarizeInvocation(
  command: string,
  subcommand: string,
  values: CommandPayload,
): string {
  const parts = [`/${command}`];

  if (!(command === 'help' && subcommand === 'topic')) {
    parts.push(subcommand);
  }

  for (const value of Object.values(values.arguments)) {
    if (value !== '' && value != null) {
      parts.push(String(value));
    }
  }

  for (const [key, value] of Object.entries(values.options)) {
    if (value === true) {
      parts.push(`--${key}`);
    } else if (value !== false && value !== '' && value != null) {
      parts.push(`--${key}`, String(value));
    }
  }

  return parts.join(' ');
}

export function getResultSubcommandTag(
  command: string,
  subcommand: string,
  values: CommandPayload,
): string {
  if (command === 'help' && subcommand === 'topic') {
    const path = values.arguments.path;

    if (Array.isArray(path)) {
      return path.join(' ');
    }

    if (typeof path === 'string' && path.trim().length > 0) {
      return path.trim();
    }
  }

  return subcommand;
}

// ---------------------------------------------------------------------------
// Auth token provider — set by NostrAuthProvider on init
// ---------------------------------------------------------------------------

let _getToken:
  | ((url: string, method: string) => Promise<string | null>)
  | null = null;

export function setAuthTokenProvider(
  fn: (url: string, method: string) => Promise<string | null>,
): void {
  _getToken = fn;
}

async function buildAuthHeaders(
  url: string,
  method: string,
): Promise<Record<string, string>> {
  if (!_getToken) {
    return {};
  }

  const absoluteUrl = new URL(url, window.location.href).toString();

  const token = await _getToken(absoluteUrl, method).catch(() => null);

  if (!token) {
    return {};
  }

  return { Authorization: `Nostr ${token}` };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function parseResponseBodyAsJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status} (empty body)`);
    }

    return {} as T;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      res.ok
        ? 'Invalid JSON in response'
        : `Request failed: ${res.status} — ${trimmed.slice(0, 160)}`,
    );
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const authHeaders = await buildAuthHeaders(url, 'GET');
  const res = await fetch(url, { headers: authHeaders });

  const data = await parseResponseBodyAsJson<T & { error?: string }>(res);

  if (!res.ok) {
    throw new Error(
      typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error: string }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed: ${res.status}`,
    );
  }

  return data as T;
}

export async function fetchJsonPublic<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await parseResponseBodyAsJson<T & { error?: string }>(res);

  if (!res.ok) {
    throw new Error(
      typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error: string }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed: ${res.status}`,
    );
  }

  return data as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const authHeaders = await buildAuthHeaders(url, 'POST');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  });

  const data = await parseResponseBodyAsJson<T & { error?: string }>(res);

  if (!res.ok) {
    throw new Error(
      typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error: string }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed: ${res.status}`,
    );
  }

  return data as T;
}

export async function deleteJson<T>(url: string, body: unknown): Promise<T> {
  const authHeaders = await buildAuthHeaders(url, 'DELETE');

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  });

  const data = await parseResponseBodyAsJson<T & { error?: string }>(res);

  if (!res.ok) {
    throw new Error(
      typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error: string }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed: ${res.status}`,
    );
  }

  return data as T;
}

export async function sendChatMessage(
  content: string,
): Promise<{ output: string }> {
  return postJson<{ ok: true; output: string }>('/api/chat', { content });
}
