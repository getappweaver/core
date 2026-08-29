#!/usr/bin/env bun

// ---------------------------------------------------------------------------
// src/index.ts — Main entry point
// ---------------------------------------------------------------------------

/**
 * AppWeaver - Listens for private messages from master and replies.
 *
 * Environment variables:
 *   BOT_KEY                 - Bot's private key (hex)
 *   BOT_PUBKEY              - Bot's public key (hex) - optional, derived from BOT_KEY if omitted
 *   BOT_MASTER_PUBKEY       - Master's pubkey to listen to and reply to (hex)
 *   BOT_RELAYS              - Comma-separated relay URLs (e.g. wss://relay.ditto.pub,wss://relay.nos.social)
 *   DEBUG                   - Set to 1 for extra logging (subscription, received events, send targets)
 *   LOG                     - Set to 0 to suppress all log()/logError() output. Default 1.
 *   BOT_OPENCODE_SERVE_URL  - Attach to a running opencode server (e.g. http://localhost:4096)
 *   CASHU_DEFAULT_MINT_URL  - Default Cashu mint URL to use for auto-flow
 *   BOT_WEB_ENABLED         - Set to 0 to skip the local discovery server (default 1)
 *   BOT_WEB_HOST            - Host for local web (default 127.0.0.1)
 *   BOT_WEB_PORT            - Port for local web (default 5551)
 *   BOT_WEB_PUSH_PUBLIC_KEY - VAPID public key for Web Push (optional; all three push vars required to enable)
 *   BOT_WEB_PUSH_PRIVATE_KEY- VAPID private key (optional)
 *   BOT_WEB_PUSH_SUBJECT    - VAPID contact, e.g. mailto:you@example.com (optional)
 *
 * Command lines: the DM command prefix (default /) is stored in the core DB; run `bun run bot:setup` to set (e.g. . for mobile).
 *
 * Restart: when using watch, touch restart.requested in this directory to restart the bot.
 */

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

import { SimplePool } from 'nostr-tools/pool';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

import { createBackend } from './backends/factory';
import {
  disposeOpencodeSdk,
  getOpenCodeAuthJsonPath,
} from './backends/opencode-sdk';
import { startLocalCli } from './cli/local-cli';
import { renderBotStatusText } from './commands/bot/status/renderers/text';
import { createBotStatusRepresentation } from './commands/bot/status/representation';
import { routeCommand } from './commands/dispatch';
import {
  getPromptPayloadValue,
  type PluginHostContext,
  type PromptPayload,
} from './core/plugin';
import { createPluginAgentService } from './core/plugin-agent';
import { finalizePluginRegistration } from './core/registry';
import { createCoreUpdateChecker } from './core/update-check';
import {
  openCoreDb,
  initSkKeyEncryption,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getAgentBackend,
  getModelOverride,
  getProviderName,
  getDmCommandPrefix,
  getWorkspaceTarget,
  getRoutstrSkKey,
  needsSetupBillboard,
  readSetupConfigurationSnapshot,
} from './db';
import { getMissingRequiredBotEnv, loadBotConfig } from './env';
import { runAgentConversation } from './flow/agent-conversation';
import { C, debug, log } from './logger';
import { createSendReplyForSource, type MessageSource } from './messaging';
import {
  decryptSelfContentWithBunkerInteractive,
  signEncryptedSelfEventWithBunkerInteractive,
  signWithBunkerInteractive,
} from './nostr/bunker-sign';
import {
  closeNostrCacheDb,
  openNostrCacheDb,
  type NostrCacheDb,
} from './nostr/cache/db';
import {
  DEFAULT_NOSTR_CACHE_LIMITS,
  runNostrCacheMaintenance,
} from './nostr/cache/maintenance';
import {
  createDmSubscription,
  createSignAuthEvent,
  sendDm,
} from './nostr/nip17';
import { PROFILE_RELAYS_FOR_QUERY } from './nostr/nip65';
import {
  allowRelayOperation,
  filterBlockedReadRelays,
  installRelayNoticeTracking,
} from './nostr/relay-notices';
import {
  createNostrResolutionService,
  type NostrResolutionRuntime,
} from './nostr/resolution-service';
import { createWotServices } from './nostr/wot-service';
import {
  dmBotRoot,
  getParentWorkspaceRoot,
  RESTART_REQUESTED_PATH,
} from './paths';
import { PROMPT_SESSION_EXIT } from './prompt-session';
import { asProviderDb } from './providers/db';
import { initializeWorkspaceSkills } from './skills/manager';
import { openWalletDb } from './wallet/db';
import {
  disposeNativePiperService,
  getNativePiperStatus,
  startNativePiperService,
} from './web/native-tts';
import { publishWidgetIcons } from './web/publish-widget-icons';
import { notifyAllWebPushSubscriptions } from './web/push-send';
import { resolveHost, resolvePort, startLocalWebServer } from './web/server';
import { createSetupSecret } from './web/setup/secret';
import { ensureOpencodeParentWorkspaceAssets } from './workspace-assets';

