// ---------------------------------------------------------------------------
// src/commands/builtin/wot/handlers.ts
// ---------------------------------------------------------------------------

import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';
import { handleWot } from '../wot';

import { adaptWotBuiltinInput } from './adapter';

export const handleWotRoot: BuiltinHandler = (ctx) => {
  const input = adaptWotBuiltinInput(ctx);
  const args = input.args;
  const sub = args[0]?.toLowerCase();

  if (sub === 'help') {
    const topic = args[1]?.toLowerCase() ?? null;

    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: input.prefix,
        root: 'wot',
        topic,
      }),
    );
  }

  return handleError(
    async () =>
      handleWot({
        db: input.seenDb,
        pool: input.pool,
        config: input.config,
        args: input.args,
      }),
    'WoT command failed',
  );
};
