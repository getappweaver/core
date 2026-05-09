// ---------------------------------------------------------------------------
// src/web/server.ts — localhost HTTP bootstrap for discovery UI + JSON API
// ---------------------------------------------------------------------------

import type { SimplePool } from 'nostr-tools/pool';

import type { CoreDb } from '@src/db';
import type { BotConfig } from '@src/env';
import { log } from '@src/logger';
import type { ProviderDb } from '@src/providers/db';
import type { WalletDb } from '@src/wallet/db';

import { verifyNip98Authorization } from './nip98-verify';
import { createWebFetchHandler, type WebRouteContext } from './routes';
import { createWebSocketHandler } from './ws';
import { WebSocketPromptSession } from './ws-prompt-session';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 5551;

export type StartLocalWebServerOptions = {
  prefix: string;
  version: string;
  botRelayUrls: string[];
  parentOfBotRoot: string;
  dmBotRoot: string;
  attachUrl: string | null;
  botPubkey: string | null;
  seenDb: CoreDb;
  pool: SimplePool;
  walletDb: WalletDb | null;
  providerDb: ProviderDb | null;
  config: BotConfig;
  setupSecret: string;
  host?: string;
  port?: number;
};

function resolvePort(explicit?: number): number {
  const fromEnv = process.env.BOT_WEB_PORT;

  if (fromEnv !== undefined && fromEnv !== '') {
    const n = Number.parseInt(fromEnv, 10);

    if (!Number.isNaN(n) && n > 0 && n < 65536) {
      return n;
    }
  }

  return explicit ?? DEFAULT_PORT;
}

function resolveHost(explicit?: string): string {
  const fromEnv = process.env.BOT_WEB_HOST?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  return explicit ?? DEFAULT_HOST;
}

function displayHost(host: string): string {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

function setupUrl(origin: string, setupSecret: string): string {
  return `${origin}/setup?secret=${setupSecret}`;
}

function setupStatusApiUrl(origin: string, setupSecret: string): string {
  return `${origin}/api/setup/status?secret=${setupSecret}`;
}

export function startLocalWebServer(options: StartLocalWebServerOptions): void {
  if ((process.env.BOT_WEB_ENABLED ?? '1') === '0') {
    return;
  }

  const host = resolveHost(options.host);
  const port = resolvePort(options.port);

  const ctx: WebRouteContext = {
    prefix: options.prefix,
    version: options.version,
    botRelayUrls: options.botRelayUrls,
    parentOfBotRoot: options.parentOfBotRoot,
    dmBotRoot: options.dmBotRoot,
    attachUrl: options.attachUrl,
    botPubkey: options.botPubkey,
    seenDb: options.seenDb,
    pool: options.pool,
    walletDb: options.walletDb,
    providerDb: options.providerDb,
    config: options.config,
    setupSecret: options.setupSecret,
  };

  const fetch = createWebFetchHandler(ctx);
  const websocket = createWebSocketHandler(ctx);

  try {
    Bun.serve({
      hostname: host,
      port,
      fetch(req, server) {
        const url = new URL(req.url);

        if (url.pathname === '/ws') {
          const nip98 = verifyNip98Authorization({
            authorizationHeader: req.headers.get('Authorization'),
            pathname: url.pathname,
            requestMethod: req.method,
            masterPubkey: options.config.masterPubkey,
          });

          const upgraded = server.upgrade(req, {
            data: {
              promptSession: new WebSocketPromptSession(),
              currentChatAbort: null,
              nip98Authenticated: nip98.ok,
            },
          });

          if (upgraded) {
            return;
          }

          return new Response('WebSocket upgrade failed', { status: 500 });
        }

        return fetch(req);
      },
      websocket,
    });

    log.info(
      `Local API: http://${host}:${port}/ — health /api/health, commands /api/commands`,
    );

    const backendOrigin = `http://${displayHost(host)}:${port}`;
    const frontendOrigin = process.env.BOT_SETUP_UI_ORIGIN?.trim();
    const preferredOrigin = frontendOrigin || backendOrigin;

    log.info(`Setup web: ${setupUrl(preferredOrigin, options.setupSecret)}`);

    if (preferredOrigin !== backendOrigin) {
      log.info(
        `Setup status API: ${setupStatusApiUrl(backendOrigin, options.setupSecret)}`,
      );
    }
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;

    if (code === 'EADDRINUSE') {
      log.error(
        `Web server: address ${host}:${port} in use; skipping local web UI.`,
      );

      return;
    }

    log.error(`Web server failed to start: ${String(err)}`);
  }
}
