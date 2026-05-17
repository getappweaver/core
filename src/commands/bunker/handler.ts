// ---------------------------------------------------------------------------
// src/commands/bunker/handler.ts — DM builtin root
// ---------------------------------------------------------------------------

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { handleBunkerAdd } from './add/handler';
import { renderBunkerCli } from './cli-representation';
import { handleBunkerDelete } from './delete/handler';
import { handleBunkerList } from './list/handler';
import { createBunkerUsageRepresentation } from './usage/representation';

export const handleBunkerRoot: BuiltinHandler = (ctx) => {
  const args = ctx.args;
  const sub = args[0]?.toLowerCase();

  if (sub === 'help') {
    const topic = args[1]?.toLowerCase() ?? null;

    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: ctx.prefix,
        root: 'bunker',
        topic,
      }),
    );
  }

  return handleError(async () => {
    const p = ctx.prefix;
    const subcmd = args[0]?.toLowerCase();

    if (!subcmd) {
      return renderBunkerCli(createBunkerUsageRepresentation(), {
        prefix: p,
      });
    }

    if (subcmd === 'list') {
      const rep = handleBunkerList({ db: ctx.seenDb });

      return renderBunkerCli(rep, { prefix: p });
    }

    if (subcmd === 'add') {
      const rep = await handleBunkerAdd({
        db: ctx.seenDb,
        pool: ctx.pool,
        args,
      });

      return renderBunkerCli(rep, { prefix: p });
    }

    if (subcmd === 'delete' || subcmd === 'remove' || subcmd === 'rm') {
      const rep = handleBunkerDelete({
        db: ctx.seenDb,
        args,
      });

      return renderBunkerCli(rep, { prefix: p });
    }

    return renderBunkerCli(createBunkerUsageRepresentation(), {
      prefix: p,
    });
  }, 'Bunker command failed');
};
