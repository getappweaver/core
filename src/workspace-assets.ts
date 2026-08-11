import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
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
  agentTemplates: {
    copied: string[];
    kept: string[];
  };
  gitignore: {
    added: string[];
    kept: string[];
    removed: string[];
  };
};

type SymlinkTarget = {
  label: string;
  src: string;
  dest: string;
};

const DEFAULT_AGENT_TEMPLATE_FILES = [
  'agent.md',
  'ask.md',
  'free.md',
  'plan.md',
];

function fileOrDirExists(path: string): boolean {
  try {
    lstatSync(path);

    return true;
  } catch {
    return false;
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function getParentSymlinkTargets({
  dmBotRoot,
  parentOfBotRoot,
}: InstallParentWorkspaceAssetsProps): SymlinkTarget[] {
  const staticTargets: SymlinkTarget[] = [
    {
      label: 'opencode.json',
      src: join(dmBotRoot, 'opencode.json'),
      dest: join(parentOfBotRoot, 'opencode.json'),
    },
  ];

  return staticTargets;
}

function ensureAgentTemplates(
  targetRoot: string,
  dmBotRoot: string,
): {
  copied: string[];
  kept: string[];
} {
  const templatesDir = join(dmBotRoot, 'templates', 'opencode-agents');
  const targetDir = join(targetRoot, '.opencode', 'agents');
  const copied: string[] = [];
  const kept: string[] = [];

  if (!existsSync(templatesDir)) {
    return { copied, kept };
  }

  mkdirSync(targetDir, { recursive: true });

  for (const fileName of DEFAULT_AGENT_TEMPLATE_FILES) {
    const src = join(templatesDir, fileName);
    const dest = join(targetDir, fileName);

    if (!existsSync(src)) {
      continue;
    }

    if (existsSync(dest)) {
      kept.push(fileName);
      continue;
    }

    copyFileSync(src, dest);
    copied.push(fileName);
  }

  return { copied, kept };
}

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

  writeFileSync(
    gitignorePath,
    lines.join('\n') + (lines.length > 0 ? '\n' : ''),
    'utf-8',
  );

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

  for (const target of getParentSymlinkTargets({
    dmBotRoot,
    parentOfBotRoot,
  })) {
    if (!existsSync(target.src)) {
      missingSources.push(target.label);
      continue;
    }

    if (isSymlink(target.dest)) {
      kept.push(target.label);
      continue;
    }

    if (fileOrDirExists(target.dest)) {
      conflicts.push(target.label);
      continue;
    }

    mkdirSync(dirname(target.dest), { recursive: true });
    symlinkSync(target.src, target.dest);
    installed.push(target.label);
  }

  const agentTemplates = ensureAgentTemplates(parentOfBotRoot, dmBotRoot);
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
    agentTemplates,
    gitignore,
  };
}

export function ensureOpencodeParentWorkspaceAssets(props: {
  backend: string;
  workspace: string;
  dmBotRoot: string;
  parentOfBotRoot: string;
}): InstallParentWorkspaceAssetsResult | null {
  if (props.backend !== 'opencode' || props.workspace !== 'parent') {
    removeLegacyParentAgentsSymlink(props);
    removeLegacyParentAgentsGitignoreEntry(props.parentOfBotRoot);

    return null;
  }

  return installParentWorkspaceAssets({
    dmBotRoot: props.dmBotRoot,
    parentOfBotRoot: props.parentOfBotRoot,
  });
}
