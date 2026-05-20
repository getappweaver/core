// ---------------------------------------------------------------------------
// src/web/routes.ts — HTTP routing for local discovery (M1)
// ---------------------------------------------------------------------------

// M2: add POST routes that map request bodies to a shared invocation model
// (transport: http, renderTarget: json | html) and reuse CLI dispatch.

import { existsSync } from 'fs';
import { join } from 'path';

import type { SimplePool } from 'nostr-tools/pool';
import { z, ZodError } from 'zod';

import {
  authorizeOpencodeSetupProvider,
  getOpencodeSetupAuthStatus,
} from '@src/backends/opencode-sdk';
import { writeRestartRequestedFile } from '@src/commands/bot/request-watch-restart';
import type { CoreDb } from '@src/db';
import type { BotConfig } from '@src/env';
import { log } from '@src/logger';
import {
  BunkerSignerDataSchema,
  getConnection,
  listConnections,
  saveConnection,
} from '@src/nostr/connections';
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
import { synthesizeNativePiper } from './native-tts';
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
import {
  downloadSetupPiperModel,
  generateSetupBotKey,
  setSetupCursorApiKey,
  setSetupDefaults,
  setSetupMasterPubkey,
  setSetupPiperConfig,
  setSetupProviderApiKey,
  setSetupRelays,
  setupWebPush,
} from './setup/actions';
import { createSetupSessionToken, isSetupSecretValid } from './setup/secret';
import { createSetupStatus } from './setup/status';
import { isWebDistUsable, serveWebDistGet } from './web-dist';

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
  setupSecret: string;
  setupMode: boolean;
};

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);

  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cache-Control', 'no-store');

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

const setupSessionTokens = new Set<string>();
const SETUP_RESTART_DELAY_MS = 500;

function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');

  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();

  return token.length > 0 ? token : null;
}

function verifySetupSession(req: Request): Response | null {
  const token = bearerToken(req);

  if (token && setupSessionTokens.has(token)) {
    return null;
  }

  return jsonResponse({ error: 'unauthorized' }, { status: 401 });
}

function createSetupSession(ctx: WebRouteContext, url: URL): Response {
  if (!isSetupSecretValid(url.searchParams.get('secret'), ctx.setupSecret)) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }

  const token = createSetupSessionToken();
  setupSessionTokens.add(token);

  return jsonResponse({ ok: true, token });
}

let loggedMissingWebDist = false;

function activeSetupUiOrigin(): string | null {
  const origin = process.env.BOT_SETUP_UI_ORIGIN?.trim();

  return origin && origin.length > 0 ? origin : null;
}

function shouldServeWebDist(): boolean {
  return process.env.BOT_WEB_STATIC === '1';
}

function redirectToSetupUi(url: URL): Response | null {
  const origin = activeSetupUiOrigin();

  if (!origin || url.pathname !== '/setup') {
    return null;
  }

  const target = new URL('/setup', origin);
  target.search = url.search;

  return Response.redirect(target.toString(), 302);
}