let activeNostrCacheDb: NostrCacheDb | null = null;
let activeNostrResolutionRuntime: NostrResolutionRuntime | null = null;
let activePool: SimplePool | null = null;

async function closeActiveNostrResources(): Promise<void> {
  const runtime = activeNostrResolutionRuntime;
  const pool = activePool;

  activeNostrResolutionRuntime = null;
  activePool = null;

  try {
    if (runtime) {
      activeNostrCacheDb = null;
      await runtime.shutdown();
    } else if (activeNostrCacheDb) {
      const db = activeNostrCacheDb;

      activeNostrCacheDb = null;
      closeNostrCacheDb(db);
    }
  } finally {
    pool?.destroy();
  }
}

async function waitForever(): Promise<never> {
  return new Promise(() => {});
}

function startConfiguredPiperService(): void {
  const status = getNativePiperStatus(dmBotRoot);

  if (!status.serviceEnabled) {
    return;
  }

  void startNativePiperService(dmBotRoot)
    .then(() => log.info('Piper TTS service ready on http://127.0.0.1:5000/'))
    .catch((err) => {
      log.warn(
        `Piper TTS service failed to start: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

function readPackageVersion(): string {
  const packageJson = readFileSync(join(dmBotRoot, 'package.json'), 'utf-8');
  const packageJsonData = JSON.parse(packageJson) as { version: string };

  return packageJsonData.version;
}

function shouldShowSetupBillboard(missingEnv: string[]): boolean {
  return (
    process.argv.slice(2).includes('--setup') ||
    process.env.BOT_SETUP_BILLBOARD === '1' ||
    missingEnv.length > 0 ||
    needsSetupBillboard(readSetupConfigurationSnapshot())
  );
}

async function startSetupOnlyMode(props: {
  setupSecret: string;
  version: string;
  coreUpdateChecker: ReturnType<typeof createCoreUpdateChecker>;
  missingEnv: string[];
  setupBillboard: boolean;
}): Promise<never> {
  const seenDb = openCoreDb();
  const parentOfBotRoot = getParentWorkspaceRoot();
  const prefix = getDmCommandPrefix(seenDb);

  const pool = new SimplePool({ enablePing: false, enableReconnect: false });
  pool.allowConnectingToRelay = allowRelayOperation;
  installRelayNoticeTracking(pool);
  const providerDb = asProviderDb(seenDb);
  const masterPubkey = process.env.BOT_MASTER_PUBKEY?.trim() ?? '';

  log.warn(
    `Setup mode: missing required env ${props.missingEnv.join(', ')}. Starting setup web server only.`,
  );

  const piperStatus = getNativePiperStatus(dmBotRoot);

  log.info(
    `${C.bold}Piper TTS:${C.reset} binary=${piperStatus.binaryPath} (${piperStatus.binaryExists ? 'found' : 'missing'}), model=${piperStatus.modelPath} (${piperStatus.modelExists ? 'found' : 'missing'})`,
  );

  log.info(`${C.bold}Piper libs:${C.reset} ${piperStatus.libraryPath}`);
  log.info(`${C.bold}OpenCode auth:${C.reset} ${getOpenCodeAuthJsonPath()}`);
  startConfiguredPiperService();

  process.once('SIGINT', () => {
    disposeNativePiperService();
    process.exit(130);
  });

  process.once('SIGTERM', () => {
    disposeNativePiperService();
    process.exit(143);
  });

  startLocalWebServer({
    prefix,
    version: props.version,
    botRelayUrls: [],
    parentOfBotRoot,
    dmBotRoot,
    attachUrl: null,
    coreUpdateChecker: props.coreUpdateChecker,
    botPubkey: null,
    seenDb,
    pool,
    walletDb: null,
    providerDb,
    config: {
      botKeyHex: '',
      botPubkey: null,
      masterPubkey,
      botRelayUrls: [],
      opencodeServeUrl: null,
      cashuMnemonic: null,
      cashuDefaultMintUrl: null,
      routstrBaseUrl:
        process.env.ROUTSTR_BASE_URL ?? 'https://api.routstr.com/v1',
      webPush: null,
      browser: {
        profileDir:
          process.env.BOT_BROWSER_PROFILE_DIR?.trim() ||
          join(dmBotRoot, '.data', 'browser-profile'),
        headless: process.env.BOT_BROWSER_HEADLESS === '1',
      },
    },
    wot: null,
    nostrResolution: null,
    setupSecret: props.setupSecret,
    setupMode: true,
    setupBillboard: props.setupBillboard,
    host: resolveHost(),
    port: resolvePort(),
  });

  return waitForever();
}

async function main() {
  // --- Restart & config ---
  if (existsSync(RESTART_REQUESTED_PATH)) {
    try {
      unlinkSync(RESTART_REQUESTED_PATH);
    } catch {
      // Ignore if file was already removed.
    }
  }

  const setupSecret = createSetupSecret();
  const VERSION = readPackageVersion();
  const coreUpdateChecker = createCoreUpdateChecker(dmBotRoot);
  const missingEnv = getMissingRequiredBotEnv();
  const setupBillboard = shouldShowSetupBillboard(missingEnv);

  if (missingEnv.length > 0) {
    return startSetupOnlyMode({
      setupSecret,
      version: VERSION,
      coreUpdateChecker,
      missingEnv,
      setupBillboard,
    });
  }

  const config = loadBotConfig();

  // --- Identity & Nostr setup ---
  const {
    botKeyHex,
    botPubkey: botPubkeyFromEnv,
    masterPubkey,
    botRelayUrls,
    opencodeServeUrl,
    cashuMnemonic,
    routstrBaseUrl,
  } = config;

  const botSecretKey = hexToBytes(botKeyHex);
  const botPubkey = botPubkeyFromEnv ?? getPublicKey(botSecretKey);

  if (botPubkeyFromEnv && botPubkey !== botPubkeyFromEnv) {
    log.error(
      `Bot pubkey mismatch. Expected: ${botPubkeyFromEnv}, Got: ${botPubkey}`,
    );

    process.exit(1);
  }

  initSkKeyEncryption(botKeyHex, botPubkey);

  // --- Databases ---
  const pool = new SimplePool({ enablePing: true, enableReconnect: true });

  activePool = pool;
  pool.allowConnectingToRelay = allowRelayOperation;
  installRelayNoticeTracking(pool);
  const seenDb = openCoreDb();
  const providerDb = asProviderDb(seenDb);
  const walletDb = cashuMnemonic ? openWalletDb(cashuMnemonic) : null;
  const nostrCacheDb = openNostrCacheDb();

  activeNostrCacheDb = nostrCacheDb;

  runNostrCacheMaintenance({
    db: nostrCacheDb,
    limits: DEFAULT_NOSTR_CACHE_LIMITS,
  });

  const nostrResolutionRuntime = createNostrResolutionService({
    db: nostrCacheDb,
    pool,
    nowMs: Date.now,
    filterReadRelays: filterBlockedReadRelays,
    profileRelays: PROFILE_RELAYS_FOR_QUERY,
    closeDbOnShutdown: true,
  });

  activeNostrResolutionRuntime = nostrResolutionRuntime;
  const nostrResolution = nostrResolutionRuntime.service;

  let shuttingDown = false;

  async function shutdown(exitCode: number): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    disposeOpencodeSdk();
    disposeNativePiperService();
    await closeActiveNostrResources();
    process.exit(exitCode);
  }

  process.once('SIGINT', () => void shutdown(130));
  process.once('SIGTERM', () => void shutdown(143));

  const parentOfBotRoot = getParentWorkspaceRoot();

  initializeWorkspaceSkills({
    db: seenDb,
    dmBotRoot,
    workspaceRoots: [dmBotRoot, parentOfBotRoot],
  });

  ensureOpencodeParentWorkspaceAssets({
    backend: getAgentBackend(seenDb),
    workspace: getWorkspaceTarget(seenDb),
    dmBotRoot,
    parentOfBotRoot,
  });

  const signAuthEvent = createSignAuthEvent({ botSecretKey });

  // --- Startup logging & ready DM ---
  log.info(`${C.bold}Bot pubkey:${C.reset} ${botPubkey}`);
  log.info(`${C.bold}Master:${C.reset} ${masterPubkey}`);

  const piperStatus = getNativePiperStatus(dmBotRoot);

  log.info(
    `${C.bold}Piper TTS:${C.reset} binary=${piperStatus.binaryPath} (${piperStatus.binaryExists ? 'found' : 'missing'}), model=${piperStatus.modelPath} (${piperStatus.modelExists ? 'found' : 'missing'})`,
  );

  log.info(`${C.bold}Piper libs:${C.reset} ${piperStatus.libraryPath}`);
  log.info(`${C.bold}OpenCode auth:${C.reset} ${getOpenCodeAuthJsonPath()}`);
  startConfiguredPiperService();

  const statusRep = createBotStatusRepresentation({
    botRelayUrls,
    seenDb,
    version: VERSION,
    coreUpdate: coreUpdateChecker.getSnapshot(),
    dmBotRoot,
    parentOfBotRoot,
    attachUrl: opencodeServeUrl,
  });

  const prefix = getDmCommandPrefix(seenDb);

  const wot = createWotServices({
    db: seenDb,
    nostrResolution,
    rootPubkey: config.masterPubkey,
    fallbackRelays: botRelayUrls,
  });

  const statusLines = renderBotStatusText(statusRep, { prefix });

  for (const line of statusLines.split('\n')) {
    log.info(line);
  }

  log.sep();

  startLocalWebServer({
    prefix,
    version: VERSION,
    botRelayUrls,
    parentOfBotRoot,
    dmBotRoot,
    attachUrl: opencodeServeUrl,
    coreUpdateChecker,
    botPubkey,
    seenDb,
    pool,
    walletDb,
    providerDb,
    config,
    wot,
    nostrResolution,
    setupSecret,
    setupMode: false,
    setupBillboard,
    host: resolveHost(),
    port: resolvePort(),
  });

  const pwdOutput = process.cwd();

  debug('PWD:', pwdOutput);

  const readyDmEnabled = (process.env.READY_ENABLED ?? '1') !== '0';

  const readyDmPromise = readyDmEnabled
    ? sendDm({
        pool,
        botRelayUrls,
        senderSecretKey: botSecretKey,
        recipientPubkey: masterPubkey,
        message: `Agent is ready.`,
        signAuthEvent,
      }).catch((err) => log.error(`Failed to send ready DM: ${String(err)}`))
    : Promise.resolve();

  const dmFilter = {
    kinds: [1059] as number[],
    '#p': [botPubkey],
    since: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60,
  };

  debug('Subscription filter:', JSON.stringify(dmFilter));

  // --- Reply handling & job engine ---
  const sendReplyForSource = createSendReplyForSource({
    pool,
    botRelayUrls,
    senderSecretKey: botSecretKey,
    recipientPubkey: masterPubkey,
    signAuthEvent,
  });

  let pendingPrompt: ((answer: string) => void) | null = null;

  /** Plugin `sendReply` / `promptFn` mirrors the current inbound message source. */
  let replySource: MessageSource = 'nostr';

  async function resolvePendingPromptIfAny(
    content: string,
    source: MessageSource,
  ): Promise<boolean> {
    if (!pendingPrompt) {
      return false;
    }

    if (content.trim().startsWith(`${getDmCommandPrefix(seenDb)}exit`)) {
      await sendReplyForSource(source, 'Exiting...');

      const resolve = pendingPrompt;
      pendingPrompt = null;
      resolve(PROMPT_SESSION_EXIT);

      return true;
    }

    const resolve = pendingPrompt;
    pendingPrompt = null;
    resolve(content);

    return true;
  }

  // --- Plugins ---
  const pluginAgent = createPluginAgentService({
    db: seenDb,
    dmBotRoot,
    parentOfBotRoot,
    attachUrl: opencodeServeUrl,
  });

  const pluginContext: PluginHostContext = {
    pool,
    masterPubkey,
    agent: pluginAgent,
    sendReply: (message: string) => sendReplyForSource(replySource, message),
    sendDm: (message: string) =>
      sendDm({
        pool,
        botRelayUrls,
        senderSecretKey: botSecretKey,
        recipientPubkey: masterPubkey,
        message,
        signAuthEvent,
      }),
    sendWebPush: async ({ title, body, url }) => {
      if (config.webPush === null) {
        return { status: 'disabled' as const };
      }

      const summary = await notifyAllWebPushSubscriptions({
        db: seenDb,
        config: config.webPush,
        title,
        body,
        url,
      });

      return { status: 'complete' as const, ...summary };
    },
    promptFn: async (message: string | PromptPayload): Promise<string> => {
      await sendReplyForSource(replySource, getPromptPayloadValue(message));

      return new Promise((resolve) => {
        pendingPrompt = resolve;
      });
    },
    wot,
    nostrResolution,
    getWotScore: (pubkey: string, rootPubkey?: string) =>
      pluginContext.wot.getWotScore(pubkey, rootPubkey),
    signWithBunker: (eventTemplate, bunkerName) =>
      signWithBunkerInteractive({
        db: seenDb,
        pool,
        eventTemplate,
        sendReply: (message: string) =>
          sendReplyForSource(replySource, message),
        promptFn: async (message: string | PromptPayload): Promise<string> => {
          await sendReplyForSource(replySource, getPromptPayloadValue(message));

          return new Promise((resolve) => {
            pendingPrompt = resolve;
          });
        },
        agent: pluginContext.agent,
        bunkerName,
      }),

    getRoutstrSkKey: () => getRoutstrSkKey(seenDb),
  };

  // Register plugins if generated/plugins.ts exists (created by install-plugin script)
  try {
    const { registerPlugins } = await import('../generated/plugins');
    log.info(`Registering plugins from ${join(dmBotRoot, 'plugins')}`);
    registerPlugins(pluginContext);
    log.info('Plugins registered');
  } catch (err) {
    log.error(`Failed to register plugins: ${String(err)}`);
    log.error(`Run 'bun run scripts/install-plugin.ts' to install plugins`);
  } finally {
    finalizePluginRegistration();
  }

  publishWidgetIcons(getDmCommandPrefix(seenDb));

  // --- Message handler: commands, session, agent run, reply ---
  async function handleUserMessage(
    content: string,
    source: MessageSource,
  ): Promise<void> {
    replySource = source;

    if (source === 'nostr' && config.webPush) {
      const preview = content.trim();
      const max = 140;

      const body =
        preview.length > max
          ? `${preview.slice(0, max)}…`
          : preview || '(empty)';

      void notifyAllWebPushSubscriptions({
        db: seenDb,
        config: config.webPush,
        title: 'AppWeaver',
        body,
        url: '/',
      }).catch((err: unknown) => {
        log.warn(`Web push failed for incoming Nostr message: ${String(err)}`);
      });
    }

    if (await resolvePendingPromptIfAny(content, source)) {
      return;
    }

    process.stdout.write(`${C.dim}${C.magenta} > ${content}${C.reset}\n`);

    const mode = getCurrentOrDefaultMode(seenDb);
    const backendName = getAgentBackend(seenDb);
    const executionProfile = getBackendExecutionProfile(seenDb, backendName);
    const modelOverride = getModelOverride(seenDb, backendName);

    const backend = createBackend({
      backendName,
      dmBotRoot,
      cursorMode: mode,
      opencodeAgentName:
        executionProfile.kind === 'opencode' ? executionProfile.agent : null,
      attachUrl: opencodeServeUrl,
      modelOverride,
      providerName: getProviderName(seenDb),
    });

    const input = content.trim();
    const dmPrefix = getDmCommandPrefix(seenDb);

    // Core built-in commands + plugins (prefix from core DB; default /)
    if (input.startsWith(dmPrefix)) {
      const reply = await routeCommand({
        input,
        prefix: dmPrefix,
        botRelayUrls,
        pool,
        seenDb,
        version: VERSION,
        parentOfBotRoot,
        dmBotRoot,
        attachUrl: opencodeServeUrl,
        coreUpdateChecker,
        backend,
        botPubkey,
        walletDb,
        providerDb,
        nostrResolution,
        config,
        source,
        sendReply: (message: string) => sendReplyForSource(source, message),
        sendDm: pluginContext.sendDm,
        promptFn: pluginContext.promptFn,
        signEncryptedSelfEvent: ({ kind, plaintext, tags }) =>
          signEncryptedSelfEventWithBunkerInteractive({
            db: seenDb,
            pool,
            ownerPubkey: masterPubkey,
            kind,
            plaintext,
            tags,
            sendReply: (message: string) => sendReplyForSource(source, message),
            promptFn: async (
              message: string | PromptPayload,
            ): Promise<string> => {
              await sendReplyForSource(source, getPromptPayloadValue(message));

              return new Promise((resolve) => {
                pendingPrompt = resolve;
              });
            },
          }),
        decryptSelfContent: (ciphertext) =>
          decryptSelfContentWithBunkerInteractive({
            db: seenDb,
            pool,
            ownerPubkey: masterPubkey,
            ciphertext,
            sendReply: (message: string) => sendReplyForSource(source, message),
            promptFn: async (
              message: string | PromptPayload,
            ): Promise<string> => {
              await sendReplyForSource(source, getPromptPayloadValue(message));

              return new Promise((resolve) => {
                pendingPrompt = resolve;
              });
            },
          }),
      });

      if (reply) {
        await sendReplyForSource(source, reply);
      } else {
        log.warn('No command reply. Sending default reply.');

        await sendReplyForSource(
          source,
          `No response (command may need to start with ${dmPrefix}). Use ${dmPrefix}help for commands.`,
        );
      }

      return;
    }

    await runAgentConversation({
      content,
      source,
      sendReplyForSource,
      backend,
      seenDb,
      dmBotRoot,
      parentOfBotRoot,
      opencodeServeUrl,
      config,
      walletDb,
      providerDb,
      routstrBaseUrl,
    });
  }

  // --- Start DM subscription and optional local CLI ---
  const startDmSubscription = createDmSubscription({
    pool,
    botRelayUrls,
    dmFilter,
    signAuthEvent,
    seenDb,
    botSecretKey,
    masterPubkey,
    onMessage: (content) => handleUserMessage(content, 'nostr'),
    reconnectBaseMs: 2_000,
    reconnectMaxMs: 60_000,
  });

  if (process.stdin.isTTY) {
    readyDmPromise.finally(() =>
      startLocalCli({
        prefix,
        onMessage: (input) => handleUserMessage(input, 'local'),
        resolvePendingPromptFirst: (line) =>
          resolvePendingPromptIfAny(line, 'local'),
      }),
    );
  }

  startDmSubscription();
}

main().catch(async (err) => {
  console.error(err);
  disposeOpencodeSdk();
  disposeNativePiperService();
  await closeActiveNostrResources();
  process.exit(1);
});
