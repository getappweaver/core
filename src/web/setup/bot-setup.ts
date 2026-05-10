// ---------------------------------------------------------------------------
// src/web/setup/bot-setup.ts — Interactive bot configuration setup
//
// Usage: bun run bot:setup
//
// Reads current state from DB, shows current values as defaults,
// lets user reconfigure workspace, backend, provider, mode, lint, ready.
// If workspace is "parent", symlinks AGENTS.md, opencode.json, and
// `.claude/skills/dm-bot*/` skill folders into the parent project.
// Optionally configures Web Push VAPID keys (BOT_WEB_PUSH_*) in .env via web-push.
// ---------------------------------------------------------------------------

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, join, resolve } from 'path';
import * as readline from 'readline';

import { generateVAPIDKeys } from 'web-push';

import type { Linting } from '@src/db';
import { openCoreDb } from '@src/db';
import {
  getDmCommandPrefix,
  getWorkspaceTarget,
  setWorkspaceTarget,
  getAgentBackend,
  setAgentBackend,
  getCurrentOrDefaultMode,
  setDefaultMode,
  getLinting,
  setLinting,
  getProviderName,
  setProviderName,
  setDmCommandPrefix,
} from '@src/db';
import { normalizeVapidSubject } from '@src/env';
import { getEnvFromFile, setEnvInFile } from '@src/env-file';
import { dmBotRoot } from '@src/paths';

const PARENT_ROOT = resolve(join(dmBotRoot, '..'));
const BOT_DIR_NAME = basename(dmBotRoot);
const DM_BOT_SKILLS_DIR = join(dmBotRoot, '.claude', 'skills');
const AGENT_TEMPLATES_DIR = join(dmBotRoot, 'templates', 'opencode-agents');

const DEFAULT_AGENT_TEMPLATE_FILES = [
  'agent.md',
  'ask.md',
  'free.md',
  'plan.md',
];

type SymlinkTarget = {
  label: string;
  src: string;
  dest: string;
};

function getSymlinkTargets(): SymlinkTarget[] {
  const staticTargets: SymlinkTarget[] = [
    {
      label: 'opencode.json',
      src: join(dmBotRoot, 'opencode.json'),
      dest: join(PARENT_ROOT, 'opencode.json'),
    },
    {
      label: 'AGENTS.md',
      src: join(dmBotRoot, 'AGENTS.md'),
      dest: join(PARENT_ROOT, 'AGENTS.md'),
    },
  ];

  const skillTargets: SymlinkTarget[] = [];

  if (existsSync(DM_BOT_SKILLS_DIR)) {
    const names = readdirSync(DM_BOT_SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('dm-bot'))
      .map((d) => d.name)
      .sort();

    for (const name of names) {
      const rel = join('.claude', 'skills', name);

      skillTargets.push({
        label: rel,
        src: join(DM_BOT_SKILLS_DIR, name),
        dest: join(PARENT_ROOT, rel),
      });
    }
  }

  return [...staticTargets, ...skillTargets];
}

const PARENT_GITIGNORE_ENTRIES = [
  `${BOT_DIR_NAME}/`,
  'opencode.json',
  'AGENTS.md',
  '.claude/skills/dm-bot-*/',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askWithDefault<T extends string>(
  question: string,
  current: T,
  options: T[],
): Promise<T> {
  const optionStr = options
    .map((o) => (o === current ? `[${o}]` : o))
    .join(' | ');

  return ask(`${question} (${optionStr}): `).then((ans) => {
    if (!ans) {
      return current;
    }

    if (options.includes(ans as T)) {
      return ans as T;
    }

    console.log(`  Invalid option. Keeping: ${current}`);

    return current;
  });
}

function askYesNo(question: string, current: boolean): Promise<boolean> {
  const opts = current ? '[yes] | no' : 'yes | [no]';

  return ask(`${question} (${opts}): `).then((ans) => {
    if (!ans) {
      return current;
    }

    if (ans === 'yes' || ans === 'y') {
      return true;
    }

    if (ans === 'no' || ans === 'n') {
      return false;
    }

    console.log(`  Invalid option. Keeping: ${current ? 'yes' : 'no'}`);

    return current;
  });
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function fileOrDirExists(path: string): boolean {
  try {
    lstatSync(path);

    return true;
  } catch {
    return false;
  }
}

function updateParentGitignore(): void {
  const gitignorePath = join(PARENT_ROOT, '.gitignore');
  let existing = '';

  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, 'utf-8').replace(/\r\n/g, '\n');
  }

  const lines = existing === '' ? [] : existing.split('\n');
  const lineSet = new Set(lines.filter((l) => l !== ''));
  const added: string[] = [];

  for (const entry of PARENT_GITIGNORE_ENTRIES) {
    if (!lineSet.has(entry)) {
      lines.push(entry);
      lineSet.add(entry);
      added.push(entry);
    }
  }

  writeFileSync(
    gitignorePath,
    lines.join('\n') + (lines.length > 0 ? '\n' : ''),
    'utf-8',
  );

  if (added.length > 0) {
    console.log('  Updated parent .gitignore with:');
    for (const entry of added) {
      console.log(`    - ${entry}`);
    }
  } else {
    console.log('  Parent .gitignore already contains required entries.');
  }
}

