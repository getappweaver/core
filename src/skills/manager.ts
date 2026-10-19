import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join, resolve } from 'path';

import { parse, stringify } from 'yaml';

import { getDmCommandPrefix, type CoreDb } from '@src/db';

const MANAGED_SKILL_PREFIX = 'appweaver-';
const CUSTOM_SKILL_PREFIX = 'custom-';

export type ManagedSkill = {
  name: string;
  description: string;
  markdown: string;
  enabled: boolean;
  source: 'builtin' | 'custom';
};

export type CustomSkillRecord = {
  name: string;
  description: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
};

type SkillMetadata = {
  name: string;
  description: string;
  markdown: string;
};

type CustomSkillRow = {
  skill_name: string;
  description: string;
  markdown: string;
  created_at: number;
  updated_at: number;
};

type InitializeWorkspaceSkillsProps = {
  db: CoreDb;
  dmBotRoot: string;
  workspaceRoots: string[];
};

type ListManagedSkillsProps = {
  db: CoreDb;
  dmBotRoot: string;
  workspaceRoot: string;
};

type SetManagedSkillEnabledProps = ListManagedSkillsProps & {
  skillName: string;
  enabled: boolean;
};

type SyncCustomSkillTargetProps = {
  workspaceRoot: string;
  skillName: string;
  markdown: string;
  enabled: boolean;
};

type UpsertCustomSkillProps = {
  db: CoreDb;
  dmBotRoot: string;
  workspaceRoot: string;
  skillName: string;
  markdown: string;
  enableInWorkspace: boolean | null;
};

type DeleteCustomSkillProps = {
  db: CoreDb;
  dmBotRoot: string;
  workspaceRoots: string[];
  skillName: string;
};

function pathExists(path: string): boolean {
  try {
    lstatSync(path);

    return true;
  } catch {
    return false;
  }
}

function inventoryRoot(dmBotRoot: string): string {
  return join(dmBotRoot, '.appweaver', 'skills');
}

function activeSkillsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, '.claude', 'skills');
}

function syncAlwaysAvailableSessionTitleSkill(props: {
  dmBotRoot: string;
  workspaceRoot: string;
}): void {
  const source = join(activeSkillsRoot(props.dmBotRoot), 'session-title');
  const target = join(activeSkillsRoot(props.workspaceRoot), 'session-title');

  if (!existsSync(join(source, 'SKILL.md')) || pathExists(target)) {
    return;
  }

  mkdirSync(activeSkillsRoot(props.workspaceRoot), { recursive: true });
  cpSync(source, target, { recursive: true });
}

function isBuiltinManagedSkillName(name: string): boolean {
  return (
    name.startsWith(MANAGED_SKILL_PREFIX) &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)
  );
}

export function isCustomSkillName(name: string): boolean {
  return (
    name.startsWith(CUSTOM_SKILL_PREFIX) &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)
  );
}

function isManagedSkillName(name: string): boolean {
  return isBuiltinManagedSkillName(name) || isCustomSkillName(name);
}

export function normalizeCustomSkillName(rawName: string): string {
  const trimmed = rawName.trim().toLowerCase();

  if (!trimmed) {
    throw new Error('Custom skill name is required.');
  }

  if (trimmed.startsWith(MANAGED_SKILL_PREFIX)) {
    throw new Error(
      `Custom skill names cannot start with "${MANAGED_SKILL_PREFIX}".`,
    );
  }

  const slug = trimmed.startsWith(CUSTOM_SKILL_PREFIX)
    ? trimmed.slice(CUSTOM_SKILL_PREFIX.length)
    : trimmed;

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    throw new Error(
      'Custom skill name may only contain letters, digits, hyphens, and underscores.',
    );
  }

  return `${CUSTOM_SKILL_PREFIX}${slug}`;
}

function stripOuterMarkdownFence(text: string): string {
  const trimmed = text.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-z0-9_-]*\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

function inferSkillDescriptionFromBody(body: string): string {
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#') || line.startsWith('>')) {
      continue;
    }

    return line.length > 160 ? `${line.slice(0, 157)}...` : line;
  }

  return 'Custom workspace skill.';
}

