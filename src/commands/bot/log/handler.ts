import { join } from 'path';

import { setEnvInFile } from '@src/env-file';
import { getInfoLogsEnabled, setInfoLogsEnabled } from '@src/logger';

import type { RouteCommandContext } from '../../dispatch';

import { renderBotLogCli } from './renderers/cli';
import { buildBotLogRepresentation } from './representation';

export function handleBotLog(ctx: RouteCommandContext): Promise<string> {
  const args = ctx.args.slice(1);

  const rep = buildBotLogRepresentation({
    prefix: ctx.prefix,
    args,
    getInfoLogsEnabled,
  });

  if (rep.data.view === 'toggled') {
    const envPath = join(ctx.dmBotRoot, '.env');
    const logArg = rep.data.enabled ? 'on' : 'off';

    setEnvInFile(envPath, 'INFO_ENABLED', logArg === 'on' ? '1' : '0');
    setInfoLogsEnabled(rep.data.enabled);
  }

  return Promise.resolve(renderBotLogCli(rep, { prefix: ctx.prefix }));
}
