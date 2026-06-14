#!/usr/bin/env bun

import { mkdir, readdir, unlink } from 'fs/promises';
import { resolve } from 'path';

import { chromium, type Locator, type Page } from 'playwright';

type CliOptions = {
  url: string;
  framesDir: string;
  fps: number;
  durationMs: number;
  endHoldMs: number;
  viewportWidth: number;
  viewportHeight: number;
  mobile: boolean;
  selector: string;
};

type FlagSpec = {
  name: keyof CliOptions;
  value: string;
};

const DEFAULT_URL = 'http://localhost:5552';
const DEFAULT_FRAMES_DIR = 'recordings/landing-story/frames';
const DEFAULT_FPS = 30;
const DEFAULT_DURATION_MS = 30_000;
const DEFAULT_END_HOLD_MS = 2_500;
const DEFAULT_VIEWPORT_WIDTH = 1440;
const DEFAULT_VIEWPORT_HEIGHT = 1000;
const DEFAULT_MOBILE_VIEWPORT_WIDTH = 390;
const DEFAULT_MOBILE_VIEWPORT_HEIGHT = 844;
const DEFAULT_SELECTOR = '[data-ui="story-playback-toggle"]';
const SELECTOR_POLL_MS = 250;
const PLAYBACK_POLL_MS = 50;

function usage(): string {
  return `Usage: bun run record:landing-story [options]

Options:
  --url <url>          Page to record. Default: ${DEFAULT_URL}
  --out <dir>          Directory for numbered PNG frames. Default: ${DEFAULT_FRAMES_DIR}
  --fps <number>       Capture FPS. Default: ${DEFAULT_FPS}
  --duration <seconds> Maximum recording duration after you click Play. Default: ${DEFAULT_DURATION_MS / 1000}
  --end-hold <seconds> Keep recording after story completes. Default: ${DEFAULT_END_HOLD_MS / 1000}
  --viewport <WxH>     Browser viewport. Default: ${DEFAULT_VIEWPORT_WIDTH}x${DEFAULT_VIEWPORT_HEIGHT}
  --mobile             Use mobile emulation and default viewport ${DEFAULT_MOBILE_VIEWPORT_WIDTH}x${DEFAULT_MOBILE_VIEWPORT_HEIGHT}
  --selector <css>     Playback toggle selector. Default: ${DEFAULT_SELECTOR}
  --help              Show this help text
`;
}

function parsePositiveNumber(value: string, label: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number: ${value}`);
  }

  return parsed;
}

function parseViewport(value: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());

  if (!match) {
    throw new Error(`viewport must use WIDTHxHEIGHT format: ${value}`);
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function readFlag({ name, value }: FlagSpec, options: CliOptions): void {
  if (name === 'url') {
    options.url = value;

    return;
  }

  if (name === 'framesDir') {
    options.framesDir = value;

    return;
  }

  if (name === 'fps') {
    options.fps = parsePositiveNumber(value, '--fps');

    return;
  }

  if (name === 'durationMs') {
    options.durationMs = parsePositiveNumber(value, '--duration') * 1000;

    return;
  }

  if (name === 'endHoldMs') {
    options.endHoldMs = parsePositiveNumber(value, '--end-hold') * 1000;

    return;
  }

  if (name === 'selector') {
    options.selector = value;

    return;
  }

  if (name === 'viewportWidth' || name === 'viewportHeight') {
    const viewport = parseViewport(value);
    options.viewportWidth = viewport.width;
    options.viewportHeight = viewport.height;
  }
}

function parseCliOptions(): CliOptions {
  const mobile = process.env.RECORD_STORY_MOBILE === '1';

  const options: CliOptions = {
    url: process.env.RECORD_STORY_URL?.trim() || DEFAULT_URL,
    framesDir: process.env.RECORD_STORY_OUT?.trim() || DEFAULT_FRAMES_DIR,
    fps: process.env.RECORD_STORY_FPS
      ? parsePositiveNumber(process.env.RECORD_STORY_FPS, 'RECORD_STORY_FPS')
      : DEFAULT_FPS,
    durationMs: process.env.RECORD_STORY_DURATION
      ? parsePositiveNumber(
          process.env.RECORD_STORY_DURATION,
          'RECORD_STORY_DURATION',
        ) * 1000
      : DEFAULT_DURATION_MS,
    endHoldMs: process.env.RECORD_STORY_END_HOLD
      ? parsePositiveNumber(
          process.env.RECORD_STORY_END_HOLD,
          'RECORD_STORY_END_HOLD',
        ) * 1000
      : DEFAULT_END_HOLD_MS,
    viewportWidth: mobile
      ? DEFAULT_MOBILE_VIEWPORT_WIDTH
      : DEFAULT_VIEWPORT_WIDTH,
    viewportHeight: mobile
      ? DEFAULT_MOBILE_VIEWPORT_HEIGHT
      : DEFAULT_VIEWPORT_HEIGHT,
    mobile,
    selector: process.env.RECORD_STORY_SELECTOR?.trim() || DEFAULT_SELECTOR,
  };

  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }

    if (arg === '--mobile') {
      options.mobile = true;

      if (
        options.viewportWidth === DEFAULT_VIEWPORT_WIDTH &&
        options.viewportHeight === DEFAULT_VIEWPORT_HEIGHT
      ) {
        options.viewportWidth = DEFAULT_MOBILE_VIEWPORT_WIDTH;
        options.viewportHeight = DEFAULT_MOBILE_VIEWPORT_HEIGHT;
      }

      continue;
    }

    const value = args[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for ${arg}`);
    }

    if (arg === '--url') {
      readFlag({ name: 'url', value }, options);
    } else if (arg === '--out') {
      readFlag({ name: 'framesDir', value }, options);
    } else if (arg === '--fps') {
      readFlag({ name: 'fps', value }, options);
    } else if (arg === '--duration') {
      readFlag({ name: 'durationMs', value }, options);
    } else if (arg === '--end-hold') {
      readFlag({ name: 'endHoldMs', value }, options);
    } else if (arg === '--viewport') {
      readFlag({ name: 'viewportWidth', value }, options);
    } else if (arg === '--selector') {
      readFlag({ name: 'selector', value }, options);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }

    index += 1;
  }

  return options;
}