export function parseCustomSkillMarkdown(
  rawMarkdown: string,
  skillName: string,
): { description: string; markdown: string } {
  const cleaned = stripOuterMarkdownFence(rawMarkdown);

  if (!cleaned) {
    throw new Error('Skill markdown content cannot be empty.');
  }

  const match = cleaned.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);

  let description = '';
  let body = cleaned;

  if (match) {
    body = cleaned.slice(match[0].length).trim();

    try {
      const frontmatter = parse(match[1]) as Record<string, unknown> | null;

      if (typeof frontmatter?.description === 'string') {
        description = frontmatter.description.trim();
      }
    } catch {
      description = '';
    }
  }

  if (!description) {
    description = inferSkillDescriptionFromBody(body);
  }

  const normalizedBody = body || `# ${skillName}\n\n${description}`;
  const header = stringify({ name: skillName, description }).trimEnd();

  return {
    description,
    markdown: `---\n${header}\n---\n\n${normalizedBody}\n`,
  };
}

function listSkillNames(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        isBuiltinManagedSkillName(entry.name) &&
        existsSync(join(root, entry.name, 'SKILL.md')),
    )
    .map((entry) => entry.name)
    .sort();
}

function listCustomSkillRows(db: CoreDb): CustomSkillRow[] {
  return db
    .prepare(
      'SELECT skill_name, description, markdown, created_at, updated_at FROM custom_skills ORDER BY skill_name ASC',
    )
    .all() as CustomSkillRow[];
}

function listManagedEntryNames(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        isManagedSkillName(entry.name),
    )
    .map((entry) => entry.name);
}

function migrateLegacyInventory(dmBotRoot: string): void {
  const legacyRoot = activeSkillsRoot(dmBotRoot);
  const targetRoot = inventoryRoot(dmBotRoot);

  mkdirSync(targetRoot, { recursive: true });

  for (const name of listSkillNames(legacyRoot)) {
    const target = join(targetRoot, name);

    if (pathExists(target)) {
      continue;
    }

    cpSync(join(legacyRoot, name), target, {
      recursive: true,
      dereference: true,
    });
  }
}

function readSkillMetadata(path: string, fallbackName: string): SkillMetadata {
  const content = readFileSync(path, 'utf8');
  const match = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);

  if (!match) {
    return { name: fallbackName, description: '', markdown: content };
  }

  try {
    const frontmatter = parse(match[1]) as Record<string, unknown> | null;

    const name =
      typeof frontmatter?.name === 'string' ? frontmatter.name : fallbackName;

    const description =
      typeof frontmatter?.description === 'string'
        ? frontmatter.description.trim()
        : '';

    return { name, description, markdown: content };
  } catch {
    return { name: fallbackName, description: '', markdown: content };
  }
}

function syncSkillTarget({
  dmBotRoot,
  workspaceRoot,
  skillName,
  enabled,
}: Omit<SetManagedSkillEnabledProps, 'db'>): void {
  const source = join(inventoryRoot(dmBotRoot), skillName);
  const targetRoot = activeSkillsRoot(workspaceRoot);
  const target = join(targetRoot, skillName);

  if (!enabled) {
    if (pathExists(target)) {
      rmSync(target, { recursive: true, force: true });
    }

    return;
  }

  if (!existsSync(join(source, 'SKILL.md'))) {
    throw new Error(`skill_not_found:${skillName}`);
  }

  if (pathExists(target)) {
    rmSync(target, { recursive: true, force: true });
  }

  mkdirSync(targetRoot, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function syncCustomSkillTarget({
  workspaceRoot,
  skillName,
  markdown,
  enabled,
}: SyncCustomSkillTargetProps): void {
  const targetRoot = activeSkillsRoot(workspaceRoot);
  const target = join(targetRoot, skillName);

  if (!enabled) {
    if (pathExists(target)) {
      rmSync(target, { recursive: true, force: true });
    }

    return;
  }

  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'SKILL.md'), markdown, 'utf8');
}

