import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'path';

import { spawnSync } from 'bun';
import YAML from 'yaml';

import { debug } from '@src/logger';

export type PermissionAction = 'allow' | 'ask' | 'deny';
export type PermissionObject = Record<string, PermissionAction>;
export type PermissionValue = PermissionAction | PermissionObject;
export type OpencodeAgentPermissionConfig =
  | PermissionAction
  | Record<string, PermissionValue>;

export type OpencodeAgentConfig = {
  name: string;
  description: string | null;
  model: string | null;
  color: string | null;
  steps: number | null;
  hidden: boolean;
  disabled: boolean;
};

export type OpencodeAgentDraftConfig = OpencodeAgentConfig & {
  mode: string | null;
  permission: OpencodeAgentPermissionConfig | null;
  systemPrompt: string;
};

export type OpencodeConfigSummary = {
  rootModel: string | null;
  agents: OpencodeAgentConfig[];
};

/** One model id from `opencode models` (`provider/model` per line). */
export type OpencodeModelCatalogEntry = {
  value: string;
  label: string;
};

export const OPENCODE_PERMISSION_TOOLS = [
  'read',
  'edit',
  'glob',
  'grep',
  'list',
  'bash',
  'task',
  'external_directory',
  'todowrite',
  'question',
  'webfetch',
  'websearch',
  'codesearch',
  'lsp',
  'doom_loop',
  'skill',
] as const;

export type OpencodePermissionTool = (typeof OPENCODE_PERMISSION_TOOLS)[number];

export type OpencodeAgentsDraft = {
  rootModel: string | null;
  agents: OpencodeAgentDraftConfig[];
};

type RawMarkdownAgentConfig = {
  description?: unknown;
  model?: unknown;
  color?: unknown;
  steps?: unknown;
  hidden?: unknown;
  disable?: unknown;
  permission?: unknown;
  mode?: unknown;
};

type RawOpencodeConfig = {
  model?: unknown;
  default_agent?: unknown;
  agent?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SaveOpencodeAgentInput = {
  currentName: string | null;
  name: string;
  description: string | null;
  model: string | null;
  color: string | null;
  steps: number | null;
  hidden: boolean;
  disabled: boolean;
  mode: string | null;
  systemPrompt: string | null;
  permissionActions?: Partial<
    Record<OpencodePermissionTool, PermissionAction | null>
  >;
};

type OpencodeCliAgentInfo = {
  name: string;
  enabled: boolean | null;
};

const VALID_PERMISSION_ACTIONS = new Set<PermissionAction>([
  'allow',
  'ask',
  'deny',
]);

const opencodeModelCatalogCache = new Map<
  string,
  OpencodeModelCatalogEntry[]
>();

const opencodeAgentsCache = new Map<string, OpencodeAgentDraftConfig[]>();
const opencodeCliAgentsCache = new Map<string, OpencodeCliAgentInfo[] | null>();

function cloneCatalogEntries(
  entries: OpencodeModelCatalogEntry[],
): OpencodeModelCatalogEntry[] {
  return entries.map((e) => ({ value: e.value, label: e.label }));
}

function cloneAgentDraftEntries(
  entries: OpencodeAgentDraftConfig[],
): OpencodeAgentDraftConfig[] {
  return entries.map((entry) => ({
    ...entry,
    permission:
      entry.permission === null
        ? null
        : typeof entry.permission === 'string'
          ? entry.permission
          : JSON.parse(JSON.stringify(entry.permission)),
  }));
}

function cloneCliAgentEntries(
  entries: OpencodeCliAgentInfo[] | null,
): OpencodeCliAgentInfo[] | null {
  if (entries === null) {
    return null;
  }

  return entries.map((entry) => ({
    name: entry.name,
    enabled: entry.enabled,
  }));
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Number.isInteger(value) ? value : null;
}

function isPermissionAction(value: unknown): value is PermissionAction {
  return (
    typeof value === 'string' &&
    VALID_PERMISSION_ACTIONS.has(value as PermissionAction)
  );
}

function normalizePermissionObject(value: unknown): PermissionObject | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const out: PermissionObject = {};

  for (const [key, entry] of Object.entries(value)) {
    if (!isPermissionAction(entry)) {
      return null;
    }

    out[key] = entry;
  }

  return out;
}

