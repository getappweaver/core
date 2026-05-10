import {
  getAgentBackend,
  getCurrentOrDefaultMode,
  getDmCommandPrefix,
  getLinting,
  getProviderName,
  getWorkspaceTarget,
} from '@src/db';

import type { WebRouteContext } from '../routes';

type EnvStatus = {
  botKey: boolean;
  botPubkey: boolean;
  masterPubkey: boolean;
  relays: boolean;
  cashuMnemonic: boolean;
  webPush: boolean;
  cursorApiKey: boolean;
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
};

function hasEnv(name: string): boolean {
  return (process.env[name]?.trim() ?? '').length > 0;
}

export function createSetupStatus(ctx: WebRouteContext): SetupStatus {
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
      relayCount: ctx.botRelayUrls.length,
      relays:
        process.env.BOT_RELAYS?.split(',')
          .map((relay) => relay.trim())
          .filter(Boolean) ?? [],
      botPubkey: ctx.botPubkey,
      masterPubkey: process.env.BOT_MASTER_PUBKEY?.trim() || null,
    },
  };
}