function reconcileWorkspaceSkills({
  db,
  dmBotRoot,
  workspaceRoot,
}: ListManagedSkillsProps): void {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const inventoryNames = listSkillNames(inventoryRoot(dmBotRoot));
  const customRows = listCustomSkillRows(db);

  const validNameSet = new Set([
    ...inventoryNames,
    ...customRows.map((row) => row.skill_name),
  ]);

  for (const staleName of listManagedEntryNames(
    activeSkillsRoot(resolvedWorkspaceRoot),
  )) {
    if (!validNameSet.has(staleName)) {
      rmSync(join(activeSkillsRoot(resolvedWorkspaceRoot), staleName), {
        recursive: true,
        force: true,
      });
    }
  }

  for (const skillName of inventoryNames) {
    const row = db
      .prepare(
        'SELECT enabled FROM workspace_skills WHERE workspace_root = ? AND skill_name = ?',
      )
      .get(resolvedWorkspaceRoot, skillName) as { enabled: number } | null;

    syncSkillTarget({
      dmBotRoot,
      workspaceRoot: resolvedWorkspaceRoot,
      skillName,
      enabled: row?.enabled === 1,
    });
  }

  for (const customRow of customRows) {
    const row = db
      .prepare(
        'SELECT enabled FROM workspace_skills WHERE workspace_root = ? AND skill_name = ?',
      )
      .get(resolvedWorkspaceRoot, customRow.skill_name) as {
      enabled: number;
    } | null;

    syncCustomSkillTarget({
      workspaceRoot: resolvedWorkspaceRoot,
      skillName: customRow.skill_name,
      markdown: customRow.markdown,
      enabled: row?.enabled === 1,
    });
  }
}

