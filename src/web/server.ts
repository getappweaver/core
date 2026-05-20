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
const BILLBOARD_WIDTH = 80;
const BILLBOARD_INNER_WIDTH = BILLBOARD_WIDTH - 4;

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
  setupMode: boolean;
  setupBillboard: boolean;
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

function originWithTrailingSlash(origin: string): string {
  return origin.endsWith('/') ? origin : `${origin}/`;
}

function terminalLink(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function stripTerminalControls(text: string): string {
  return text
    .replace(
      // eslint-disable-next-line no-control-regex
      /\x1b\]8;;.*?\x1b\\/g,
      '',
    )
    .replace(
      // eslint-disable-next-line no-control-regex
      /\x1b\[[0-9;]*m/g,
      '',
    );
}

function visibleLength(text: string): number {
  return stripTerminalControls(text).length;
}

function chunkText(text: string, width: number): string[] {
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += width) {
    chunks.push(text.slice(i, i + width));
  }

  return chunks;
}

function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(' ')) {
    if (word.length > width) {
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }

      lines.push(...chunkText(word, width));
      continue;
    }

    const candidate = current.length === 0 ? word : `${current} ${word}`;

    if (candidate.length <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

function billboardLine(text: string): string {
  const padding = Math.max(0, BILLBOARD_INNER_WIDTH - visibleLength(text));

  return `| ${text}${' '.repeat(padding)} |`;
}

function logBillboard(lines: string[]): void {
  const border = `+${'-'.repeat(BILLBOARD_WIDTH - 2)}+`;

  log.raw(border);

  for (const line of lines) {
    log.raw(billboardLine(line));
  }

  log.raw(border);
}

function linkedUrlLines(url: string): string[] {
  return chunkText(url, BILLBOARD_INNER_WIDTH).map((chunk) =>
    terminalLink(url, chunk),
  );
}

function logWebLocalUrlBillboard(origin: string): void {
  const url = originWithTrailingSlash(origin);

  logBillboard([
    'Local web',
    ...linkedUrlLines(url),
    '',
    ...wrapWords(
      'Open app: Ctrl+Click the link in your terminal, or copy and paste it into your browser.',
      BILLBOARD_INNER_WIDTH,
    ),
  ]);
}

type LogSetupUrlProps = {
  origin: string;
  setupSecret: string;
};

function logSetupUrl({ origin, setupSecret }: LogSetupUrlProps): void {
  const url = setupUrl(origin, setupSecret);

  logBillboard([
    'Setup web',
    ...linkedUrlLines(url),
    '',
    'Open setup: Ctrl+Click the link in your terminal.',
    ...wrapWords(
      'If your terminal does not open links, copy and paste it into your browser.',
      BILLBOARD_INNER_WIDTH,
    ),
  ]);
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
    setupMode: options.setupMode,
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

    const frontendOrigin = process.env.BOT_SETUP_UI_ORIGIN?.trim();
    const backendOrigin = `http://${displayHost(host)}:${port}`;
    const preferredOrigin = frontendOrigin || backendOrigin;

    logWebLocalUrlBillboard(preferredOrigin);

    if (options.setupBillboard) {
      logSetupUrl({
        origin: preferredOrigin,
        setupSecret: options.setupSecret,
      });
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