function normalizePermissionValue(value: unknown): PermissionValue | null {
  if (isPermissionAction(value)) {
    return value;
  }

  return normalizePermissionObject(value);
}

function normalizeAgentPermission(
  value: unknown,
): OpencodeAgentPermissionConfig | null {
  if (isPermissionAction(value)) {
    return value;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const out: Record<string, PermissionValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizePermissionValue(entry);

    if (normalized === null) {
      return null;
    }

    out[key] = normalized;
  }

  return out;
}

function permissionValueToRaw(
  value: PermissionValue,
): PermissionAction | PermissionObject {
  if (typeof value === 'string') {
    return value;
  }

  return { ...value };
}

function agentPermissionToRaw(
  value: OpencodeAgentPermissionConfig | null,
): unknown {
  if (value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      permissionValueToRaw(entry),
    ]),
  );
}

export function getSimplePermissionActions(
  permission: OpencodeAgentPermissionConfig | null,
): Partial<Record<OpencodePermissionTool, PermissionAction>> {
  if (permission === null) {
    return {};
  }

  if (typeof permission === 'string') {
    return Object.fromEntries(
      OPENCODE_PERMISSION_TOOLS.map((tool) => [tool, permission]),
    ) as Partial<Record<OpencodePermissionTool, PermissionAction>>;
  }

  const out: Partial<Record<OpencodePermissionTool, PermissionAction>> = {};

  for (const tool of OPENCODE_PERMISSION_TOOLS) {
    const value = permission[tool];

    if (typeof value === 'string') {
      out[tool] = value;
    }
  }

  return out;
}

