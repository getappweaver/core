import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import type { SimplePool } from 'nostr-tools/pool';

import {
  createBlossomAuthBase64,
  fetchBlossomServerUrls,
  sha256Hex,
  uploadBufferToServer,
  type BlossomBlobDescriptor,
} from '@src/nostr/blossom';
import { bunkerSignEvent } from '@src/nostr/bunker';
import type { BunkerSignerData } from '@src/nostr/connections';
import { fetchNip65WriteRelays } from '@src/nostr/nip65';

const MAX_PLUGIN_ICON_BYTES = 2 * 1024;

export type PluginSvgIcon = {
  path: string;
  data: Uint8Array;
};

export function readPluginSvgIcon({
  pluginDir,
  iconPath,
}: {
  pluginDir: string;
  iconPath: string;
}): PluginSvgIcon {
  if (!iconPath.endsWith('.svg')) {
    throw new Error('appweaver.icon must point to an .svg file.');
  }

  const pluginRoot = resolve(pluginDir);
  const fullPath = resolve(pluginRoot, iconPath);

  if (!fullPath.startsWith(`${pluginRoot}/`)) {
    throw new Error('appweaver.icon must stay inside the plugin directory.');
  }

  if (!existsSync(fullPath)) {
    throw new Error(`appweaver.icon file not found: ${iconPath}`);
  }

  const icon = readFileSync(fullPath);

  if (icon.byteLength > MAX_PLUGIN_ICON_BYTES) {
    throw new Error(
      `appweaver.icon must be ${MAX_PLUGIN_ICON_BYTES} bytes or smaller; got ${icon.byteLength} bytes.`,
    );
  }

  if (!icon.toString('utf8').trimStart().startsWith('<svg')) {
    throw new Error(
      'appweaver.icon must be an SVG file whose content starts with <svg.',
    );
  }

  return { path: iconPath, data: Uint8Array.from(icon) };
}

type UploadPluginIconProps = {
  pool: SimplePool;
  bunkerData: BunkerSignerData;
  icon: PluginSvgIcon;
};

export async function uploadPluginIcon({
  pool,
  bunkerData,
  icon,
}: UploadPluginIconProps): Promise<string> {
  const relayUrls = await fetchNip65WriteRelays({
    pool,
    authorPubkey: bunkerData.remoteSignerPubkey,
  });

  const servers = await fetchBlossomServerUrls({
    pool,
    relayUrls,
    authorPubkey: bunkerData.userPubkey,
  });

  if (servers.length === 0) {
    throw new Error(
      'No Blossom servers found for this identity. Publish a kind 10063 server list first.',
    );
  }

  const hashHex = await sha256Hex(icon.data);

  const auth = await createBlossomAuthBase64({
    action: 'upload',
    xTags: [hashHex],
    expirationSeconds: null,
    signEvent: (template) => bunkerSignEvent(pool, bunkerData, template),
  });

  const results = await Promise.allSettled(
    servers.map((server) =>
      uploadBufferToServer(server, icon.data, 'image/svg+xml', auth),
    ),
  );

  const uploaded = results.find(
    (result): result is PromiseFulfilledResult<BlossomBlobDescriptor> =>
      result.status === 'fulfilled',
  );

  if (!uploaded) {
    const errors = results
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      )
      .map((result) =>
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      );

    throw new Error(
      `Icon upload failed on all Blossom servers: ${errors.join('; ') || 'unknown error'}`,
    );
  }

  return uploaded.value.url;
}