export function createWebFetchHandler(
  ctx: WebRouteContext,
): (req: Request) => Response | Promise<Response> {
  const shellPath = join(import.meta.dir, 'shell.html');

  return (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'GET') {
      const setupUiRedirect = redirectToSetupUi(url);

      if (setupUiRedirect) {
        return setupUiRedirect;
      }
    }

    if (req.method === 'GET' && path === '/api/health') {
      return jsonResponse({ ok: true, version: ctx.version });
    }

    if (path.startsWith('/api/setup/')) {
      if (req.method === 'POST' && path === '/api/setup/session') {
        return createSetupSession(ctx, url);
      }

      const authFail = verifySetupSession(req);

      if (authFail) {
        return authFail;
      }

      if (req.method === 'GET' && path === '/api/setup/status') {
        return jsonResponse(createSetupStatus(ctx));
      }

      if (req.method === 'POST' && path === '/api/setup/restart') {
        setTimeout(() => {
          try {
            writeRestartRequestedFile();
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);

            log.error(`Failed to request setup restart: ${message}`);
          }
        }, SETUP_RESTART_DELAY_MS);

        return jsonResponse({ ok: true, status: createSetupStatus(ctx) });
      }

      if (req.method === 'GET' && path === '/api/setup/opencode/auth') {
        return getOpencodeSetupAuthStatus(ctx.dmBotRoot)
          .then((result) => jsonResponse(result))
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            return jsonResponse({ error: message }, { status: 500 });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/opencode/authorize') {
        return parseJsonBody(req)
          .then((payload) => {
            const input = payload as {
              providerID?: unknown;
              methodIndex?: unknown;
            } | null;

            if (
              !input ||
              typeof input.providerID !== 'string' ||
              typeof input.methodIndex !== 'number' ||
              !Number.isInteger(input.methodIndex) ||
              input.methodIndex < 0
            ) {
              throw new Error('invalid_opencode_authorize');
            }

            return authorizeOpencodeSetupProvider({
              directory: ctx.dmBotRoot,
              providerID: input.providerID,
              methodIndex: input.methodIndex,
            });
          })
          .then((result) => jsonResponse(result))
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            const status =
              message === 'invalid_json' ||
              message === 'invalid_opencode_authorize'
                ? 400
                : 500;

            return jsonResponse({ error: message }, { status });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/master-pubkey') {
        return parseJsonBody(req)
          .then((payload) => {
            const pubkey =
              payload && typeof payload === 'object' && 'pubkey' in payload
                ? (payload as { pubkey?: unknown }).pubkey
                : null;

            if (typeof pubkey !== 'string' || pubkey.trim().length === 0) {
              throw new Error('invalid_master_pubkey');
            }

            const result = setSetupMasterPubkey({
              dmBotRoot: ctx.dmBotRoot,
              rawPubkey: pubkey,
            });

            return jsonResponse({
              ok: true,
              ...result,
              status: createSetupStatus(ctx),
            });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            const status =
              message === 'invalid_json' || message === 'invalid_master_pubkey'
                ? 400
                : 500;

            return jsonResponse({ error: message }, { status });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/bot-key') {
        const result = generateSetupBotKey({ dmBotRoot: ctx.dmBotRoot });

        return jsonResponse({
          ok: true,
          ...result,
          status: createSetupStatus(ctx),
        });
      }

      if (req.method === 'POST' && path === '/api/setup/relays') {
        return parseJsonBody(req)
          .then((payload) => {
            const relays =
              payload && typeof payload === 'object' && 'relays' in payload
                ? (payload as { relays?: unknown }).relays
                : null;

            if (
              !Array.isArray(relays) ||
              relays.some((relay) => typeof relay !== 'string')
            ) {
              throw new Error('invalid_relays');
            }

            const result = setSetupRelays({
              dmBotRoot: ctx.dmBotRoot,
              rawRelays: relays,
            });

            return jsonResponse({
              ok: true,
              ...result,
              status: createSetupStatus(ctx),
            });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            const status =
              message === 'invalid_json' || message === 'invalid_relays'
                ? 400
                : 500;

            return jsonResponse({ error: message }, { status });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/cursor-api-key') {
        return parseJsonBody(req)
          .then((payload) => {
            const apiKey =
              payload && typeof payload === 'object' && 'apiKey' in payload
                ? (payload as { apiKey?: unknown }).apiKey
                : null;

            if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
              throw new Error('invalid_cursor_api_key');
            }

            const result = setSetupCursorApiKey({
              dmBotRoot: ctx.dmBotRoot,
              apiKey,
            });

            return jsonResponse({
              ok: true,
              ...result,
              status: createSetupStatus(ctx),
            });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            const status =
              message === 'invalid_json' || message === 'invalid_cursor_api_key'
                ? 400
                : 500;

            return jsonResponse({ error: message }, { status });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/provider-api-key') {
        return parseJsonBody(req)
          .then((payload) => {
            const input = payload as {
              values?: unknown;
            } | null;

            if (
              !input ||
              !input.values ||
              typeof input.values !== 'object' ||
              Array.isArray(input.values) ||
              Object.entries(input.values).some(
                ([key, value]) =>
                  typeof key !== 'string' || typeof value !== 'string',
              )
            ) {
              throw new Error('invalid_provider_api_key');
            }

            const result = setSetupProviderApiKey({
              dmBotRoot: ctx.dmBotRoot,
              values: input.values as Record<string, string>,
            });

            return jsonResponse({ ok: true, ...result });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            const status =
              message === 'invalid_json' ||
              message === 'invalid_provider_api_key'
                ? 400
                : 500;

            return jsonResponse({ error: message }, { status });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/web-push') {
        return parseJsonBody(req)
          .then((payload) => {
            const input = payload as {
              subject?: unknown;
              generateNewKeys?: unknown;
            } | null;

            if (
              !input ||
              typeof input.subject !== 'string' ||
              typeof input.generateNewKeys !== 'boolean'
            ) {
              throw new Error('invalid_web_push');
            }

            const result = setupWebPush({
              dmBotRoot: ctx.dmBotRoot,
              subjectRaw: input.subject,
              generateNewKeys: input.generateNewKeys,
            });

            return jsonResponse({
              ok: true,
              ...result,
              status: createSetupStatus(ctx),
            });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            const status =
              message === 'invalid_json' ||
              message === 'invalid_web_push' ||
              message === 'invalid_web_push_subject' ||
              message === 'missing_web_push_keys'
                ? 400
                : 500;

            return jsonResponse({ error: message }, { status });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/piper') {
        return parseJsonBody(req)
          .then((payload) => {
            const input = payload as {
              binaryPath?: unknown;
              modelPath?: unknown;
              libraryPath?: unknown;
            } | null;

            if (
              !input ||
              typeof input.binaryPath !== 'string' ||
              typeof input.modelPath !== 'string' ||
              typeof input.libraryPath !== 'string'
            ) {
              throw new Error('invalid_piper_config');
            }

            const result = setSetupPiperConfig({
              dmBotRoot: ctx.dmBotRoot,
              binaryPath: input.binaryPath,
              modelPath: input.modelPath,
              libraryPath: input.libraryPath,
            });

            return jsonResponse({
              ok: true,
              ...result,
              status: createSetupStatus(ctx),
            });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            const status =
              message === 'invalid_json' || message === 'invalid_piper_config'
                ? 400
                : 500;

            return jsonResponse({ error: message }, { status });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/piper/model') {
        return downloadSetupPiperModel({ dmBotRoot: ctx.dmBotRoot })
          .then((result) =>
            jsonResponse({
              ok: true,
              ...result,
              status: createSetupStatus(ctx),
            }),
          )
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            return jsonResponse({ error: message }, { status: 500 });
          });
      }

      if (req.method === 'POST' && path === '/api/setup/defaults') {
        return parseJsonBody(req)
          .then((payload) => {
            if (!payload || typeof payload !== 'object') {
              throw new Error('invalid_defaults');
            }

            const input = payload as {
              prefix?: unknown;
              backend?: unknown;
              provider?: unknown;
              mode?: unknown;
              workspace?: unknown;
              linting?: unknown;
              readyNotification?: unknown;
            };

            if (
              typeof input.prefix !== 'string' ||
              typeof input.backend !== 'string' ||
              typeof input.provider !== 'string' ||
              typeof input.mode !== 'string' ||
              typeof input.workspace !== 'string' ||
              typeof input.linting !== 'string' ||
              typeof input.readyNotification !== 'boolean'
            ) {
              throw new Error('invalid_defaults');
            }

            const result = setSetupDefaults({
              db: ctx.seenDb,
              dmBotRoot: ctx.dmBotRoot,
              parentOfBotRoot: ctx.parentOfBotRoot,
              input: {
                prefix: input.prefix,
                backend: input.backend,
                provider: input.provider,
                mode: input.mode,
                workspace: input.workspace,
                linting: input.linting,
                readyNotification: input.readyNotification,
              },
            });

            return jsonResponse({
              ok: true,
              ...result,
              status: createSetupStatus(ctx),
            });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);

            const status =
              message === 'invalid_json' ||
              message === 'invalid_defaults' ||
              err instanceof ZodError
                ? 400
                : 500;

            return jsonResponse({ error: message }, { status });
          });
      }

      return jsonResponse({ error: 'not_found' }, { status: 404 });
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

    if (req.method === 'GET' && path === '/api/bunker/connections') {
      return jsonResponse({
        connections: listConnections(ctx.seenDb).map((connection) => ({
          name: connection.name,
          data: connection.data,
          createdAtMs: connection.created_at,
        })),
      });
    }

    if (req.method === 'POST' && path === '/api/bunker/connections') {
      return parseJsonBody(req)
        .then((payload) => {
          const parsed = z
            .object({
              name: z.string().trim().min(1),
              data: BunkerSignerDataSchema,
            })
            .parse(payload);

          if (getConnection(ctx.seenDb, parsed.name)) {
            throw new Error('duplicate_bunker_connection');
          }

          saveConnection(ctx.seenDb, parsed.name, 'bunker', parsed.data);

          const connection = getConnection(ctx.seenDb, parsed.name);

          if (!connection) {
            throw new Error('bunker_connection_save_failed');
          }

          return jsonResponse({
            ok: true,
            connection: {
              name: connection.name,
              data: connection.data,
              createdAtMs: connection.created_at,
            },
          });
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);

          const status =
            message === 'invalid_json' || err instanceof ZodError
              ? 400
              : message === 'duplicate_bunker_connection'
                ? 409
                : 500;

          return jsonResponse({ error: message }, { status });
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

    if (req.method === 'POST' && path === '/api/tts/piper') {
      return parseJsonBody(req)
        .then((payload) => {
          const text =
            payload && typeof payload === 'object' && 'text' in payload
              ? (payload as { text?: unknown }).text
              : null;

          const lengthScale =
            payload && typeof payload === 'object' && 'lengthScale' in payload
              ? (payload as { lengthScale?: unknown }).lengthScale
              : null;

          if (typeof text !== 'string') {
            throw new Error('invalid_tts_text');
          }

          return synthesizeNativePiper({
            dmBotRoot: ctx.dmBotRoot,
            text,
            lengthScale: typeof lengthScale === 'number' ? lengthScale : 1.2,
          });
        })
        .then(
          (audio) =>
            new Response(audio, {
              headers: {
                'Cache-Control': 'no-store',
                'Content-Type': 'audio/wav',
              },
            }),
        )
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);

          log.warn(`Piper TTS request failed: ${message}`);

          const status =
            message === 'invalid_json' ||
            message === 'invalid_tts_text' ||
            message === 'tts_text_too_long'
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

    if (req.method === 'GET' && shouldServeWebDist()) {
      const fromDist = serveWebDistGet({
        dmBotRoot: ctx.dmBotRoot,
        pathname: path,
      });

      if (fromDist) {
        return fromDist;
      }

      if (
        !loggedMissingWebDist &&
        !isWebDistUsable(ctx.dmBotRoot) &&
        (path === '/' || path === '/index.html')
      ) {
        loggedMissingWebDist = true;

        log.warn(
          'web/dist is missing or incomplete; run `bun run web:build` for the Solid PWA. Serving legacy /shell HTML at / until then.',
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