export function createWorkspaceSkillsTable(db: CoreDb): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS workspace_skills (
      workspace_root TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      PRIMARY KEY (workspace_root, skill_name)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS custom_skills (
      skill_name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      markdown TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

export function initializeWorkspaceSkills({
  db,
  dmBotRoot,
  workspaceRoots,
}: InitializeWorkspaceSkillsProps): void {
  migrateLegacyInventory(dmBotRoot);

  const names = listSkillNames(inventoryRoot(dmBotRoot));
  const roots = [...new Set(workspaceRoots.map((root) => resolve(root)))];

  const existingByRoot = new Map(
    roots.map((root) => [
      root,
      new Set(listSkillNames(activeSkillsRoot(root))),
    ]),
  );

  const insert = db.prepare(
    'INSERT OR IGNORE INTO workspace_skills (workspace_root, skill_name, enabled) VALUES (?, ?, ?)',
  );

  for (const root of roots) {
    const existing = existingByRoot.get(root)!;

    for (const name of names) {
      insert.run(root, name, existing.has(name) ? 1 : 0);
    }
  }

  for (const root of roots) {
    reconcileWorkspaceSkills({ db, dmBotRoot, workspaceRoot: root });
    syncSkillStatusSkill({ db, dmBotRoot, workspaceRoot: root });
    syncAlwaysAvailableSessionTitleSkill({ dmBotRoot, workspaceRoot: root });
  }
}

export function listManagedSkills({
  db,
  dmBotRoot,
  workspaceRoot,
}: ListManagedSkillsProps): ManagedSkill[] {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);

  reconcileWorkspaceSkills({
    db,
    dmBotRoot,
    workspaceRoot: resolvedWorkspaceRoot,
  });

  const enabledRows = db
    .prepare(
      'SELECT skill_name, enabled FROM workspace_skills WHERE workspace_root = ?',
    )
    .all(resolvedWorkspaceRoot) as Array<{
    skill_name: string;
    enabled: number;
  }>;

  const enabledByName = new Map(
    enabledRows.map((row) => [row.skill_name, row.enabled === 1]),
  );

  const builtinSkills: ManagedSkill[] = listSkillNames(
    inventoryRoot(dmBotRoot),
  ).map((directoryName) => {
    const metadata = readSkillMetadata(
      join(inventoryRoot(dmBotRoot), directoryName, 'SKILL.md'),
      directoryName,
    );

    return {
      name: metadata.name,
      description: metadata.description,
      markdown: metadata.markdown,
      enabled: enabledByName.get(directoryName) === true,
      source: 'builtin',
    };
  });

  const customSkills: ManagedSkill[] = listCustomSkillRows(db).map((row) => ({
    name: row.skill_name,
    description: row.description,
    markdown: row.markdown,
    enabled: enabledByName.get(row.skill_name) === true,
    source: 'custom',
  }));

  return [...builtinSkills, ...customSkills].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getCustomSkill(
  db: CoreDb,
  rawName: string,
): CustomSkillRecord | null {
  const skillName = normalizeCustomSkillName(rawName);

  const row = db
    .prepare(
      'SELECT skill_name, description, markdown, created_at, updated_at FROM custom_skills WHERE skill_name = ?',
    )
    .get(skillName) as CustomSkillRow | null;

  if (!row) {
    return null;
  }

  return {
    name: row.skill_name,
    description: row.description,
    markdown: row.markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function upsertCustomSkill({
  db,
  dmBotRoot,
  workspaceRoot,
  skillName,
  markdown,
  enableInWorkspace,
}: UpsertCustomSkillProps): CustomSkillRecord {
  const normalizedName = normalizeCustomSkillName(skillName);
  const parsed = parseCustomSkillMarkdown(markdown, normalizedName);
  const now = Math.floor(Date.now() / 1000);
  const resolvedWorkspaceRoot = resolve(workspaceRoot);

  db.prepare(
    `INSERT INTO custom_skills (skill_name, description, markdown, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(skill_name)
     DO UPDATE SET
       description = excluded.description,
       markdown = excluded.markdown,
       updated_at = excluded.updated_at`,
  ).run(normalizedName, parsed.description, parsed.markdown, now, now);

  if (enableInWorkspace === null) {
    db.prepare(
      `INSERT OR IGNORE INTO workspace_skills (workspace_root, skill_name, enabled)
       VALUES (?, ?, 1)`,
    ).run(resolvedWorkspaceRoot, normalizedName);
  } else {
    db.prepare(
      `INSERT INTO workspace_skills (workspace_root, skill_name, enabled)
       VALUES (?, ?, ?)
       ON CONFLICT(workspace_root, skill_name)
       DO UPDATE SET enabled = excluded.enabled`,
    ).run(resolvedWorkspaceRoot, normalizedName, enableInWorkspace ? 1 : 0);
  }

  reconcileWorkspaceSkills({
    db,
    dmBotRoot,
    workspaceRoot: resolvedWorkspaceRoot,
  });

  syncSkillStatusSkill({
    db,
    dmBotRoot,
    workspaceRoot: resolvedWorkspaceRoot,
  });

  return getCustomSkill(db, normalizedName)!;
}

export function deleteCustomSkill({
  db,
  dmBotRoot,
  workspaceRoots,
  skillName,
}: DeleteCustomSkillProps): boolean {
  const normalizedName = normalizeCustomSkillName(skillName);

  const existing = db
    .prepare('SELECT 1 FROM custom_skills WHERE skill_name = ?')
    .get(normalizedName);

  if (!existing) {
    return false;
  }

  db.prepare('DELETE FROM custom_skills WHERE skill_name = ?').run(
    normalizedName,
  );

  db.prepare('DELETE FROM workspace_skills WHERE skill_name = ?').run(
    normalizedName,
  );

  const roots = [...new Set(workspaceRoots.map((root) => resolve(root)))];

  for (const root of roots) {
    reconcileWorkspaceSkills({ db, dmBotRoot, workspaceRoot: root });
    syncSkillStatusSkill({ db, dmBotRoot, workspaceRoot: root });
  }

  return true;
}

// ---------------------------------------------------------------------------
// skill-status: an always-on skill that mirrors the managed skill state.
//
// Unlike `appweaver-*` skills this one is not prefixed with `appweaver-`, so
// the skills manager never disables it and `reconcileWorkspaceSkills` never
// removes it. It lets the AI discover skills that exist in the inventory but
// are currently disabled (they are invisible to the AI's available-skills
// list). Regenerated at startup and whenever a skill is enabled/disabled.
// ---------------------------------------------------------------------------

const SKILL_STATUS_NAME = 'skill-status';

type SyncSkillStatusSkillProps = {
  db: CoreDb;
  dmBotRoot: string;
  workspaceRoot: string;
};

function skillStatusSkillMarkdown(props: SyncSkillStatusSkillProps): string {
  const prefix = getDmCommandPrefix(props.db);
  const skills = listManagedSkills(props);

  const rows =
    skills.length > 0
      ? skills
          .map((skill) => {
            const status = skill.enabled ? 'Enabled' : 'Disabled';

            const description = skill.description
              ? ` — ${skill.description}`
              : '';

            return `- \`${skill.name}\`${description} — **${status}**`;
          })
          .join('\n')
      : '- No managed AppWeaver skills are installed.';

  return `---
name: ${SKILL_STATUS_NAME}
description: Full list of AppWeaver managed skills (enabled and disabled) for this workspace.
---

# ${SKILL_STATUS_NAME}

This skill lists every AppWeaver-managed skill and whether it is **enabled** or **disabled** for the current workspace.

> Auto-generated — do not edit by hand. It is rewritten whenever a skill is enabled or disabled.

## How the skill manager works

- Managed AppWeaver skills can be enabled or disabled per workspace.
- A **disabled** skill is not available to the AI until the user enables it.
- Only the user can enable or disable skills — the AI must not change skill state on its own.

## Current state

${rows}

## When a user asks about a skill

- If a skill is marked **Disabled**: tell the user the skill exists but is currently disabled, and ask them to enable it with \`${prefix}skills set <name> enable\`.
- If the user wants to manage skills, point them to the skills manager, which can be opened from the footer joggler icon.
- Never enable or disable a skill yourself — always ask the user first.
`;
}

export function syncSkillStatusSkill(props: SyncSkillStatusSkillProps): void {
  const resolvedWorkspaceRoot = resolve(props.workspaceRoot);

  const targetDir = join(
    activeSkillsRoot(resolvedWorkspaceRoot),
    SKILL_STATUS_NAME,
  );

  mkdirSync(targetDir, { recursive: true });

  writeFileSync(
    join(targetDir, 'SKILL.md'),
    skillStatusSkillMarkdown(props),
    'utf8',
  );
}

export function setManagedSkillEnabled({
  db,
  dmBotRoot,
  workspaceRoot,
  skillName,
  enabled,
}: SetManagedSkillEnabledProps): void {
  const customRow = isCustomSkillName(skillName)
    ? (db
        .prepare(
          'SELECT skill_name, markdown FROM custom_skills WHERE skill_name = ?',
        )
        .get(skillName) as { skill_name: string; markdown: string } | null)
    : null;

  const builtinExists =
    isBuiltinManagedSkillName(skillName) &&
    existsSync(join(inventoryRoot(dmBotRoot), skillName, 'SKILL.md'));

  if (!builtinExists && !customRow) {
    throw new Error(`skill_not_found:${skillName}`);
  }

  const resolvedWorkspaceRoot = resolve(workspaceRoot);

  db.prepare(
    `INSERT INTO workspace_skills (workspace_root, skill_name, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT(workspace_root, skill_name)
     DO UPDATE SET enabled = excluded.enabled`,
  ).run(resolvedWorkspaceRoot, skillName, enabled ? 1 : 0);

  if (customRow) {
    syncCustomSkillTarget({
      workspaceRoot: resolvedWorkspaceRoot,
      skillName: customRow.skill_name,
      markdown: customRow.markdown,
      enabled,
    });
  } else {
    syncSkillTarget({
      dmBotRoot,
      workspaceRoot: resolvedWorkspaceRoot,
      skillName,
      enabled,
    });
  }

  syncSkillStatusSkill({
    db,
    dmBotRoot,
    workspaceRoot: resolvedWorkspaceRoot,
  });
}