function removeParentGitignoreEntries(): void {
  const gitignorePath = join(PARENT_ROOT, '.gitignore');

  if (!existsSync(gitignorePath)) {
    return;
  }

  const existing = readFileSync(gitignorePath, 'utf-8').replace(/\r\n/g, '\n');
  const lines = existing.split('\n');
  const entries = new Set(PARENT_GITIGNORE_ENTRIES);

  const kept: string[] = [];
  const removed: string[] = [];

  for (const line of lines) {
    if (entries.has(line)) {
      if (line !== '') {
        removed.push(line);
      }
    } else {
      kept.push(line);
    }
  }

  writeFileSync(
    gitignorePath,
    kept.join('\n') + (kept.length > 0 ? '\n' : ''),
    'utf-8',
  );

  if (removed.length > 0) {
    console.log('  Removed entries from parent .gitignore:');
    for (const entry of removed) {
      console.log(`    - ${entry}`);
    }
  }
}

function ensureAgentTemplatesInstalled(targetRoot: string): void {
  if (!existsSync(AGENT_TEMPLATES_DIR)) {
    console.log(
      `  ⚠ Agent templates missing, skipping .opencode/agents install for ${targetRoot}`,
    );

    return;
  }

  const targetDir = join(targetRoot, '.opencode', 'agents');
  mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  let kept = 0;

  for (const fileName of DEFAULT_AGENT_TEMPLATE_FILES) {
    const src = join(AGENT_TEMPLATES_DIR, fileName);
    const dest = join(targetDir, fileName);

    if (!existsSync(src)) {
      continue;
    }

    if (existsSync(dest)) {
      kept += 1;
      continue;
    }

    copyFileSync(src, dest);
    copied += 1;
  }

  if (copied > 0 || kept > 0) {
    console.log(
      `  .opencode/agents in ${targetRoot}: copied ${copied}, kept existing ${kept}`,
    );
  }
}

async function removeSymlinks(): Promise<void> {
  for (const target of getSymlinkTargets()) {
    if (isSymlink(target.dest)) {
      unlinkSync(target.dest);
      console.log(`  ✓ Removed symlink: ${target.label}`);
    }
  }
}

