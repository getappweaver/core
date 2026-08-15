import { rotateInferenceApiKey } from '@src/inference/api-key';

import type { RouteCommandContext } from '../../dispatch';

function inferenceBaseUrl(): string {
  const configuredHost = process.env.BOT_WEB_HOST?.trim() || '127.0.0.1';
  const host = configuredHost === '0.0.0.0' ? '127.0.0.1' : configuredHost;
  const configuredPort = Number.parseInt(process.env.BOT_WEB_PORT ?? '', 10);

  const port =
    Number.isInteger(configuredPort) &&
    configuredPort > 0 &&
    configuredPort < 65536
      ? configuredPort
      : 5551;

  return `http://${host}:${port}/v1`;
}

export function handleBotInferenceKey(
  ctx: RouteCommandContext,
): Promise<string> {
  const apiKey = rotateInferenceApiKey(ctx.seenDb);

  return Promise.resolve(
    [
      'Inference API key rotated. The previous key no longer works.',
      '',
      apiKey,
      '',
      'Inference Bridge settings:',
      `Base URL: ${inferenceBaseUrl()}`,
      'API key: use the value above',
    ].join('\n'),
  );
}
