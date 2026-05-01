// ---------------------------------------------------------------------------
// src/web/routes.ts — HTTP routing for local discovery (M1)
// ---------------------------------------------------------------------------

// M2: add POST routes that map request bodies to a shared invocation model
// (transport: http, renderTarget: json | html) and reuse CLI dispatch.

import { existsSync } from 'fs';
import { join } from 'path';

import type { SimplePool } from 'nostr-tools/pool';
import { ZodError } from 'zod';

import type { CoreDb } from '@src/db';
import type { BotConfig } from '@src/env';
import { log } from '@src/logger';
import type { ProviderDb } from '@src/providers/db';
import { getSubcommandDefinition } from '@src/system/command-definition';
import type { WalletDb } from '@src/wallet/db';

import { runWebChat } from './chat';
import {
  getCommandDefinitionForWeb,
  getCommandDetailForWeb,
  listAllCommandsDetailForWeb,
} from './command-catalog';
import { executeBuiltinCommand } from './execute';
import { verifyNip98Authorization } from './nip98-verify';
import {
  PushSubscriptionBodySchema,
  PushUnsubscribeBodySchema,
} from './push-schema';
import {
  deleteWebPushSubscription,
  listWebPushSubscriptions,
  upsertWebPushSubscription,
} from './push-subscriptions';
import { serveWebDistGet } from './web-dist';

export type WebRouteContext = {
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
};

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);

  headers.set('Content-Type', 'application/json; charset=utf-8');

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new Error('invalid_json');
  }
}

// ---------------------------------------------------------------------------
// NIP-98 HTTP Auth verification
// ---------------------------------------------------------------------------

type VerifyNip98AuthParams = {
  req: Request;
  masterPubkey: string;
};

function verifyNip98Auth(params: VerifyNip98AuthParams): Response | null {
  const { req, masterPubkey } = params;

  const result = verifyNip98Authorization({
    authorizationHeader: req.headers.get('Authorization'),
    pathname: new URL(req.url).pathname,
    requestMethod: req.method,
    masterPubkey,
  });

  if (result.ok) {
    return null;
  }

  return jsonResponse(
    { error: 'unauthorized', reason: result.reason },
    { status: 401 },
  );
}

let loggedMissingWebDist = false;

