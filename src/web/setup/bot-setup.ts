// ---------------------------------------------------------------------------
// src/web/setup/bot-setup.ts — Interactive bot configuration setup
//
// Usage: bun run bot:setup
//
// Reads current state from DB, shows current values as defaults,
// lets user reconfigure workspace, command prefix, lint, and notifications.
// Initializes independent managed OpenCode configuration for both workspaces.
// Managed skills are enabled separately per workspace.
// Optionally configures Web Push VAPID keys (BOT_WEB_PUSH_*) in .env via web-push.
// ---------------------------------------------------------------------------

import {
  existsSync,
  readlinkSync,
  unlinkSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, join, resolve } from 'path';
import * as readline from 'readline';

import { generateVAPIDKeys } from 'web-push';

import { initializeManagedOpencodeConfigs } from '@src/backends/opencode-managed-config';
import type { Linting } from '@src/db';
import { openCoreDb } from '@src/db';
import {
  getDmCommandPrefix,
  getWorkspaceTarget,
  setWorkspaceTarget,
  getLinting,
  setLinting,
  setDmCommandPrefix,
} from '@src/db';
import { normalizeVapidSubject } from '@src/env';
import { getEnvFromFile, setEnvInFile } from '@src/env-file';
import { dmBotRoot, getParentWorkspaceRoot } from '@src/paths';

const PARENT_ROOT = getParentWorkspaceRoot();
const BOT_DIR_NAME = basename(dmBotRoot);

const PARENT_GITIGNORE_ENTRIES = [
  `${BOT_DIR_NAME}/`,
  'opencode.json',
  '.appweaver/opencode.json',
  '.appweaver/ppq/',
  '.claude/skills/appweaver-*',
];

function removeLegacyParentAgentsSymlink(): boolean {
  const source = join(dmBotRoot, 'AGENTS.md');
  const target = join(PARENT_ROOT, 'AGENTS.md');

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

function updateParentGitignore(): void {
  const gitignorePath = join(PARENT_ROOT, '.gitignore');
  let existing = '';

  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, 'utf-8').replace(/\r\n/g, '\n');
  }

  const removedLegacyAgentsEntry = existing
    .split('\n')
    .some((line) => line === 'AGENTS.md');

  const lines =
    existing === ''
      ? []
      : existing.split('\n').filter((line) => line !== 'AGENTS.md');

  const lineSet = new Set(lines.filter((l) => l !== ''));
  const added: string[] = [];

  for (const entry of PARENT_GITIGNORE_ENTRIES) {
    if (!lineSet.has(entry)) {
      lines.push(entry);
      lineSet.add(entry);
      added.push(entry);
    }
  }

  if (added.length > 0 || removedLegacyAgentsEntry) {
    writeFileSync(
      gitignorePath,
      lines.join('\n') + (lines.length > 0 ? '\n' : ''),
      'utf-8',
    );
  }

  if (added.length > 0) {
    console.log('  Updated parent .gitignore with:');
    for (const entry of added) {
      console.log(`    - ${entry}`);
    }
  } else {
    console.log('  Parent .gitignore already contains required entries.');
  }

  if (removedLegacyAgentsEntry) {
    console.log('  Removed legacy AGENTS.md entry from parent .gitignore.');
  }
}

async function initializeWorkspaceConfig(): Promise<void> {
  console.log(`\nParent project root: ${PARENT_ROOT}\n`);

  if (removeLegacyParentAgentsSymlink()) {
    console.log('  ✓ Removed legacy AppWeaver AGENTS.md symlink');
  }

  await initializeManagedOpencodeConfigs({
    appweaverRoot: dmBotRoot,
    parentRoot: PARENT_ROOT,
  });

  console.log('  ✓ Initialized managed OpenCode configuration');
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

  const isParent = workspace === 'parent';

  await initializeWorkspaceConfig();

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
  // 3. Lint auto
  // ---------------------------------------------------------------------------

  console.log('\n── Lint Auto ──');
  console.log('  off    — never run lint automatically');
  console.log('  on     — run lint after responses that change files\n');

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
  console.log('  Backend:           opencode');
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

    console.log('  OpenCode config:   independently managed');
  }

  console.log('\n✓ Setup complete. Run `bun run start` to start the bot.\n');

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
