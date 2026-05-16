// ---------------------------------------------------------------------------
// src/commands/session/handler.ts — session <subcommand> DM builtin root
// ---------------------------------------------------------------------------

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';
import { appendStatusBlock } from '../shared/with-status';

import { handleSessionAdopt } from './adopt/handler';
import { handleSessionAttach } from './attach/handler';
import { handleSessionList } from './list/handler';
import { handleSessionListNative } from './list-native/handler';
import { handleSessionMessages } from './messages/handler';
import { handleSessionNew } from './new/handler';
import { handleSessionResume } from './resume/handler';
import { handleSessionResumeLast } from './resume-last/handler';
import { renderSessionText } from './text-representation';
import { buildSessionUsageRepresentation } from './usage/representation';

export const handleSessionRoot: BuiltinHandler = (ctx) => {
  const p = ctx.prefix;
  const args = ctx.args;
  const sub = args[0]?.toLowerCase();

  if (sub === 'help') {
    const topic = args[1]?.toLowerCase() ?? null;

    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: p,
        root: 'session',
        topic,
      }),
    );
  }

  const render = (rep: Parameters<typeof renderSessionText>[0]) =>
    renderSessionText(rep, { prefix: p });

  if (sub === 'new') {
    return handleError(async () => {
      const rep = await handleSessionNew({
        seenDb: ctx.seenDb,
        backend: ctx.backend,
        cwd: ctx.cwd,
      });

      return appendStatusBlock(ctx, render(rep));
    }, 'Failed to create new session');
  }

  if (sub === 'attach') {
    const targetBackend = args[1];
    const sessionId = args[2];

    return handleError(
      async () =>
        render(
          handleSessionAttach({
            db: ctx.seenDb,
            targetBackend: targetBackend ?? '',
            sessionId: sessionId ?? '',
            prefix: p,
            activeBackend: ctx.backend.name,
          }),
        ),
      'Failed to attach session',
    );
  }

  if (sub === 'adopt') {
    const sessionId = args[1];

    return handleError(
      async () =>
        render(
          await handleSessionAdopt({
            db: ctx.seenDb,
            sessionId: sessionId ?? '',
            prefix: p,
            activeBackend: ctx.backend.name,
            cwd: ctx.cwd,
          }),
        ),
      'Failed to adopt session',
    );
  }

  if (sub === 'resume-last') {
    return handleError(
      async () =>
        render(
          handleSessionResumeLast({
            db: ctx.seenDb,
            backendName: ctx.backend.name,
          }),
        ),
      'Failed to resume last session',
    );
  }

  if (sub === 'resume') {
    const sessionId = args[1];

    return handleError(
      async () =>
        render(
          handleSessionResume({
            db: ctx.seenDb,
            sessionId: sessionId ?? '',
            prefix: p,
          }),
        ),
      'Failed to resume session',
    );
  }

  if (sub === 'list') {
    return handleError(
      async () => render(handleSessionList({ db: ctx.seenDb })),
      'Failed to list sessions',
    );
  }

  if (sub === 'list-native') {
    const backendFlag = args[1] ?? '';

    return handleError(
      async () =>
        render(
          await handleSessionListNative({
            db: ctx.seenDb,
            backendFlag,
            cwd: ctx.cwd,
            prefix: p,
          }),
        ),
      'Failed to list native sessions',
    );
  }

  if (sub === 'messages') {
    const sessionId = args[1];
    const n = Math.min(50, Math.max(1, parseInt(args[2] ?? '5', 10) || 5));

    return handleError(
      async () =>
        render(
          handleSessionMessages({
            db: ctx.seenDb,
            sessionId: sessionId ?? '',
            n,
            prefix: p,
          }),
        ),
      'Failed to show last messages',
    );
  }

  return Promise.resolve(
    render(buildSessionUsageRepresentation({ prefix: p })),
  );
};
