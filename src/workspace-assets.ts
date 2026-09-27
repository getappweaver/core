import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';

type InstallParentWorkspaceAssetsProps = {
  dmBotRoot: string;
  parentOfBotRoot: string;
};

export type InstallParentWorkspaceAssetsResult = {
  parentRoot: string;
  symlinks: {
    installed: string[];
    kept: string[];
    conflicts: string[];
    missingSources: string[];
    removedLegacyAgentsSymlink: boolean;
  };
  gitignore: {
    added: string[];
    kept: string[];
    removed: string[];
  };
};

function updateParentGitignore({
  dmBotRoot,
  parentOfBotRoot,
}: InstallParentWorkspaceAssetsProps): {
  added: string[];
  kept: string[];
  removed: string[];
} {
  const botDirName = dmBotRoot.split('/').filter(Boolean).at(-1) ?? 'appweaver';

  const entries = [
    `${botDirName}/`,
    'opencode.json',
    '.appweaver/opencode.json',
    '.appweaver/ppq/',
    '.claude/skills/appweaver-*',
  ];

  const gitignorePath = join(parentOfBotRoot, '.gitignore');

  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8').replace(/\r\n/g, '\n')
    : '';

  const removed = existing.split('\n').filter((line) => line === 'AGENTS.md');

  const lines =
    existing === ''
      ? []
      : existing.split('\n').filter((line) => line !== 'AGENTS.md');

  const lineSet = new Set(lines.filter((line) => line !== ''));
  const added: string[] = [];
  const kept: string[] = [];

  for (const entry of entries) {
    if (lineSet.has(entry)) {
      kept.push(entry);
      continue;
    }

    lines.push(entry);
    lineSet.add(entry);
    added.push(entry);
  }

  if (added.length > 0 || removed.length > 0) {
    writeFileSync(
      gitignorePath,
      lines.join('\n') + (lines.length > 0 ? '\n' : ''),
      'utf-8',
    );
  }

  return { added, kept, removed };
}

function removeLegacyParentAgentsSymlink({
  dmBotRoot,
  parentOfBotRoot,
}: InstallParentWorkspaceAssetsProps): boolean {
  const source = join(dmBotRoot, 'AGENTS.md');
  const target = join(parentOfBotRoot, 'AGENTS.md');

  try {
    if (
      !lstatSync(target).isSymbolicLink() ||
      resolve(dirname(target), readlinkSync(target)) !== resolve(source)
    ) {
      return false;
    }

    unlinkSync(target);

    return true;
  } catch {
    return false;
  }
}

function removeLegacyParentAgentsGitignoreEntry(parentOfBotRoot: string): void {
  const gitignorePath = join(parentOfBotRoot, '.gitignore');

  if (!existsSync(gitignorePath)) {
    return;
  }

  const existing = readFileSync(gitignorePath, 'utf-8').replace(/\r\n/g, '\n');
  const lines = existing.split('\n');

  if (!lines.includes('AGENTS.md')) {
    return;
  }

  const kept = lines.filter((line) => line !== 'AGENTS.md');

  writeFileSync(
    gitignorePath,
    kept.join('\n') + (kept.length > 0 ? '\n' : ''),
    'utf-8',
  );
}

export function installParentWorkspaceAssets({
  dmBotRoot,
  parentOfBotRoot,
}: InstallParentWorkspaceAssetsProps): InstallParentWorkspaceAssetsResult {
  const installed: string[] = [];
  const kept: string[] = [];
  const conflicts: string[] = [];
  const missingSources: string[] = [];

  const removedLegacyAgentsSymlink = removeLegacyParentAgentsSymlink({
    dmBotRoot,
    parentOfBotRoot,
  });

  const gitignore = updateParentGitignore({ dmBotRoot, parentOfBotRoot });

  return {
    parentRoot: parentOfBotRoot,
    symlinks: {
      installed,
      kept,
      conflicts,
      missingSources,
      removedLegacyAgentsSymlink,
    },
    gitignore,
  };
}

export function ensureOpencodeParentWorkspaceAssets(props: {
  workspace: string;
  dmBotRoot: string;
  parentOfBotRoot: string;
}): InstallParentWorkspaceAssetsResult | null {
  if (props.workspace !== 'parent') {
    removeLegacyParentAgentsSymlink(props);
    removeLegacyParentAgentsGitignoreEntry(props.parentOfBotRoot);
    updateParentGitignore(props);

    return null;
  }

  return installParentWorkspaceAssets({
    dmBotRoot: props.dmBotRoot,
    parentOfBotRoot: props.parentOfBotRoot,
  });
}
