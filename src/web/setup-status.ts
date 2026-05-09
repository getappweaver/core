import type { WebRouteContext } from './routes';

type EnvStatus = {
  botKey: boolean;
  botPubkey: boolean;
  masterPubkey: boolean;
  relays: boolean;
  cashuMnemonic: boolean;
  webPush: boolean;
};

export type SetupStatus = {
  ok: true;
  configured: boolean;
  env: EnvStatus;
  runtime: {
    version: string;
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
    webPush: Boolean(ctx.config.webPush),
  };

  return {
    ok: true,
    configured: env.botKey && env.masterPubkey && env.relays,
    env,
    runtime: {
      version: ctx.version,
      prefix: ctx.prefix,
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
