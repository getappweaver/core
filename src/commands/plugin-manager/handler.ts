import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { handlePluginsInstall } from './install/handler';

export const handlePluginsRoot: BuiltinHandler = (ctx) => {
  const sub = ctx.args[0]?.toLowerCase() ?? 'install';

  if (sub === 'help') {
    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: ctx.prefix,
        root: 'plugins',
        topic: ctx.args[1]?.toLowerCase() ?? null,
      }),
    );
  }

  if (sub === 'install' || sub === 'list') {
    return handleError(
      async () => handlePluginsInstall(ctx),
      'Failed to list plugins',
    );
  }

  return Promise.resolve(
    `Unknown plugins command: ${sub}. Try ${ctx.prefix}plugins install`,
  );
};
