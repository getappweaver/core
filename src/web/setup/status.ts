import { existsSync } from 'fs';

import {
  getAgentBackend,
  getCurrentOrDefaultMode,
  getDmCommandPrefix,
  getLinting,
  getProviderName,
  getWorkspaceTarget,
} from '@src/db';
import { parseRelayUrls } from '@src/env';
import { findExecutablePath } from '@src/executable';
import { getNativePiperStatus } from '@src/web/native-tts';

import type { WebRouteContext } from '../routes';

type EnvStatus = {
  botKey: boolean;
  botPubkey: boolean;
  masterPubkey: boolean;
  relays: boolean;
  cashuMnemonic: boolean;
  webPush: boolean;
  cursorApiKey: boolean;
  piperBinaryPath: boolean;
  piperModelPath: boolean;
  piperLibraryPath: boolean;
};

type DependencyStatusProps = {
  name: string;
  command: string;
  required: boolean;
  installHint: string;
};

export type SetupDependencyStatus = {
  name: string;
  command: string;
  installed: boolean;
  path: string | null;
  required: boolean;
  installHint: string;
};

export type SetupStatus = {
  ok: true;
  configured: boolean;
  env: EnvStatus;
  defaults: {
    backend: string;
    provider: string;
    mode: string;
    workspace: string;
    linting: string;
    readyNotification: boolean;
  };
  runtime: {
    version: string;
    setupMode: boolean;
    prefix: string;
    relayCount: number;
    relays: string[];
    botPubkey: string | null;
    masterPubkey: string | null;
  };
  piper: {
    binaryPath: string;
    binaryExists: boolean;
    modelPath: string;
    modelExists: boolean;
    libraryPath: string;
  };
  dependencies: SetupDependencyStatus[];
};

function dependencyStatus(props: DependencyStatusProps): SetupDependencyStatus {
  const path = findExecutablePath(props.command);

  return {
    ...props,
    installed: path !== null,
    path,
  };
}

function setupDependencies(): SetupDependencyStatus[] {
  return [
    dependencyStatus({
      name: 'Bun',
      command: 'bun',
      required: true,
      installHint: 'Install Bun from https://bun.sh/docs/installation',
    }),
    dependencyStatus({
      name: 'Node.js',
      command: 'node',
      required: true,
      installHint: 'Install Node.js from https://nodejs.org/',
    }),
    dependencyStatus({
      name: 'Git',
      command: 'git',
      required: true,
      installHint: 'Install Git from https://git-scm.com/downloads',
    }),
    dependencyStatus({
      name: 'OpenCode',
      command: 'opencode',
      required: false,
      installHint: 'Install OpenCode, or select Cursor Agent as backend.',
    }),
    dependencyStatus({
      name: 'Cursor Agent',
      command: 'agent',
      required: false,
      installHint: 'Install Cursor Agent, or select OpenCode as backend.',
    }),
    dependencyStatus({
      name: 'ngit',
      command: 'ngit',
      required: false,
      installHint: 'Install ngit for Nostr Git remotes and plugin updates.',
    }),
    dependencyStatus({
      name: 'Piper',
      command: 'piper',
      required: false,
      installHint: 'Install Piper TTS, then set BOT_PIPER_BINARY_PATH.',
    }),
  ];
}

function hasEnv(name: string): boolean {
  return (process.env[name]?.trim() ?? '').length > 0;
}

export function createSetupStatus(ctx: WebRouteContext): SetupStatus {
  const relays = parseRelayUrls(process.env.BOT_RELAYS ?? '');
  const piper = getNativePiperStatus(ctx.dmBotRoot);

  const env: EnvStatus = {
    botKey: hasEnv('BOT_KEY'),
    botPubkey: hasEnv('BOT_PUBKEY'),
    masterPubkey: hasEnv('BOT_MASTER_PUBKEY'),
    relays: hasEnv('BOT_RELAYS'),
    cashuMnemonic: hasEnv('CASHU_MNEMONIC'),
    webPush:
      hasEnv('BOT_WEB_PUSH_PUBLIC_KEY') &&
      hasEnv('BOT_WEB_PUSH_PRIVATE_KEY') &&
      hasEnv('BOT_WEB_PUSH_SUBJECT'),
    cursorApiKey: hasEnv('CURSOR_API_KEY'),
    piperBinaryPath: hasEnv('BOT_PIPER_BINARY_PATH'),
    piperModelPath: hasEnv('BOT_PIPER_MODEL_PATH'),
    piperLibraryPath: hasEnv('BOT_PIPER_LIBRARY_PATH'),
  };

  return {
    ok: true,
    configured: env.botKey && env.masterPubkey && env.relays,
    env,
    defaults: {
      backend: getAgentBackend(ctx.seenDb),
      provider: getProviderName(ctx.seenDb),
      mode: getCurrentOrDefaultMode(ctx.seenDb),
      workspace: getWorkspaceTarget(ctx.seenDb),
      linting: getLinting(ctx.seenDb),
      readyNotification: (process.env.READY_ENABLED ?? '1') !== '0',
    },
    runtime: {
      version: ctx.version,
      setupMode: ctx.setupMode,
      prefix: getDmCommandPrefix(ctx.seenDb),
      relayCount: relays.length,
      relays,
      botPubkey: ctx.botPubkey,
      masterPubkey: process.env.BOT_MASTER_PUBKEY?.trim() || null,
    },
    piper: {
      binaryPath: process.env.BOT_PIPER_BINARY_PATH?.trim() ?? '',
      binaryExists: piper.binaryPath.length > 0 && existsSync(piper.binaryPath),
      modelPath: piper.modelPath,
      modelExists: piper.modelExists,
      libraryPath: piper.libraryPath,
    },
    dependencies: setupDependencies(),
  };
}