async function clearOldFrames(framesDir: string): Promise<number> {
  await mkdir(framesDir, { recursive: true });

  const entries = await readdir(framesDir, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !/^\d{4,}\.png$/.test(entry.name)) {
      continue;
    }

    await unlink(resolve(framesDir, entry.name));
    removed += 1;
  }

  return removed;
}

async function firstVisibleLocator(
  page: Page,
  selector: string,
): Promise<Locator> {
  while (true) {
    const direct = page.locator(selector).first();

    try {
      if ((await direct.count()) > 0 && (await direct.isVisible())) {
        return direct;
      }
    } catch {
      // The page may be navigating or replacing story UI while the user picks a story.
    }

    for (const frame of page.frames()) {
      const frameLocator = frame.locator(selector).first();

      try {
        if (
          (await frameLocator.count()) > 0 &&
          (await frameLocator.isVisible())
        ) {
          return frameLocator;
        }
      } catch {
        // Same as above: keep polling until the user opens a story.
      }
    }

    await page.waitForTimeout(SELECTOR_POLL_MS);
  }
}

async function isPlaybackRunning(toggle: Locator): Promise<boolean> {
  const ariaPressed = await toggle.getAttribute('aria-pressed');
  const complete = await toggle.getAttribute('data-story-playback-complete');

  return ariaPressed === 'true' && complete !== 'true';
}

async function isPlaybackComplete(toggle: Locator): Promise<boolean> {
  return (await toggle.getAttribute('data-story-playback-complete')) === 'true';
}

async function waitForManualPlaybackStart(toggle: Locator): Promise<void> {
  while (!(await isPlaybackRunning(toggle))) {
    await toggle.page().waitForTimeout(PLAYBACK_POLL_MS);
  }
}

async function recordFrames(options: CliOptions): Promise<void> {
  const framesDir = resolve(options.framesDir);
  const removedFrameCount = await clearOldFrames(framesDir);
  const browser = await chromium.launch({ headless: false });

  try {
    const context = await browser.newContext({
      hasTouch: options.mobile,
      isMobile: options.mobile,
      viewport: {
        width: options.viewportWidth,
        height: options.viewportHeight,
      },
    });

    const page = await context.newPage();

    console.log(`[record] Opening ${options.url}`);
    await page.goto(options.url, { waitUntil: 'domcontentloaded' });

    console.log('[record] Open/select a story, then click its Play button.');
    const toggle = await firstVisibleLocator(page, options.selector);

    console.log(
      '[record] Story playback toggle found. Waiting for your click...',
    );

    await waitForManualPlaybackStart(toggle);
    console.log('[record] Playback started. Recording frames...');

    const maxFrames = Math.ceil((options.durationMs / 1000) * options.fps);
    const intervalMs = 1000 / options.fps;
    const startedAt = performance.now();
    let stopAfterMs: number | null = null;

    if (removedFrameCount > 0) {
      console.log(`[record] Removed ${removedFrameCount} existing frame(s).`);
    }

    console.log(
      `[record] Capturing up to ${maxFrames} frame(s) at ${options.fps} FPS to ${framesDir}`,
    );

    for (let frameIndex = 1; frameIndex <= maxFrames; frameIndex += 1) {
      const path = resolve(
        framesDir,
        `${String(frameIndex).padStart(4, '0')}.png`,
      );

      await page.screenshot({ path });

      if (stopAfterMs === null && (await isPlaybackComplete(toggle))) {
        stopAfterMs = performance.now() + options.endHoldMs;

        console.log(
          `[record] Story completed after ${frameIndex} frame(s); holding final state for ${options.endHoldMs / 1000}s.`,
        );
      }

      if (stopAfterMs !== null && performance.now() >= stopAfterMs) {
        break;
      }

      const nextFrameAt = startedAt + frameIndex * intervalMs;
      const waitMs = Math.max(0, nextFrameAt - performance.now());

      if (waitMs > 0) {
        await page.waitForTimeout(waitMs);
      }
    }

    console.log('[record] Done.');
  } finally {
    await browser.close();
  }
}

try {
  await recordFrames(parseCliOptions());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
}
