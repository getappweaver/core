import type { AgentBackend } from '@src/backends/types';
import { handleError, type RouteCommandContext } from '@src/commands/dispatch';
import {
  type CoreDb,
  type WorkspaceTarget,
  WorkspaceTargetSchema,
  getAgentBackend,
  getWorkspaceTarget,
  setWorkspaceTarget,
} from '@src/db';
import { createNewSession } from '@src/session';
import type { WebHandlerResult } from '@src/web/ui-schema';
import { ensureOpencodeParentWorkspaceAssets } from '@src/workspace-assets';

import { appendStatusBlock } from '../../shared/with-status';

import { renderBotWorkspaceText } from './renderers/text';
import type { BotWorkspaceRepresentation } from './representation';

type HandleBotWorkspaceProps = {
  db: CoreDb;
  backend: AgentBackend;
  parentOfBotRoot: string;
  dmBotRoot: string;
  selected: string | undefined;
  prefix: string;
};

function pwdForWorkspace(params: {
  target: WorkspaceTarget;
  dmBotRoot: string;
  parentOfBotRoot: string;
}): string {
  return params.target === 'appweaver'
    ? params.dmBotRoot
    : params.parentOfBotRoot;
}

function toRepresentation(
  data: BotWorkspaceRepresentation['data'],
): BotWorkspaceRepresentation {
  return {
    kind: 'bot.workspace',
    version: 1,
    meta: { command: 'bot', subcommand: 'workspace' },
    data,
  };
}

export async function handleBotWorkspace(
  props: HandleBotWorkspaceProps,
): Promise<BotWorkspaceRepresentation> {
  const { db, backend, parentOfBotRoot, dmBotRoot, selected, prefix } = props;

  const usageOpts = WorkspaceTargetSchema.options.join('|');
  const currentTarget = getWorkspaceTarget(db);

  if (!selected) {
    const cwd = pwdForWorkspace({
      target: currentTarget,
      dmBotRoot,
      parentOfBotRoot,
    });

    return toRepresentation({
      view: 'query',
      target: currentTarget,
      cwd,
      usageOpts,
      prefix,
    });
  }

  const parsed = WorkspaceTargetSchema.safeParse(selected);

  if (!parsed.success) {
    return toRepresentation({
      view: 'invalid-usage',
      usageOpts,
      prefix,
    });
  }

  const nextTarget = parsed.data;
  const prevTarget = currentTarget;

  if (nextTarget === prevTarget) {
    const cwd = pwdForWorkspace({
      target: nextTarget,
      dmBotRoot,
      parentOfBotRoot,
    });

    return toRepresentation({
      view: 'unchanged',
      target: nextTarget,
      cwd,
    });
  }

  setWorkspaceTarget(db, nextTarget);

  ensureOpencodeParentWorkspaceAssets({
    backend: getAgentBackend(db),
    workspace: nextTarget,
    dmBotRoot,
    parentOfBotRoot,
  });

  const cwd = pwdForWorkspace({
    target: nextTarget,
    dmBotRoot,
    parentOfBotRoot,
  });

  try {
    const sessionId = await createNewSession({
      db,
      backend,
      cwd,
    });

    return toRepresentation({
      view: 'switched',
      previousTarget: prevTarget,
      nextTarget,
      cwd,
      newSessionId: sessionId,
    });
  } catch (err) {
    return toRepresentation({
      view: 'switched-session-failed',
      nextTarget,
      errorMessage: String(err),
    });
  }
}

export function handleBotWorkspaceCommand(
  ctx: RouteCommandContext,
): Promise<WebHandlerResult> {
  return handleError(async () => {
    const rep = await handleBotWorkspace({
      db: ctx.seenDb,
      backend: ctx.backend,
      dmBotRoot: ctx.dmBotRoot,
      parentOfBotRoot: ctx.parentOfBotRoot,
      selected: ctx.args[1],
      prefix: ctx.prefix,
    });

    // No web renderer for bot workspace yet; fall back to text.
    const out = renderBotWorkspaceText(rep, { prefix: ctx.prefix });

    return appendStatusBlock(ctx, out);
  }, 'Failed to switch workspace');
}
