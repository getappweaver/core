import { relative } from 'path';

import { writeRestartRequestedFile } from '@src/commands/bot/request-watch-restart';
import type { RouteCommandContext } from '@src/commands/dispatch';
import { getWorkspaceTarget } from '@src/db';
import {
  aliasToPascal,
  createPluginScaffold,
  defaultCoreApiVersion,
} from '@src/plugin-lifecycle/scaffold';

import { renderPluginsNewWeb } from './renderers/web';

type NewPluginFields = {
  alias: string;
  title: string;
  description: string;
  coreApiVersion: string;
  createDraftCommands: boolean;
};

function argumentOption(args: string[], flag: string): string {
  const index = args.indexOf(flag);

  return index >= 0 ? (args[index + 1]?.trim() ?? '') : '';
}

function payloadOptions(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== 'object') {
    return {};
  }

  const options = (payload as { options?: unknown }).options;

  return options !== null && typeof options === 'object'
    ? (options as Record<string, unknown>)
    : {};
}

function stringField(
  options: Record<string, unknown>,
  name: string,
  fallback: string,
): string {
  const value = options[name];

  return typeof value === 'string' ? value.trim() : fallback;
}

function booleanField(
  options: Record<string, unknown>,
  args: string[],
  name: string,
  flag: string,
  defaultValue: boolean,
): boolean {
  const payloadValue = options[name];

  if (typeof payloadValue === 'boolean') {
    return payloadValue;
  }

  if (typeof payloadValue === 'string') {
    const trimmed = payloadValue.trim().toLowerCase();

    if (trimmed === 'true' || trimmed === '1') {
      return true;
    }

    if (trimmed === 'false' || trimmed === '0') {
      return false;
    }
  }

  const noFlag = flag.startsWith('--') ? `--no-${flag.slice(2)}` : null;

  if (noFlag && args.includes(noFlag)) {
    return false;
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === flag) {
      const next = args[index + 1]?.trim().toLowerCase();

      if (next === 'false' || next === '0') {
        return false;
      }

      if (next === 'true' || next === '1') {
        return true;
      }

      return true;
    }

    if (arg.startsWith(`${flag}=`)) {
      const val = arg
        .slice(flag.length + 1)
        .trim()
        .toLowerCase();

      if (val === 'false' || val === '0') {
        return false;
      }

      if (val === 'true' || val === '1') {
        return true;
      }
    }
  }

  return defaultValue;
}

function newPluginFields(ctx: RouteCommandContext): NewPluginFields {
  const options = payloadOptions(ctx.jsonPayload);

  const alias = stringField(
    options,
    'alias',
    argumentOption(ctx.args, '--alias'),
  );

  const pascalAlias = aliasToPascal(alias);

  const title = stringField(
    options,
    'title',
    argumentOption(ctx.args, '--title'),
  );

  const description = stringField(
    options,
    'description',
    argumentOption(ctx.args, '--description'),
  );

  return {
    alias,
    title: title || `${pascalAlias} app`,
    description: description || `${pascalAlias} plugin for AppWeaver`,
    coreApiVersion:
      stringField(options, 'core', argumentOption(ctx.args, '--core')) ||
      defaultCoreApiVersion(ctx.dmBotRoot),
    createDraftCommands: booleanField(
      options,
      ctx.args,
      'create_draft_commands',
      '--create-draft-commands',
      true,
    ),
  };
}

export async function handlePluginsNew(
  ctx: RouteCommandContext,
): Promise<ReturnType<typeof renderPluginsNewWeb> | string> {
  if (getWorkspaceTarget(ctx.seenDb) !== 'appweaver') {
    return `Plugin creation is only available in the appweaver workspace. Run ${ctx.prefix}bot workspace appweaver first.`;
  }

  const fields = newPluginFields(ctx);

  if (!fields.alias) {
    return ctx.source === 'web'
      ? renderPluginsNewWeb({
          view: 'form',
          coreApiVersion: fields.coreApiVersion,
        })
      : `Usage: ${ctx.prefix}plugins new --alias <alias> [--title <title>] [--description <description>] [--core <range>] [--create-draft-commands <boolean>]`;
  }

  const result = createPluginScaffold({
    dmBotRoot: ctx.dmBotRoot,
    alias: fields.alias,
    title: fields.title,
    description: fields.description,
    coreApiVersion: fields.coreApiVersion,
    createDraftCommands: fields.createDraftCommands,
    runGenerator: true,
  });

  writeRestartRequestedFile();

  const pluginPath = relative(ctx.dmBotRoot, result.pluginDir).replace(
    /\\/g,
    '/',
  );

  if (ctx.source === 'web') {
    return renderPluginsNewWeb({
      view: 'created',
      alias: result.alias,
      title: fields.title,
      description: fields.description,
      pluginPath,
      repo: result.repo,
      createDraftCommands: fields.createDraftCommands,
    });
  }

  return [
    `Created ${pluginPath}.`,
    `Registered ${result.packageName} as local draft ${result.repo}.`,
    `Develop it with AI, then run ${ctx.prefix}plugins releases.`,
  ].join('\n');
}
