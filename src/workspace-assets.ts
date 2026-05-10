import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';

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
  };
  agentTemplates: {
    copied: string[];
    kept: string[];
  };
  gitignore: {
    added: string[];
    kept: string[];
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
  const skillsDir = join(dmBotRoot, '.claude', 'skills');

  const staticTargets: SymlinkTarget[] = [
    {
      label: 'opencode.json',
      src: join(dmBotRoot, 'opencode.json'),
      dest: join(parentOfBotRoot, 'opencode.json'),
    },
    {
      label: 'AGENTS.md',
      src: join(dmBotRoot, 'AGENTS.md'),
      dest: join(parentOfBotRoot, 'AGENTS.md'),
    },
  ];

  if (!existsSync(skillsDir)) {
    return staticTargets;
  }

  const skillTargets = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('dm-bot'))
    .map((entry) => {
      const rel = join('.claude', 'skills', entry.name);

      return {
        label: rel,
        src: join(skillsDir, entry.name),
        dest: join(parentOfBotRoot, rel),
      };
    });

  return [...staticTargets, ...skillTargets];
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
}: InstallParentWorkspaceAssetsProps): { added: string[]; kept: string[] } {
  const botDirName = dmBotRoot.split('/').filter(Boolean).at(-1) ?? 'dm-bot';

  const entries = [
    `${botDirName}/`,
    'opencode.json',
    'AGENTS.md',
    '.claude/skills/dm-bot-*/',
  ];

  const gitignorePath = join(parentOfBotRoot, '.gitignore');

  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8').replace(/\r\n/g, '\n')
    : '';

  const lines = existing === '' ? [] : existing.split('\n');
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

  return { added, kept };
}

export function installParentWorkspaceAssets({
  dmBotRoot,
  parentOfBotRoot,
}: InstallParentWorkspaceAssetsProps): InstallParentWorkspaceAssetsResult {
  const installed: string[] = [];
  const kept: string[] = [];
  const conflicts: string[] = [];
  const missingSources: string[] = [];

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
    symlinks: { installed, kept, conflicts, missingSources },
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
    return null;
  }

  return installParentWorkspaceAssets({
    dmBotRoot: props.dmBotRoot,
    parentOfBotRoot: props.parentOfBotRoot,
  });
}
