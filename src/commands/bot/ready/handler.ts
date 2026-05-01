import { join } from 'path';

import { getEnvFromFile, setEnvInFile } from '@src/env-file';

import type { RouteCommandContext } from '../../dispatch';

import { renderBotReadyText } from './renderers/text';
import { buildBotReadyRepresentation } from './representation';

function getReadyCurrent(dmBotRoot: string): 'on' | 'off' {
  const envPathForReady = join(dmBotRoot, '.env');

  return (getEnvFromFile(envPathForReady, 'READY_ENABLED') ??
    process.env.READY_ENABLED ??
    '1') !== '0'
    ? 'on'
    : 'off';
}

export function handleBotReady(ctx: RouteCommandContext): Promise<string> {
  const args = ctx.args.slice(1);

  const rep = buildBotReadyRepresentation({
    prefix: ctx.prefix,
    args,
    getReadyCurrent: () => getReadyCurrent(ctx.dmBotRoot),
  });

  if (rep.data.view === 'toggled') {
    const envPathForReady = join(ctx.dmBotRoot, '.env');

    setEnvInFile(
      envPathForReady,
      'READY_ENABLED',
      rep.data.value === 'on' ? '1' : '0',
    );
  }

  return Promise.resolve(renderBotReadyText(rep, { prefix: ctx.prefix }));
}