function mergePermissionActions(params: {
  existing: OpencodeAgentPermissionConfig | null;
  updates: Partial<Record<OpencodePermissionTool, PermissionAction | null>>;
}): OpencodeAgentPermissionConfig | null {
  const out: Record<string, PermissionValue> = {};

  if (params.existing && typeof params.existing === 'object') {
    for (const [key, value] of Object.entries(params.existing)) {
      if (typeof value === 'object') {
        out[key] = value;
      } else if (
        !OPENCODE_PERMISSION_TOOLS.includes(key as OpencodePermissionTool)
      ) {
        out[key] = value;
      }
    }
  }

  for (const tool of OPENCODE_PERMISSION_TOOLS) {
    const nextValue = params.updates[tool];

    if (nextValue) {
      out[tool] = nextValue;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

function getConfigPath(dmBotRoot: string): string {
  return join(dmBotRoot, 'opencode.json');
}

function getProjectAgentsDir(dmBotRoot: string): string {
  return join(dmBotRoot, '.opencode', 'agents');
}

function getTemplateAgentsDir(): string {
  return resolve(
    join(import.meta.dir, '..', '..', 'templates', 'opencode-agents'),
  );
}

function projectAgentFilePath(dmBotRoot: string, name: string): string {
  return join(getProjectAgentsDir(dmBotRoot), `${name}.md`);
}

function listTemplateAgentNamesSync(): string[] {
  const dir = getTemplateAgentsDir();

  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.slice(0, -3))
    .filter((entry) => entry.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function readTemplateAgentsSync(): OpencodeAgentDraftConfig[] {
  const names = listTemplateAgentNamesSync();
  const out: OpencodeAgentDraftConfig[] = [];
  const dir = getTemplateAgentsDir();

  for (const name of names) {
    try {
      const raw = readFileSync(join(dir, `${name}.md`), 'utf8');
      const { frontmatter, body } = splitMarkdownFrontmatter(raw);
      out.push(toMarkdownAgent({ name, frontmatter, body }));
    } catch {
      // ignore unreadable template file
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function parseRawConfig(raw: string): RawOpencodeConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      if (
        typeof Bun !== 'undefined' &&
        typeof Bun.JSONC?.parse === 'function'
      ) {
        parsed = Bun.JSONC.parse(raw);
      } else {
        return {};
      }
    } catch {
      return {};
    }
  }

  return typeof parsed === 'object' && parsed !== null
    ? (parsed as RawOpencodeConfig)
    : {};
}

async function readRawConfig(dmBotRoot: string): Promise<RawOpencodeConfig> {
  const filePath = getConfigPath(dmBotRoot);

  try {
    const raw = await readFile(filePath, 'utf8');

    return parseRawConfig(raw);
  } catch {
    return {};
  }
}

function readRawConfigSync(dmBotRoot: string): RawOpencodeConfig {
  const cfgPath = getConfigPath(dmBotRoot);

  if (!existsSync(cfgPath)) {
    return {};
  }

  try {
    return parseRawConfig(readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

function stripLegacyAgentKeys(config: RawOpencodeConfig): void {
  delete config.agent;
  delete config.default_agent;
}

/**
 * Clears the in-memory model catalog cache (one workspace or entire map).
 * Call after changing OpenCode config.
 */
export function invalidateOpencodeModelCatalogCache(dmBotRoot?: string): void {
  if (dmBotRoot === undefined) {
    opencodeModelCatalogCache.clear();

    return;
  }

  opencodeModelCatalogCache.delete(resolve(dmBotRoot));
}

export function invalidateOpencodeAgentsCache(dmBotRoot?: string): void {
  if (dmBotRoot === undefined) {
    opencodeAgentsCache.clear();
    opencodeCliAgentsCache.clear();

    return;
  }

  const key = resolve(dmBotRoot);
  opencodeAgentsCache.delete(key);
  opencodeCliAgentsCache.delete(key);
}

async function writeRawConfig(
  dmBotRoot: string,
  config: RawOpencodeConfig,
): Promise<void> {
  stripLegacyAgentKeys(config);

  await writeFile(
    getConfigPath(dmBotRoot),
    JSON.stringify(config, null, 2) + '\n',
    'utf8',
  );

  invalidateOpencodeModelCatalogCache(dmBotRoot);
  invalidateOpencodeAgentsCache(dmBotRoot);
}

function splitMarkdownFrontmatter(raw: string): {
  frontmatter: unknown;
  body: string;
} {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);

  if (!match) {
    return { frontmatter: {}, body: normalized.trim() };
  }

  let frontmatter: unknown = {};

  try {
    frontmatter = YAML.parse(match[1]) ?? {};
  } catch {
    frontmatter = {};
  }

  return {
    frontmatter,
    body: normalized.slice(match[0].length).trim(),
  };
}

function toMarkdownAgent(params: {
  name: string;
  frontmatter: unknown;
  body: string;
}): OpencodeAgentDraftConfig {
  const value =
    typeof params.frontmatter === 'object' && params.frontmatter !== null
      ? (params.frontmatter as RawMarkdownAgentConfig)
      : {};

  return {
    name: params.name,
    description: normalizeOptionalString(value.description),
    mode: normalizeOptionalString(value.mode),
    model: normalizeOptionalString(value.model),
    color: normalizeOptionalString(value.color),
    steps: normalizeOptionalInt(value.steps),
    hidden: value.hidden === true,
    disabled: value.disable === true,
    permission: normalizeAgentPermission(value.permission),
    systemPrompt: params.body,
  };
}

function toSummaryAgent(agent: OpencodeAgentDraftConfig): OpencodeAgentConfig {
  return {
    name: agent.name,
    description: agent.description,
    model: agent.model,
    color: agent.color,
    steps: agent.steps,
    hidden: agent.hidden,
    disabled: agent.disabled,
  };
}

function toSummary(params: {
  rootModel: string | null;
  agents: OpencodeAgentDraftConfig[];
}): OpencodeConfigSummary {
  return {
    rootModel: params.rootModel,
    agents: params.agents
      .map((entry) => toSummaryAgent(entry))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function serializePermissionValue(value: PermissionValue): unknown {
  if (typeof value === 'string') {
    return value;
  }

  return { ...value };
}

function serializePermission(
  permission: OpencodeAgentPermissionConfig | null,
): unknown {
  if (permission === null) {
    return undefined;
  }

  if (typeof permission === 'string') {
    return permission;
  }

  return Object.fromEntries(
    Object.entries(permission).map(([key, value]) => [
      key,
      serializePermissionValue(value),
    ]),
  );
}

function serializeMarkdownAgent(agent: OpencodeAgentDraftConfig): string {
  const fm: Record<string, unknown> = {};

  if (agent.description) {
    fm.description = agent.description;
  }

  if (agent.mode) {
    fm.mode = agent.mode;
  }

  if (agent.model) {
    fm.model = agent.model;
  }

  if (agent.color) {
    fm.color = agent.color;
  }

  if (typeof agent.steps === 'number') {
    fm.steps = agent.steps;
  }

  if (agent.hidden) {
    fm.hidden = true;
  }

  if (agent.disabled) {
    fm.disable = true;
  }

  const permission = serializePermission(agent.permission);

  if (permission !== undefined) {
    fm.permission = permission;
  }

  const frontmatterText = YAML.stringify(fm).trimEnd();
  const body = agent.systemPrompt.trim();

  if (body.length > 0) {
    return `---\n${frontmatterText}\n---\n\n${body}\n`;
  }

  return `---\n${frontmatterText}\n---\n`;
}

function listProjectAgentNamesSync(dmBotRoot: string): string[] {
  const dir = getProjectAgentsDir(dmBotRoot);

  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.slice(0, -3))
    .filter((entry) => entry.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
}

async function listProjectAgentNamesAsync(
  dmBotRoot: string,
): Promise<string[]> {
  const dir = getProjectAgentsDir(dmBotRoot);

  try {
    return (await readdir(dir))
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => entry.slice(0, -3))
      .filter((entry) => entry.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function tryListOpencodeCliAgents(
  dmBotRoot: string,
): OpencodeCliAgentInfo[] | null {
  try {
    const proc = spawnSync(['opencode', 'agent', 'list'], {
      cwd: dmBotRoot,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    });

    if (proc.exitCode !== 0) {
      debug(
        'opencode agent list non-zero exit',
        proc.exitCode,
        proc.stderr?.toString(),
      );

      return null;
    }

    const lines = (proc.stdout?.toString() ?? '')
      .replace(/\r\n/g, '\n')
      .split('\n');

    const out: OpencodeCliAgentInfo[] = [];
    let current: OpencodeCliAgentInfo | null = null;

    for (const line of lines) {
      const header = line.match(/^([A-Za-z0-9._-]+)\s+\([^)]+\)\s*$/);

      if (header) {
        current = { name: header[1], enabled: null };
        out.push(current);
        continue;
      }

      const trimmed = line.trim();

      if (current && trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed) as { enabled?: unknown };

          current.enabled =
            typeof parsed.enabled === 'boolean' ? parsed.enabled : null;
        } catch {
          // ignore
        }
      }
    }

    return out.length > 0 ? out : null;
  } catch (err) {
    debug('opencode agent list spawn error', err);

    return null;
  }
}

function getCachedOpencodeCliAgents(
  dmBotRoot: string,
): OpencodeCliAgentInfo[] | null {
  const key = resolve(dmBotRoot);
  const hit = opencodeCliAgentsCache.get(key);

  if (hit !== undefined) {
    return cloneCliAgentEntries(hit);
  }

  const listed = tryListOpencodeCliAgents(dmBotRoot);
  opencodeCliAgentsCache.set(key, cloneCliAgentEntries(listed));

  return cloneCliAgentEntries(listed);
}

function refreshOpencodeCliAgentsCache(dmBotRoot: string): void {
  const key = resolve(dmBotRoot);
  const listed = tryListOpencodeCliAgents(dmBotRoot);
  opencodeCliAgentsCache.set(key, cloneCliAgentEntries(listed));
}

function mergeCliAgentHints(params: {
  agents: OpencodeAgentDraftConfig[];
  cliAgents: OpencodeCliAgentInfo[] | null;
}): OpencodeAgentDraftConfig[] {
  if (!params.cliAgents) {
    return params.agents;
  }

  const cliMap = new Map(params.cliAgents.map((entry) => [entry.name, entry]));

  return params.agents.map((agent) => {
    const cli = cliMap.get(agent.name);

    if (!cli || cli.enabled === null) {
      return agent;
    }

    return {
      ...agent,
      disabled: cli.enabled === false ? true : agent.disabled,
    };
  });
}

function readProjectAgentsSync(dmBotRoot: string): OpencodeAgentDraftConfig[] {
  const names = listProjectAgentNamesSync(dmBotRoot);
  const fromFiles: OpencodeAgentDraftConfig[] = [];

  for (const name of names) {
    const path = projectAgentFilePath(dmBotRoot, name);

    try {
      const raw = readFileSync(path, 'utf8');
      const { frontmatter, body } = splitMarkdownFrontmatter(raw);
      fromFiles.push(toMarkdownAgent({ name, frontmatter, body }));
    } catch {
      // ignore unreadable file
    }
  }

  return mergeCliAgentHints({
    agents: fromFiles,
    cliAgents: getCachedOpencodeCliAgents(dmBotRoot),
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function readProjectAgentsAsync(
  dmBotRoot: string,
): Promise<OpencodeAgentDraftConfig[]> {
  const names = await listProjectAgentNamesAsync(dmBotRoot);
  const out: OpencodeAgentDraftConfig[] = [];

  for (const name of names) {
    const path = projectAgentFilePath(dmBotRoot, name);

    try {
      const raw = await readFile(path, 'utf8');
      const { frontmatter, body } = splitMarkdownFrontmatter(raw);
      out.push(toMarkdownAgent({ name, frontmatter, body }));
    } catch {
      // ignore unreadable file
    }
  }

  return mergeCliAgentHints({
    agents: out,
    cliAgents: getCachedOpencodeCliAgents(dmBotRoot),
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function toPersistedAgent(
  agent: OpencodeAgentDraftConfig,
): OpencodeAgentDraftConfig {
  return {
    ...agent,
    name: agent.name.trim(),
    description: agent.description?.trim() || null,
    mode: agent.mode?.trim() || null,
    model: agent.model?.trim() || null,
    color: agent.color?.trim() || null,
    systemPrompt: agent.systemPrompt.trim(),
    permission: normalizeAgentPermission(
      agentPermissionToRaw(agent.permission),
    ),
  };
}

async function writeProjectAgentMarkdown(
  dmBotRoot: string,
  agent: OpencodeAgentDraftConfig,
): Promise<void> {
  const dir = getProjectAgentsDir(dmBotRoot);
  mkdirSync(dir, { recursive: true });

  await writeFile(
    projectAgentFilePath(dmBotRoot, agent.name),
    serializeMarkdownAgent(agent),
    'utf8',
  );
}

async function deleteProjectAgentMarkdown(
  dmBotRoot: string,
  name: string,
): Promise<void> {
  try {
    await unlink(projectAgentFilePath(dmBotRoot, name));
  } catch {
    // ignore missing
  }
}

function assertValidDraft(draft: OpencodeAgentsDraft): void {
  const names = new Set<string>();

  for (const agent of draft.agents) {
    const name = agent.name.trim();

    if (name.length === 0) {
      throw new Error('agent name is required');
    }

    if (names.has(name)) {
      throw new Error(`duplicate agent name: ${name}`);
    }

    names.add(name);

    if (
      agent.permission !== null &&
      normalizeAgentPermission(agent.permission) === null
    ) {
      throw new Error(`invalid permission config for agent: ${name}`);
    }
  }
}

/**
 * Runs `opencode models` with `cwd: dmBotRoot` (newline-separated `provider/model` ids).
 * Returns `null` on failure or empty stdout.
 */
function tryListOpencodeCliModelIds(dmBotRoot: string): string[] | null {
  try {
    const proc = spawnSync(['opencode', 'models'], {
      cwd: dmBotRoot,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    });

    if (proc.exitCode !== 0) {
      debug(
        'opencode models non-zero exit',
        proc.exitCode,
        proc.stderr?.toString(),
      );

      return null;
    }

    const out = proc.stdout?.toString() ?? '';

    const lines = out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.length > 0 ? lines : null;
  } catch (err) {
    debug('opencode models spawn error', err);

    return null;
  }
}

export function readOpencodeConfig(dmBotRoot: string): OpencodeConfigSummary {
  const rawConfig = readRawConfigSync(dmBotRoot);
  const rootModel = normalizeOptionalString(rawConfig.model);
  const key = resolve(dmBotRoot);
  const hit = opencodeAgentsCache.get(key);

  const agents = hit
    ? cloneAgentDraftEntries(hit)
    : readProjectAgentsSync(dmBotRoot);

  if (!hit) {
    opencodeAgentsCache.set(key, cloneAgentDraftEntries(agents));
  }

  return toSummary({ rootModel, agents });
}

/**
 * Model ids for web pickers: **`opencode models`** only (newline-separated `provider/model`),
 * run with `cwd: dmBotRoot` so project + global OpenCode config match the CLI.
 * Results are **cached in memory** per resolved `dmBotRoot`.
 */
export function listOpencodeModelCatalog(
  dmBotRoot: string,
): OpencodeModelCatalogEntry[] {
  const key = resolve(dmBotRoot);
  const hit = opencodeModelCatalogCache.get(key);

  if (hit !== undefined) {
    return cloneCatalogEntries(hit);
  }

  const lines = tryListOpencodeCliModelIds(dmBotRoot);

  if (!lines) {
    debug('listOpencodeModelCatalog empty');

    return [];
  }

  const out = lines.map((value) => ({ value, label: value }));
  out.sort((a, b) => a.value.localeCompare(b.value));

  opencodeModelCatalogCache.set(key, out);

  debug(`listOpencodeModelCatalog count=${out.length}`);

  return cloneCatalogEntries(out);
}

export async function readOpencodeConfigAsync(
  dmBotRoot: string,
): Promise<OpencodeConfigSummary> {
  const rawConfig = await readRawConfig(dmBotRoot);
  const rootModel = normalizeOptionalString(rawConfig.model);
  const agents = await readProjectAgentsAsync(dmBotRoot);
  opencodeAgentsCache.set(resolve(dmBotRoot), cloneAgentDraftEntries(agents));

  return toSummary({ rootModel, agents });
}

export function getDefaultOpencodeAgentsDraft(): OpencodeAgentsDraft {
  return {
    rootModel: null,
    agents: cloneAgentDraftEntries(readTemplateAgentsSync()),
  };
}

export async function readOpencodeAgentsDraft(
  dmBotRoot: string,
): Promise<OpencodeAgentsDraft> {
  const rawConfig = await readRawConfig(dmBotRoot);
  const rootModel = normalizeOptionalString(rawConfig.model);
  const agents = await readProjectAgentsAsync(dmBotRoot);
  opencodeAgentsCache.set(resolve(dmBotRoot), cloneAgentDraftEntries(agents));

  return {
    rootModel,
    agents,
  };
}

export function getOpencodeAgentModel(
  config: OpencodeConfigSummary,
  agentName: string,
): string | null {
  return config.agents.find((agent) => agent.name === agentName)?.model ?? null;
}

export function getOpencodeAgent(
  config: Pick<OpencodeConfigSummary, 'agents'>,
  agentName: string,
): OpencodeAgentConfig | null {
  return config.agents.find((agent) => agent.name === agentName) ?? null;
}

export async function saveOpencodeAgentsDraft(
  dmBotRoot: string,
  draft: OpencodeAgentsDraft,
): Promise<OpencodeAgentsDraft> {
  assertValidDraft(draft);

  const persisted = draft.agents.map((entry) => toPersistedAgent(entry));
  const persistedNames = new Set(persisted.map((entry) => entry.name));
  const existingNames = await listProjectAgentNamesAsync(dmBotRoot);

  for (const existing of existingNames) {
    if (!persistedNames.has(existing)) {
      await deleteProjectAgentMarkdown(dmBotRoot, existing);
    }
  }

  for (const agent of persisted) {
    await writeProjectAgentMarkdown(dmBotRoot, agent);
  }

  const config = await readRawConfig(dmBotRoot);

  if (draft.rootModel) {
    config.model = draft.rootModel;
  } else {
    delete config.model;
  }

  await writeRawConfig(dmBotRoot, config);
  refreshOpencodeCliAgentsCache(dmBotRoot);

  return readOpencodeAgentsDraft(dmBotRoot);
}

export async function saveOpencodeAgent(
  dmBotRoot: string,
  input: SaveOpencodeAgentInput,
): Promise<OpencodeConfigSummary> {
  const nextName = input.name.trim();

  if (nextName.length === 0) {
    throw new Error('agent name is required');
  }

  const draft = await readOpencodeAgentsDraft(dmBotRoot);
  const previousName = input.currentName?.trim() ?? null;

  const baseAgent =
    (previousName
      ? draft.agents.find((entry) => entry.name === previousName)
      : null) ??
    draft.agents.find((entry) => entry.name === nextName) ??
    ({
      name: nextName,
      description: null,
      mode: 'primary',
      model: null,
      color: null,
      steps: null,
      hidden: false,
      disabled: false,
      permission: null,
      systemPrompt: '',
    } satisfies OpencodeAgentDraftConfig);

  const nextAgent: OpencodeAgentDraftConfig = {
    ...baseAgent,
    name: nextName,
    description: input.description?.trim() || null,
    mode: input.mode?.trim() || null,
    model: input.model?.trim() || null,
    color: input.color?.trim() || null,
    steps: typeof input.steps === 'number' ? input.steps : null,
    hidden: input.hidden,
    disabled: input.disabled,
    systemPrompt: input.systemPrompt?.trim() ?? baseAgent.systemPrompt,
  };

  if (input.permissionActions) {
    nextAgent.permission = mergePermissionActions({
      existing: baseAgent.permission,
      updates: input.permissionActions,
    });
  }

  if (previousName && previousName !== nextName) {
    await deleteProjectAgentMarkdown(dmBotRoot, previousName);
  }

  await writeProjectAgentMarkdown(dmBotRoot, toPersistedAgent(nextAgent));
  await writeRawConfig(dmBotRoot, await readRawConfig(dmBotRoot));
  refreshOpencodeCliAgentsCache(dmBotRoot);

  return readOpencodeConfig(dmBotRoot);
}

export async function deleteOpencodeAgent(
  dmBotRoot: string,
  agentName: string,
): Promise<OpencodeConfigSummary> {
  await deleteProjectAgentMarkdown(dmBotRoot, agentName);
  await writeRawConfig(dmBotRoot, await readRawConfig(dmBotRoot));
  refreshOpencodeCliAgentsCache(dmBotRoot);

  return readOpencodeConfig(dmBotRoot);
}

export async function setOpencodeRootModel(
  dmBotRoot: string,
  model: string | null,
): Promise<OpencodeConfigSummary> {
  const config = await readRawConfig(dmBotRoot);
  const nextModel = model?.trim() ?? '';

  if (nextModel.length > 0) {
    config.model = nextModel;
  } else {
    delete config.model;
  }

  await writeRawConfig(dmBotRoot, config);

  return readOpencodeConfig(dmBotRoot);
}

export async function restoreDefaultOpencodeAgents(
  dmBotRoot: string,
): Promise<OpencodeConfigSummary> {
  const defaults = readTemplateAgentsSync();
  const existingNames = await listProjectAgentNamesAsync(dmBotRoot);

  for (const name of existingNames) {
    await deleteProjectAgentMarkdown(dmBotRoot, name);
  }

  for (const agent of defaults) {
    await writeProjectAgentMarkdown(dmBotRoot, agent);
  }

  await writeRawConfig(dmBotRoot, await readRawConfig(dmBotRoot));
  refreshOpencodeCliAgentsCache(dmBotRoot);

  return readOpencodeConfig(dmBotRoot);
}
