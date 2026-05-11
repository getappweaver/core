import { z } from 'zod';

import { createBackend } from '@src/backends/factory';
import { routeCommand } from '@src/commands/dispatch';
import type { PromptFn, SendReplyFn } from '@src/core/plugin';
import {
  getAgentBackend,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getModelOverride,
  getProviderName,
} from '@src/db';
import type {
  CommandArgumentDefinition,
  CommandDefinition,
  CommandOptionDefinition,
  SubcommandDefinition,
} from '@src/system/command-definition';

import type { WebRouteContext } from './routes';
import type { WebHandlerResult } from './ui-schema';

const ExecuteCommandRequestSchema = z.object({
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

type ExecuteCommandRequest = z.infer<typeof ExecuteCommandRequestSchema>;

type ExecuteBuiltinCommandProps = {
  ctx: WebRouteContext;
  command: CommandDefinition;
  subcommand: SubcommandDefinition;
  payload: unknown;
  sendReply?: SendReplyFn;
  promptFn?: PromptFn;
};

function stringifyScalar(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  throw new Error(`Unsupported scalar value: ${String(value)}`);
}

function pushArgumentTokens(
  tokens: string[],
  argument: CommandArgumentDefinition,
  value: unknown,
): void {
  if (value == null || value === '') {
    return;
  }

  if (argument.variadic) {
    if (Array.isArray(value)) {
      for (const item of value) {
        tokens.push(stringifyScalar(item));
      }

      return;
    }

    if (typeof value === 'string') {
      for (const item of value.split(/\s+/).filter(Boolean)) {
        tokens.push(item);
      }

      return;
    }

    throw new Error(`Argument ${argument.name} must be a string or array`);
  }

  tokens.push(stringifyScalar(value));
}

function pushOptionTokens(
  tokens: string[],
  option: CommandOptionDefinition,
  value: unknown,
): void {
  if (option.kind === 'boolean') {
    if (value === true) {
      tokens.push(option.flag);
    }

    return;
  }

  if (value == null || value === '') {
    return;
  }

  if (option.multiple === true && Array.isArray(value)) {
    for (const item of value) {
      if (item != null && item !== '') {
        tokens.push(option.flag, stringifyScalar(item));
      }
    }

    return;
  }

  tokens.push(option.flag, stringifyScalar(value));
}

function buildInvocationInput(props: {
  prefix: string;
  command: CommandDefinition;
  subcommand: SubcommandDefinition;
  request: ExecuteCommandRequest;
}): string {
  const { prefix, command, subcommand, request } = props;
  const tokens = [prefix + command.name];

  if (!(command.name === 'help' && subcommand.name === 'topic')) {
    tokens.push(subcommand.name);
  }

  for (const argument of subcommand.arguments) {
    pushArgumentTokens(tokens, argument, request.arguments[argument.name]);
  }

  for (const option of subcommand.options) {
    pushOptionTokens(tokens, option, request.options[option.name]);
  }

  return tokens.join(' ');
}

export async function executeBuiltinCommand({
  ctx,
  command,
  subcommand,
  payload,
  sendReply,
  promptFn,
}: ExecuteBuiltinCommandProps): Promise<{
  invocation: ExecuteCommandRequest;
  input: string;
  output: WebHandlerResult;
}> {
  const request = ExecuteCommandRequestSchema.parse(payload);

  const input = buildInvocationInput({
    prefix: ctx.prefix,
    command,
    subcommand,
    request,
  });

  const backendName = getAgentBackend(ctx.seenDb);
  const executionProfile = getBackendExecutionProfile(ctx.seenDb, backendName);

  const backend = createBackend({
    backendName,
    dmBotRoot: ctx.dmBotRoot,
    cursorMode: getCurrentOrDefaultMode(ctx.seenDb),
    opencodeAgentName:
      executionProfile.kind === 'opencode' ? executionProfile.agent : null,
    attachUrl: ctx.attachUrl,
    modelOverride: getModelOverride(ctx.seenDb, backendName),
    providerName: getProviderName(ctx.seenDb),
  });

  const output = await routeCommand({
    input,
    prefix: ctx.prefix,
    botRelayUrls: ctx.botRelayUrls,
    version: ctx.version,
    parentOfBotRoot: ctx.parentOfBotRoot,
    dmBotRoot: ctx.dmBotRoot,
    attachUrl: ctx.attachUrl,
    backend,
    botPubkey: ctx.botPubkey,
    seenDb: ctx.seenDb,
    pool: ctx.pool,
    walletDb: ctx.walletDb,
    providerDb: ctx.providerDb,
    config: ctx.config,
    source: 'web',
    sendReply,
    promptFn,
  });

  return {
    invocation: request,
    input,
    output: output ?? '',
  };
}

export async function executeBuiltinJsonCommand(params: {
  ctx: WebRouteContext;
  command: CommandDefinition;
  subcommand: SubcommandDefinition;
  payload: unknown;
}): Promise<WebHandlerResult> {
  const { ctx, command, subcommand, payload } = params;
  const backendName = getAgentBackend(ctx.seenDb);
  const executionProfile = getBackendExecutionProfile(ctx.seenDb, backendName);

  const input = `${ctx.prefix}${command.name} ${subcommand.name}`;

  const output = await routeCommand({
    input,
    prefix: ctx.prefix,
    botRelayUrls: ctx.botRelayUrls,
    version: ctx.version,
    parentOfBotRoot: ctx.parentOfBotRoot,
    dmBotRoot: ctx.dmBotRoot,
    attachUrl: ctx.attachUrl,
    backend: createBackend({
      backendName,
      dmBotRoot: ctx.dmBotRoot,
      cursorMode: getCurrentOrDefaultMode(ctx.seenDb),
      opencodeAgentName:
        executionProfile.kind === 'opencode' ? executionProfile.agent : null,
      attachUrl: ctx.attachUrl,
      modelOverride: getModelOverride(ctx.seenDb, backendName),
      providerName: getProviderName(ctx.seenDb),
    }),
    botPubkey: ctx.botPubkey,
    seenDb: ctx.seenDb,
    pool: ctx.pool,
    walletDb: ctx.walletDb,
    providerDb: ctx.providerDb,
    config: ctx.config,
    source: 'web',
    jsonPayload: payload,
  });

  return output ?? '';
}