export function createWebFetchHandler(
  ctx: WebRouteContext,
): (req: Request) => Response | Promise<Response> {
  const shellPath = join(import.meta.dir, 'shell.html');

  return (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/api/health') {
      return jsonResponse({ ok: true, version: ctx.version });
    }

    if (path.startsWith('/api/') && path !== '/api/push/vapid-key') {
      const authFail = verifyNip98Auth({
        req,
        masterPubkey: ctx.config.masterPubkey,
      });

      if (authFail) {
        return authFail;
      }
    }

    if (req.method === 'GET' && path === '/api/commands') {
      return jsonResponse({
        commands: listAllCommandsDetailForWeb(ctx.prefix),
      });
    }

    if (req.method === 'POST' && path === '/api/chat') {
      return parseJsonBody(req)
        .then((payload) => {
          const content =
            payload && typeof payload === 'object' && 'content' in payload
              ? (payload as { content?: unknown }).content
              : null;

          if (typeof content !== 'string' || content.trim().length === 0) {
            throw new Error('invalid_chat_content');
          }

          return runWebChat({
            ctx,
            content,
            onStreamChunk: null,
            streamAbortSignal: null,
          });
        })
        .then((result) => jsonResponse({ ok: true, ...result }))
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);

          const status =
            message === 'invalid_json' || message === 'invalid_chat_content'
              ? 400
              : 500;

          return jsonResponse({ error: message }, { status });
        });
    }

    const cmdMatch = /^\/api\/commands\/([^/]+)\/?$/.exec(path);

    if (req.method === 'GET' && cmdMatch) {
      const rawName = cmdMatch[1];
      let decoded: string;

      try {
        decoded = decodeURIComponent(rawName);
      } catch {
        return jsonResponse({ error: 'bad_request' }, { status: 400 });
      }

      const def = getCommandDetailForWeb(ctx.prefix, decoded);

      if (!def) {
        return jsonResponse({ error: 'not_found' }, { status: 404 });
      }

      return jsonResponse(def);
    }

    const execMatch = /^\/api\/commands\/([^/]+)\/([^/]+)\/?$/.exec(path);

    if (req.method === 'POST' && execMatch) {
      const rawName = execMatch[1];
      const rawSubcommand = execMatch[2];
      let commandName: string;
      let subcommandName: string;

      try {
        commandName = decodeURIComponent(rawName);
        subcommandName = decodeURIComponent(rawSubcommand);
      } catch {
        return jsonResponse({ error: 'bad_request' }, { status: 400 });
      }

      const command = getCommandDefinitionForWeb(ctx.prefix, commandName);

      if (!command) {
        return jsonResponse({ error: 'command_not_found' }, { status: 404 });
      }

      const subcommand = getSubcommandDefinition(command, subcommandName);

      if (!subcommand) {
        return jsonResponse({ error: 'subcommand_not_found' }, { status: 404 });
      }

      return parseJsonBody(req)
        .then((payload) =>
          executeBuiltinCommand({
            ctx,
            command,
            subcommand,
            payload,
          }),
        )
        .then((result) =>
          jsonResponse({
            ok: true,
            command: command.name,
            subcommand: subcommand.name,
            ...result,
          }),
        )
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);

          const status =
            message === 'invalid_json' || err instanceof ZodError ? 400 : 500;

          return jsonResponse({ error: message }, { status });
        });
    }

    if (req.method === 'POST' && path === '/api/push/subscribe') {
      if (!ctx.config.webPush) {
        return jsonResponse({ error: 'web_push_disabled' }, { status: 503 });
      }

      return parseJsonBody(req)
        .then((raw) => {
          const parsed = PushSubscriptionBodySchema.safeParse(raw);

          if (!parsed.success) {
            const detail = parsed.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ');

            throw new Error(`invalid_subscription (${detail})`);
          }

          const { endpoint, keys } = parsed.data;
          const userAgent = req.headers.get('User-Agent');

          upsertWebPushSubscription({
            db: ctx.seenDb,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            userAgent,
          });

          log.info(
            `Web push: subscription saved (${endpoint.slice(0, 64)}${endpoint.length > 64 ? '…' : ''})`,
          );

          return jsonResponse({ ok: true });
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);

          const status =
            message === 'invalid_json' || message === 'invalid_subscription'
              ? 400
              : 500;

          return jsonResponse({ error: message }, { status });
        });
    }

    if (req.method === 'DELETE' && path === '/api/push/subscribe') {
      return parseJsonBody(req)
        .then((raw) => {
          const parsed = PushUnsubscribeBodySchema.safeParse(raw);

          if (!parsed.success) {
            throw new Error('invalid_unsubscribe');
          }

          deleteWebPushSubscription({
            db: ctx.seenDb,
            endpoint: parsed.data.endpoint,
          });

          return jsonResponse({ ok: true });
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);

          const status =
            message === 'invalid_json' || message === 'invalid_unsubscribe'
              ? 400
              : 500;

          return jsonResponse({ error: message }, { status });
        });
    }

    if (req.method === 'GET' && path === '/api/push/vapid-key') {
      const wp = ctx.config.webPush;

      return jsonResponse({
        enabled: Boolean(wp),
        publicKey: wp?.publicKey ?? null,
      });
    }

    if (req.method === 'GET' && path === '/api/push/status') {
      const subs = listWebPushSubscriptions(ctx.seenDb);

      return jsonResponse({
        ok: true,
        subscriptionCount: subs.length,
        vapidConfigured: Boolean(ctx.config.webPush),
      });
    }

    if (path.startsWith('/api/')) {
      return jsonResponse({ error: 'not_found' }, { status: 404 });
    }

    if (req.method === 'GET' && path === '/shell') {
      return new Response(Bun.file(shellPath), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (req.method === 'GET') {
      const rel = path.startsWith('/') ? path.slice(1) : path;

      if (rel.includes('..')) {
        return jsonResponse({ error: 'not_found' }, { status: 404 });
      }

      // Let `/` fall through to the dist / shell HTML handling below.
      if (rel) {
        const candidateRels = [rel];

        if (rel.startsWith('plugins/')) {
          candidateRels.push(`plugin-icons/${rel.slice('plugins/'.length)}`);
        }

        for (const candidate of candidateRels) {
          const publicPath = join(ctx.dmBotRoot, 'web', 'public', candidate);

          if (existsSync(publicPath)) {
            return new Response(Bun.file(publicPath));
          }
        }
      }
    }

    if (req.method === 'GET') {
      const fromDist = serveWebDistGet({
        dmBotRoot: ctx.dmBotRoot,
        pathname: path,
      });

      if (fromDist) {
        return fromDist;
      }

      const indexInDist = join(ctx.dmBotRoot, 'web', 'dist', 'index.html');

      if (
        !loggedMissingWebDist &&
        !existsSync(indexInDist) &&
        (path === '/' || path === '/index.html')
      ) {
        loggedMissingWebDist = true;

        log.warn(
          'web/dist is missing; run `bun run web:build` for the Solid PWA. Serving legacy /shell HTML at / until then.',
        );
      }

      if (path === '/' || path === '/index.html') {
        return new Response(Bun.file(shellPath), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    }

    if (
      req.method !== 'GET' &&
      req.method !== 'POST' &&
      req.method !== 'DELETE'
    ) {
      return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });
    }

    return jsonResponse({ error: 'not_found' }, { status: 404 });
  };
}
