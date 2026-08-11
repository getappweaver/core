import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';

import { parse } from 'yaml';

import { getDmCommandPrefix, type CoreDb } from '@src/db';

const MANAGED_SKILL_PREFIX = 'appweaver-';

export type ManagedSkill = {
  name: string;
  description: string;
  enabled: boolean;
};

type SkillMetadata = {
  name: string;
  description: string;
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

function isManagedSkillName(name: string): boolean {
  return (
    name.startsWith(MANAGED_SKILL_PREFIX) &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)
  );
}

function listSkillNames(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        isManagedSkillName(entry.name) &&
        existsSync(join(root, entry.name, 'SKILL.md')),
    )
    .map((entry) => entry.name)
    .sort();
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
    return { name: fallbackName, description: '' };
  }

  try {
    const frontmatter = parse(match[1]) as Record<string, unknown> | null;

    const name =
      typeof frontmatter?.name === 'string' ? frontmatter.name : fallbackName;

    const description =
      typeof frontmatter?.description === 'string'
        ? frontmatter.description.trim()
        : '';

    return { name, description };
  } catch {
    return { name: fallbackName, description: '' };
  }
}

function targetPointsTo(target: string, source: string): boolean {
  try {
    if (!lstatSync(target).isSymbolicLink()) {
      return false;
    }

    return resolve(dirname(target), readlinkSync(target)) === resolve(source);
  } catch {
    return false;
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

  if (targetPointsTo(target, source)) {
    return;
  }

  if (pathExists(target)) {
    rmSync(target, { recursive: true, force: true });
  }

  mkdirSync(targetRoot, { recursive: true });
  symlinkSync(source, target, 'dir');
}

function reconcileWorkspaceSkills({
  db,
  dmBotRoot,
  workspaceRoot,
}: ListManagedSkillsProps): void {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const inventoryNames = listSkillNames(inventoryRoot(dmBotRoot));
  const inventoryNameSet = new Set(inventoryNames);

  for (const staleName of listManagedEntryNames(
    activeSkillsRoot(resolvedWorkspaceRoot),
  )) {
    if (!inventoryNameSet.has(staleName)) {
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

  return listSkillNames(inventoryRoot(dmBotRoot)).map((directoryName) => {
    const metadata = readSkillMetadata(
      join(inventoryRoot(dmBotRoot), directoryName, 'SKILL.md'),
      directoryName,
    );

    return {
      name: metadata.name,
      description: metadata.description,
      enabled: enabledByName.get(directoryName) === true,
    };
  });
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
  if (
    !isManagedSkillName(skillName) ||
    !existsSync(join(inventoryRoot(dmBotRoot), skillName, 'SKILL.md'))
  ) {
    throw new Error(`skill_not_found:${skillName}`);
  }

  const resolvedWorkspaceRoot = resolve(workspaceRoot);

  db.prepare(
    `INSERT INTO workspace_skills (workspace_root, skill_name, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT(workspace_root, skill_name)
     DO UPDATE SET enabled = excluded.enabled`,
  ).run(resolvedWorkspaceRoot, skillName, enabled ? 1 : 0);

  syncSkillTarget({
    dmBotRoot,
    workspaceRoot: resolvedWorkspaceRoot,
    skillName,
    enabled,
  });

  syncSkillStatusSkill({
    db,
    dmBotRoot,
    workspaceRoot: resolvedWorkspaceRoot,
  });
}
