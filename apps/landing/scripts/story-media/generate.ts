import { existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { WORKSPACE_ROOT } from '../plugin-sources';
import { runStoryCapture } from './capture-story';
import { compileAndRender } from './compile-effectcraft';
import type { StoryCaptureManifest } from './types';

export function resolvePluginAlias(manifest: StoryCaptureManifest, storyId: string): string {
  if (manifest.pluginTag) {
    const fromTag = manifest.pluginTag.replace(/^\//, '').trim();
    if (fromTag) return fromTag;
  }
  const firstDash = storyId.indexOf('-');
  if (firstDash > 0) {
    return storyId.slice(0, firstDash);
  }
  return 'todo';
}

export function defaultStoryWorkDir(storyId: string): string {
  const firstDash = storyId.indexOf('-');
  const pluginAlias = firstDash > 0 ? storyId.slice(0, firstDash) : 'todo';
  return resolve(WORKSPACE_ROOT, 'plugins', pluginAlias, 'landing/story-media', storyId);
}

export type GenerateStoryMediaProps = {
  storyId: string;
  mediaName: string | null;
  url: string;
  outDir: string | null;
  fps: number;
  channel: string;
  reuseCapture: boolean;
  effectcraftCli: string;
  publish: boolean;
};

export async function generateStoryMedia({
  storyId,
  mediaName,
  url,
  outDir,
  fps,
  channel,
  reuseCapture,
  effectcraftCli,
  publish,
}: GenerateStoryMediaProps): Promise<void> {
  const name = mediaName ?? storyId;
  const absOutDir = resolve(outDir || defaultStoryWorkDir(name));
  mkdirSync(absOutDir, { recursive: true });

  const manifestPath = resolve(absOutDir, 'manifest.json');

  let manifest: StoryCaptureManifest;

  if (reuseCapture && existsSync(manifestPath)) {
    console.log(`[generate] Reusing existing capture from: ${manifestPath}`);
    const content = await readFile(manifestPath, 'utf8');
    manifest = JSON.parse(content) as StoryCaptureManifest;
  } else {
    console.log(`[generate] Running headless Playwright capture for: ${storyId}...`);
    manifest = await runStoryCapture({
      storyId,
      url,
      outDir: absOutDir,
      channel,
    });
  }

  const pluginAlias = resolvePluginAlias(manifest, storyId);
  const pluginRoot = resolve(WORKSPACE_ROOT, 'plugins', pluginAlias);
  const pluginAssetsDir = resolve(pluginRoot, 'landing/assets');
  mkdirSync(pluginAssetsDir, { recursive: true });

  const publishedWebm = resolve(pluginAssetsDir, `${name}.webm`);
  const publishedPoster = resolve(pluginAssetsDir, `${name}-poster.png`);
  const outSpotlight = resolve(absOutDir, 'spotlight.png');

  await compileAndRender({
    manifest,
    workDir: absOutDir,
    outWebm: publishedWebm,
    outPoster: publishedPoster,
    outSpotlight,
    effectcraftCli,
    fps,
  });

  if (publish) {
    console.log(`[generate] Published showcase media to: ${publishedWebm}`);
    console.log(`[generate] Published showcase poster to: ${publishedPoster}`);
  }
}

if (import.meta.main) {
  const defaultCli =
    process.env.EFFECTCRAFT_CLI?.trim() ||
    '/Users/baris/Downloads/effectcraft-cli-0.11.1-macos-universal/effectcraft-cli';

  const { values } = parseArgs({
    options: {
      story: { type: 'string', default: 'todo-filter-champions' },
      'media-name': { type: 'string' },
      url: { type: 'string', default: 'http://127.0.0.1:5553' },
      out: { type: 'string' },
      fps: { type: 'string', default: '60' },
      channel: { type: 'string', default: 'chrome' },
      'reuse-capture': { type: 'boolean', default: false },
      publish: { type: 'boolean', default: true },
      cli: { type: 'string', default: defaultCli },
    },
  });

  const storyId = values.story ?? 'todo-filter-champions';
  const mediaName = values['media-name'] ?? null;
  const name = mediaName ?? storyId;
  const outDir = values.out ? resolve(values.out) : defaultStoryWorkDir(name);
  const fps = Number(values.fps ?? '60');
  const reuseCapture = Boolean(values['reuse-capture']);
  const publish = values.publish !== false;
  const channel = values.channel ?? 'chrome';
  const url = values.url ?? 'http://127.0.0.1:5553';
  const cli = values.cli ?? defaultCli;

  void generateStoryMedia({
    storyId,
    mediaName,
    url,
    outDir,
    fps,
    channel,
    reuseCapture,
    effectcraftCli: cli,
    publish,
  }).catch((err: unknown) => {
    console.error('[generate] Failed:', err);
    process.exit(1);
  });
}
