import { rotateInferenceApiKey } from '@src/inference/api-key';
import {
  listInferenceEndpoints,
  type RegisteredInferenceEndpoint,
} from '@src/inference/endpoints';

import type { RouteCommandContext } from '../../dispatch';

function inferenceOrigin(): string {
  const configuredHost = process.env.BOT_WEB_HOST?.trim() || '127.0.0.1';
  const host = configuredHost === '0.0.0.0' ? '127.0.0.1' : configuredHost;
  const configuredPort = Number.parseInt(process.env.BOT_WEB_PORT ?? '', 10);

  const port =
    Number.isInteger(configuredPort) &&
    configuredPort > 0 &&
    configuredPort < 65536
      ? configuredPort
      : 5551;

  const urlHost =
    host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

  return `http://${urlHost}:${port}`;
}

export async function handleBotInferenceKey(
  ctx: RouteCommandContext,
): Promise<string> {
  const endpoints = await listInferenceEndpoints();
  const apiKey = rotateInferenceApiKey(ctx.seenDb);
  const groups = new Map<string, RegisteredInferenceEndpoint[]>();
  for (const endpoint of endpoints) {
    const group = groups.get(endpoint.provider.providerId) ?? [];
    group.push(endpoint);
    groups.set(endpoint.provider.providerId, group);
  }

  const sections = [...groups.values()].map((group) => {
    const { bridge } = group[0]!;

    return [
      `${bridge.title} Inference Bridge settings:`,
      `Base URL: ${inferenceOrigin()}${bridge.basePath}`,
      `API key: ${apiKey}`,
      'Authentication: Authorization: Bearer <key>',
      '',
      'Available inference endpoints:',
      ...group.map(
        (endpoint) =>
          `${endpoint.method} ${endpoint.path} — ${endpoint.description}`,
      ),
    ].join('\n');
  });

  return [
    'Inference API key rotated. The previous key no longer works.',
    ...sections,
  ].join('\n\n');
}