async function createSymlinks(): Promise<void> {
  console.log(`\nParent project root: ${PARENT_ROOT}\n`);

  for (const target of getSymlinkTargets()) {
    if (!existsSync(target.src)) {
      console.log(`  ⚠ Source not found, skipping: ${target.label}`);
      continue;
    }

    if (isSymlink(target.dest)) {
      console.log(`  ✓ Already symlinked: ${target.label}`);
      continue;
    }

    if (fileOrDirExists(target.dest)) {
      const overwrite = await ask(
        `  "${target.label}" already exists in parent. Replace with symlink? (y/N): `,
      );

      if (overwrite.toLowerCase() !== 'y') {
        console.log(`  Skipped: ${target.label}`);
        continue;
      }

      unlinkSync(target.dest);
    }

    const destParent = dirname(target.dest);

    if (!existsSync(destParent)) {
      mkdirSync(destParent, { recursive: true });
    }

    symlinkSync(target.src, target.dest);
    console.log(`  ✓ Symlinked: ${target.label}`);
    console.log(`    ${target.dest} → ${target.src}`);
  }

  updateParentGitignore();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n── Bot Setup ──\n');
  console.log('Press Enter to keep the current value shown in [brackets].\n');

  const db = openCoreDb();
  const envPath = join(dmBotRoot, '.env');

  // Read current state
  const currentWorkspace = getWorkspaceTarget(db) ?? 'parent';
  const currentBackend = getAgentBackend(db) ?? 'opencode';
  const currentProvider = getProviderName(db) ?? 'local';
  const currentMode = getCurrentOrDefaultMode(db) ?? 'ask';
  const currentLintAuto = getLinting(db) ?? 'off';
  const currentReady = (process.env.READY_ENABLED ?? '1') !== '0';

  // ---------------------------------------------------------------------------
  // 1. Workspace
  // ---------------------------------------------------------------------------

  console.log('── Workspace ──');
  console.log('  parent — agent works on your project (bot is a subfolder)');

  console.log(
    '  appweaver — agent works only on AppWeaver itself (standalone)\n',
  );

  const workspace = await askWithDefault(
    'Workspace',
    currentWorkspace as 'parent' | 'appweaver',
    ['parent', 'appweaver'],
  );

  setWorkspaceTarget(db, workspace);

  const wasParent = currentWorkspace === 'parent';
  const isParent = workspace === 'parent';

  if (isParent) {
    console.log('\nSetting up symlinks for parent workspace...');
    await createSymlinks();
    ensureAgentTemplatesInstalled(PARENT_ROOT);
  } else if (wasParent && !isParent) {
    const remove = await ask(
      '\nWorkspace changed from parent to appweaver. Remove symlinks from parent project? (y/N): ',
    );

    if (remove.toLowerCase() === 'y') {
      await removeSymlinks();

      const removeGitignore = await ask(
        'Also remove dm-bot entries from parent .gitignore? (y/N): ',
      );

      if (removeGitignore.toLowerCase() === 'y') {
        removeParentGitignoreEntries();
      }
    }
  }

  ensureAgentTemplatesInstalled(dmBotRoot);

  // ---------------------------------------------------------------------------
  // 2. DM command prefix
  // ---------------------------------------------------------------------------

  console.log('\n── DM command prefix ──');

  console.log(
    '  Lines starting with this prefix are treated as commands (built-ins + plugins).',
  );

  console.log(
    '  Default is /. Examples: /help, .help if you set the prefix to .\n',
  );

  const currentDmPrefix = getDmCommandPrefix(db);

  const dmPrefixAnswer = await ask(`DM command prefix [${currentDmPrefix}]: `);

  const dmPrefix =
    dmPrefixAnswer.trim() === '' ? currentDmPrefix : dmPrefixAnswer.trim();

  try {
    setDmCommandPrefix(db, dmPrefix);
    console.log(`  ✓ DM command prefix: ${getDmCommandPrefix(db)}`);
  } catch (err) {
    console.log(
      `  ⚠ Invalid prefix, keeping "${currentDmPrefix}": ${String(err)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Backend
  // ---------------------------------------------------------------------------

  console.log('\n── Backend ──');
  console.log('  opencode — OpenCode SDK backend (recommended)');
  console.log('  cursor   — Cursor TypeScript SDK backend');
  console.log('');

  const backend = await askWithDefault(
    'Backend',
    currentBackend as 'opencode' | 'cursor',
    ['opencode', 'cursor'],
  );

  setAgentBackend(db, backend);

  if (backend === 'cursor') {
    const currentCursorKey = getEnvFromFile(envPath, 'CURSOR_API_KEY');

    const cursorKeyUrl =
      'https://cursor.com/dashboard/integrations#user-api-keys';

    console.log('\n  Cursor backend requires CURSOR_API_KEY in .env.');
    console.log('  Open this URL to create or copy your API key:\n');
    console.log(`  ${cursorKeyUrl}\n`);

    const keyPrompt = currentCursorKey
      ? `Paste your Cursor API key (Enter to keep current): `
      : 'Paste your Cursor API key: ';

    const pasted = await ask(keyPrompt);
    const cursorKey = (pasted.trim() || currentCursorKey) ?? '';

    if (cursorKey) {
      setEnvInFile(envPath, 'CURSOR_API_KEY', cursorKey);
      console.log('  ✓ CURSOR_API_KEY saved to .env');
    } else {
      console.log(
        '  ⚠ No key provided. Set CURSOR_API_KEY in .env before using the Cursor backend.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Provider
  // ---------------------------------------------------------------------------

  console.log('\n── Provider ──');
  console.log('  local   — use models local to the backend selected');

  console.log(
    '  routstr — (opencode only) routstr models, pay per request with sats via Cashu\n',
  );

  const provider = await askWithDefault(
    'Provider',
    currentProvider as 'local' | 'routstr',
    ['local', 'routstr'],
  );

  setProviderName(db, provider);

  // ---------------------------------------------------------------------------
  // 5. Mode
  // ---------------------------------------------------------------------------

  console.log('\n── Mode ──');
  console.log('  ask   — read-only, agent answers questions');
  console.log('  plan  — proposes changes without applying them');
  console.log('  agent — applies changes, commits, pushes\n');

  const mode = await askWithDefault(
    'Mode',
    currentMode as 'ask' | 'plan' | 'agent',
    ['ask', 'plan', 'agent'],
  );

  setDefaultMode(db, mode);

  // ---------------------------------------------------------------------------
  // 6. Lint auto
  // ---------------------------------------------------------------------------

  console.log('\n── Lint Auto (agent mode only) ──');
  console.log('  off    — never run lint automatically');
  console.log('  on     — run lint after agent responses in agent mode\n');

  const lintAuto = await askWithDefault(
    'Lint auto',
    currentLintAuto as Linting,
    ['off', 'on'],
  );

  setLinting(db, lintAuto);

  // ---------------------------------------------------------------------------
  // 7. Ready notification
  // ---------------------------------------------------------------------------

  console.log('\n── Ready Notification ──');
  console.log('  Send "Agent is ready" DM when the bot starts up.\n');

  const ready = await askYesNo(
    'Send ready notification on startup',
    currentReady,
  );

  if (ready !== currentReady) {
    setEnvInFile(envPath, 'READY_ENABLED', ready ? '1' : '0');
  }

  // ---------------------------------------------------------------------------
  // 8. Web Push (VAPID) — browser notifications for new DMs
  // ---------------------------------------------------------------------------

  console.log('\n── Web Push (PWA) ──');

  console.log(
    '  Writes BOT_WEB_PUSH_PUBLIC_KEY, BOT_WEB_PUSH_PRIVATE_KEY, BOT_WEB_PUSH_SUBJECT to .env.',
  );

  console.log(
    '  Subject must be mailto:you@example.com or https://… (bare email is OK).\n',
  );

  const existingPushPublic = getEnvFromFile(envPath, 'BOT_WEB_PUSH_PUBLIC_KEY');

  const existingPushPrivate = getEnvFromFile(
    envPath,
    'BOT_WEB_PUSH_PRIVATE_KEY',
  );

  const existingPushSubject = getEnvFromFile(envPath, 'BOT_WEB_PUSH_SUBJECT');

  const hasPushKeys = Boolean(
    existingPushPublic &&
    existingPushPrivate &&
    existingPushSubject &&
    existingPushPublic.length > 0 &&
    existingPushPrivate.length > 0,
  );

  const wantsWebPush = await askYesNo(
    'Configure Web Push (VAPID keys in .env)',
    false,
  );

  if (wantsWebPush) {
    const needNewKeys =
      !hasPushKeys ||
      (await askYesNo(
        'Generate a new VAPID key pair? (yes = existing browsers must click Push again)',
        false,
      ));

    const subjectHint = existingPushSubject
      ? `VAPID subject [${existingPushSubject}]: `
      : 'VAPID subject (e.g. mailto:you@example.com): ';

    const subjectAnswer = await ask(subjectHint);

    const subjectRaw =
      subjectAnswer.trim() !== ''
        ? subjectAnswer.trim()
        : (existingPushSubject ?? '');

    const subjectNorm = normalizeVapidSubject(subjectRaw);

    if (!subjectNorm) {
      console.log(
        '  ⚠ Invalid or empty VAPID subject. Set BOT_WEB_PUSH_SUBJECT manually, or run bot:setup again.',
      );
    } else {
      let publicKey = existingPushPublic ?? '';
      let privateKey = existingPushPrivate ?? '';

      if (needNewKeys) {
        const keys = generateVAPIDKeys();
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;
        console.log('  ✓ Generated VAPID key pair');
      }

      setEnvInFile(envPath, 'BOT_WEB_PUSH_PUBLIC_KEY', publicKey);
      setEnvInFile(envPath, 'BOT_WEB_PUSH_PRIVATE_KEY', privateKey);
      setEnvInFile(envPath, 'BOT_WEB_PUSH_SUBJECT', subjectNorm);
      console.log('  ✓ BOT_WEB_PUSH_* saved to .env');

      console.log(
        '  After restart, open the web UI and click Push to subscribe this browser.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log('\n── Configuration saved ──\n');
  console.log(`  Workspace:         ${workspace}`);
  console.log(`  DM command prefix: ${getDmCommandPrefix(db)}`);
  console.log(`  Backend:           ${backend}`);
  console.log(`  Provider:          ${provider}`);
  console.log(`  Mode:              ${mode}`);
  console.log(`  Lint auto:         ${lintAuto}`);
  console.log(`  Ready notification: ${ready ? 'on' : 'off'}`);

  console.log(
    `  Web Push (.env):   ${
      getEnvFromFile(envPath, 'BOT_WEB_PUSH_PUBLIC_KEY')
        ? 'VAPID keys set'
        : 'not set'
    }`,
  );

  if (isParent) {
    console.log(`\n  Parent root:       ${PARENT_ROOT}`);

    console.log(
      '  Symlinks: opencode.json, AGENTS.md, .claude/skills/dm-bot-*/',
    );
  }

  console.log('\n✓ Setup complete. Run `bun run start` to start the bot.\n');

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
