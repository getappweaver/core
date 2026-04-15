// ---------------------------------------------------------------------------
// src/commands/dispatch.ts — types, constants, error wrapper, route prefixed input
// ---------------------------------------------------------------------------

import type { SimplePool } from 'nostr-tools/pool';

import type { PromptFn, RunAgentFn, SendReplyFn } from '@src/core/plugin';
import type { MessageSource } from '@src/messaging';
import type { WebNodeRoot } from '@src/web/ui-schema';

import type { AgentBackend } from '../backends/types';
import { dispatchPluginCommand } from '../core/registry';
import type { CoreDb } from '../db';
import {
  getCurrentOrDefaultMode,
  getModelOverride,
  getRoutstrSkKey,
  getWorkspaceTarget,
} from '../db';
import type { BotConfig } from '../env';
import { log } from '../logger';
import type { ProviderDb } from '../providers/db';
import { getOrCreateCurrentSession } from '../session';
import type { WalletDb } from '../wallets/db';

import { parseBuiltinTokens } from './parse-prefixed';
import { builtinCommandHandlers } from './prefixed-handlers';

async function createRunAgentForPluginDispatch(props: {
  seenDb: CoreDb;
  backend: AgentBackend;
  cwd: string;
}): Promise<RunAgentFn> {
  const { seenDb, backend, cwd } = props;
  const mode = getCurrentOrDefaultMode(seenDb);
  const modelOverride = getModelOverride(seenDb, backend.name);

  const sessionId = await getOrCreateCurrentSession({
    db: seenDb,
    backend,
    cwd,
  });

  return async (prompt: string) =>
    backend.runMessage({
      sessionId,
      content: prompt,
      mode,
      cwd,
      getRoutstrSkKey: () => getRoutstrSkKey(seenDb),
      modelOverride,
      onAgentStreamChunk: null,
      streamAbortSignal: null,
    });
}

// --- types

export type RouteCommandProps = {
  /** User message (must start with `prefix`). */
  input: string;
  /** Display prefix for built-in and plugin commands in this transport (e.g. `!` or `/`). */
  prefix: string;
  botRelayUrls: string[];
  version: string;
  parentOfBotRoot: string;
  dmBotRoot: string;
  attachUrl: string | null;
  backend: AgentBackend;
  botPubkey: string | null;
  seenDb: CoreDb;
  pool: SimplePool;
  walletDb: WalletDb | null;
  providerDb: ProviderDb | null;
  config: BotConfig;
  source: MessageSource;
  sendReply?: SendReplyFn;
  sendDm?: SendReplyFn;
  promptFn?: PromptFn;
};

export type RouteCommandContext = RouteCommandProps & {
  cmd: string;
  args: string[];
  cwd: string;
};

export type BuiltinHandler = (
  ctx: RouteCommandContext,
) => Promise<string | WebNodeRoot>;

// --- error wrapper

export async function handleError(
  fn: () => Promise<string | WebNodeRoot>,
  errorPrefix: string,
): Promise<string | WebNodeRoot> {
  try {
    return await fn();
  } catch (err) {
    return `${errorPrefix}: ${String(err)}`;
  }
}

// --- routing

export async function routeCommand(
  props: RouteCommandProps,
): Promise<string | WebNodeRoot | null> {
  const {
    input,
    prefix,
    botRelayUrls,
    pool,
    seenDb,
    providerDb,
    version,
    parentOfBotRoot,
    dmBotRoot,
    attachUrl,
    backend,
    botPubkey,
    walletDb,
    config,
    source,
    sendReply,
    sendDm,
    promptFn,
  } = props;

  const parsed = parseBuiltinTokens({ input, prefix });

  if (!parsed) {
    log.warn(`Input does not start with ${prefix}: ${input}`);

    return null;
  }

  const { cmd, args } = parsed;

  const cwd =
    getWorkspaceTarget(seenDb) === 'bot' ? dmBotRoot : parentOfBotRoot;

  const ctx = {
    input,
    prefix,
    botRelayUrls,
    pool,
    seenDb,
    providerDb,
    version,
    parentOfBotRoot,
    dmBotRoot,
    attachUrl,
    backend,
    botPubkey,
    walletDb,
    config,
    cmd,
    args,
    cwd,
    source,
    sendReply,
    sendDm,
    promptFn,
  };

  const builtIn = builtinCommandHandlers[cmd];

  if (builtIn) {
    return builtIn(ctx);
  }

  const runAgent: RunAgentFn = await createRunAgentForPluginDispatch({
    seenDb,
    backend,
    cwd,
  });

  const pluginResult = await dispatchPluginCommand(cmd, args, {
    prefix,
    source,
    runAgent,
    sendReply,
    promptFn,
  });

  if (pluginResult !== null) {
    return pluginResult;
  }

  return `Unknown command: ${prefix}${cmd}. Use ${prefix}help for commands.`;
}
