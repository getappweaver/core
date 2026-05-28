import { handleError, type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';

import { handlePluginsInstall } from './install/handler';
import { handlePluginsPublish } from './publish/handler';
import { handlePluginsReleases } from './releases/handler';

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

  if (sub === 'releases' || sub === 'release' || sub === 'publish-status') {
    return handleError(
      async () => handlePluginsReleases(ctx),
      'Failed to list plugin releases',
    );
  }

  if (sub === 'publish') {
    return handleError(
      async () => handlePluginsPublish(ctx),
      'Failed to publish plugin',
    );
  }

  return Promise.resolve(
    `Unknown plugins command: ${sub}. Try ${ctx.prefix}plugins install, ${ctx.prefix}plugins releases, or ${ctx.prefix}plugins publish <alias>`,
  );
};
