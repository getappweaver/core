import { mkdir, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { parseArgs } from 'util';
import { chromium, type Locator, type Page } from 'playwright';

import type { StoryCaptureBeat, StoryCaptureManifest, TargetRect } from './types';

type MeasureTargetRelativeRectProps = {
  cardBox: { x: number; y: number; width: number; height: number };
  targetBox: { x: number; y: number; width: number; height: number };
  dpr: number;
};

function measureTargetRelativeRect({
  cardBox,
  targetBox,
  dpr,
}: MeasureTargetRelativeRectProps): TargetRect {
  const relX = targetBox.x - cardBox.x;
  const relY = targetBox.y - cardBox.y;

  return {
    x: Math.round(relX * dpr),
    y: Math.round(relY * dpr),
    w: Math.round(targetBox.width * dpr),
    h: Math.round(targetBox.height * dpr),
  };
}

type CaptureBeatProps = {
  page: Page;
  cardLocator: Locator;
  afterCardLocator?: Locator;
  targetLocator: Locator;
  stepIndex: number;
  targetId: string;
  title: string;
  description: string;
  outDir: string;
  actionType: 'click' | 'focus';
  dpr: number;
  storyId: string;
  postAction?: () => Promise<void>;
};

type CaptureBeatResult = {
  beat: StoryCaptureBeat;
  beforeCardBox: { width: number; height: number };
};

async function captureBeat({
  page,
  cardLocator,
  afterCardLocator,
  targetLocator,
  stepIndex,
  targetId,
  title,
  description,
  outDir,
  actionType,
  dpr,
  storyId,
  postAction,
}: CaptureBeatProps): Promise<CaptureBeatResult> {
  const beforeCardName = `state-${stepIndex}-before.png`;
  const afterCardName = `state-${stepIndex}-after.png`;
  const cropName = `state-${stepIndex}-crop.png`;

  const beforeCardPath = resolve(outDir, beforeCardName);
  const afterCardPath = resolve(outDir, afterCardName);
  const cropPath = resolve(outDir, cropName);

  const shadowHideRules =
    storyId === 'todo-add-ai-prompt'
      ? `.todo-root-add-stack, .todo-new-root-stack, .todo-new-root-button-stack`
      : storyId === 'todo-add'
        ? `.todo-ai-prompt-form`
        : `.todo-ai-prompt-form, .todo-root-add-stack, .todo-new-root-stack, .todo-new-root-button-stack`;

  const extraShadowRules =
    storyId === 'todo-add'
      ? `.web-overflow-panel.is-flip-up { top: 100% !important; bottom: auto !important; }`
      : '';

  const injectCleanWidgetStyles = async () => {
    await page.evaluate(
      ({ hideRules, extraRules }) => {
        const hosts = document.querySelectorAll('.web-ui-shadow-host');
        for (const h of hosts) {
          let s = h.shadowRoot?.querySelector('#story-capture-shadow-style');
          if (h.shadowRoot && !s) {
            s = document.createElement('style');
            s.id = 'story-capture-shadow-style';
            h.shadowRoot.appendChild(s);
          }
          if (s) {
            s.textContent = `
              ${hideRules} {
                display: none !important;
              }
              ${extraRules}
            `;
          }
        }
      },
      { hideRules: shadowHideRules, extraRules: extraShadowRules },
    );
  };

  await injectCleanWidgetStyles();
  await page.waitForTimeout(300);

  const cardBox = await cardLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();

  console.log(`[captureBeat:${stepIndex}] cardBox:`, cardBox, `targetBox (${targetId}):`, targetBox);

  if (!cardBox || !targetBox) {
    throw new Error(`Bounding box missing for target: ${targetId}`);
  }

  const targetRect = measureTargetRelativeRect({ cardBox, targetBox, dpr });

  await cardLocator.screenshot({ path: beforeCardPath });
  await targetLocator.screenshot({ path: cropPath });

  if (actionType === 'click') {
    await targetLocator.click({ force: true });
    await page.waitForTimeout(400);
    if (postAction) {
      await postAction();
    }
    await page.waitForTimeout(400);
    await injectCleanWidgetStyles();
    await page.waitForTimeout(200);
  }

  const actualAfterCardLocator = afterCardLocator ?? cardLocator;
  await actualAfterCardLocator.screenshot({ path: afterCardPath });

  return {
    beat: {
      stepIndex,
      targetId,
      title,
      description,
      targetRect,
      cropPath: cropName,
      beforeCardPath: beforeCardName,
      afterCardPath: afterCardName,
      actionType,
    },
    beforeCardBox: {
      width: Math.round(cardBox.width * dpr),
      height: Math.round(cardBox.height * dpr),
    },
  };
}

type RunStoryCaptureProps = {
  storyId: string;
  url: string;
  outDir: string;
  channel: string;
};

export async function runStoryCapture({
  storyId,
  url,
  outDir,
  channel,
}: RunStoryCaptureProps): Promise<StoryCaptureManifest> {
  await mkdir(outDir, { recursive: true });

  const rootDir = resolve(import.meta.dirname, '../../../..');
  const storiesJsonPath = resolve(rootDir, 'web/public/demo/stories.json');
  const storiesContent = await readFile(storiesJsonPath, 'utf8');
  const storiesList = JSON.parse(storiesContent) as Array<{
    pluginAlias: string;
    story: {
      id: string;
      title: string;
      description?: string;
      showcase?: { title: string; description: string };
      steps: Array<{
        type: string;
        target?: { type: string; command?: string; subcommand?: string; targetId?: string };
        showcase?: { title: string; description: string };
      }>;
    };
  }>;

  const storyEntry = storiesList.find((entry) => entry.story.id === storyId);

  if (!storyEntry) {
    throw new Error(`Story "${storyId}" not found in demo stories.json`);
  }

  const pluginTag = `/${storyEntry.pluginAlias}`;
  const storyTitle = storyEntry.story.showcase?.title ?? storyEntry.story.title;
  const storyDesc =
    storyEntry.story.showcase?.description ??
    storyEntry.story.description ??
    storyTitle;

  const dpr = 2;
  const launchOptions = channel.length > 0 ? { channel, headless: true } : { headless: true };
  const browser = await chromium.launch(launchOptions);

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: dpr,
    });

    const targetUrl = `${url}/?story=${encodeURIComponent(storyId)}&capture=1`;
    console.log(`[capture-story] Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // Hide any walkthrough overlay chrome, help panels, or scrollbars to ensure 100% pure widget captures
    await page.addStyleTag({
      content: `
        .widget-help-panel,
        [data-ui="widget-help-panel"],
        .story-walkthrough,
        [data-ui="story-playback-toggle"],
        [data-ui="walkthrough-overlay"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }
        .singleton-dock-card--active .singleton-dock-card__body,
        .singleton-dock-card--active .singleton-dock-card__body > .card {
          height: auto !important;
          max-height: max-content !important;
          align-self: flex-start !important;
        }
        ::-webkit-scrollbar { display: none !important; }
      `,
    });

    console.log('[capture-story] Waiting for app and header widget...');
    const widgetTargetId = `header-widget:${storyEntry.pluginAlias}:list`;
    const widgetButton = page.locator(`[data-story-target="${widgetTargetId}"]`).first();
    await widgetButton.waitFor({ state: 'visible', timeout: 20000 });
    await widgetButton.click();

    console.log('[capture-story] Widget opened. Waiting for result card...');
    const cardLocator = page.locator('.card.result-card').first();
    await cardLocator.waitFor({ state: 'visible', timeout: 15000 });

    const beats: StoryCaptureBeat[] = [];
    let initialCardDimensions = { width: 900, height: 800 };

    if (storyId === 'todo-filter-champions') {
      // Step A: Open list filter options
      console.log('[capture-story] Locating filter toggle...');
      const filterToggle = page.locator('[data-story-target="todo-list-filter-toggle"]').first();
      await filterToggle.waitFor({ state: 'visible', timeout: 10000 });
      await filterToggle.click();

      // Beat 1: Toggle champions filter
      console.log('[capture-story] Capturing Beat 1 (Show only champions filter)...');
      const championFilter = page.locator('[data-story-target="todo-filter-champion"]').first();
      await championFilter.waitFor({ state: 'visible', timeout: 10000 });

      const beatResult = await captureBeat({
        page,
        cardLocator,
        targetLocator: championFilter,
        stepIndex: 1,
        targetId: 'todo-filter-champion',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
      });
      beats.push(beatResult.beat);
      initialCardDimensions = beatResult.beforeCardBox;
    } else if (storyId === 'todo-duel-prioritize') {
      // Beat 1: On unranked list, click "Prioritize"
      console.log('[capture-story] Locating prioritize button...');
      const prioritizeBtn = page.locator('[data-story-target="todo-prioritize"]').first();
      await prioritizeBtn.waitFor({ state: 'visible', timeout: 10000 });

      console.log('[capture-story] Capturing Beat 1 (Start prioritize)...');
      const beat1 = await captureBeat({
        page,
        cardLocator,
        targetLocator: prioritizeBtn,
        stepIndex: 1,
        targetId: 'todo-prioritize',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
        postAction: async () => {
          const pick1 = page.locator('[data-story-target="todo-champion-pick-1"]').first();
          await pick1.waitFor({ state: 'visible', timeout: 10000 });
        },
      });
      beats.push(beat1.beat);
      initialCardDimensions = beat1.beforeCardBox;

      // Beat 2: Pick champion 1, then advance picks 2 & 3 to reach tournament 1 A/B duel screen
      console.log('[capture-story] Locating champion pick 1...');
      const pick1 = page.locator('[data-story-target="todo-champion-pick-1"]').first();
      await pick1.waitFor({ state: 'visible', timeout: 10000 });

      console.log('[capture-story] Capturing Beat 2 (Pick branch champions and advance to tournament)...');
      const beat2 = await captureBeat({
        page,
        cardLocator,
        targetLocator: pick1,
        stepIndex: 2,
        targetId: 'todo-champion-pick-1',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
        postAction: async () => {
          const duel1A = page.locator('[data-story-target="todo-duel-answer-1-A"]').first();
          await duel1A.waitFor({ state: 'visible', timeout: 10000 });
        },
      });
      beats.push(beat2.beat);

      // Beat 3: Duel tournament 1: pick choice A, advancing to tournament 2 screen
      console.log('[capture-story] Locating duel answer 1-A...');
      const duel1A = page.locator('[data-story-target="todo-duel-answer-1-A"]').first();
      await duel1A.waitFor({ state: 'visible', timeout: 10000 });

      console.log('[capture-story] Capturing Beat 3 (Tournament duel 1)...');
      const beat3 = await captureBeat({
        page,
        cardLocator,
        targetLocator: duel1A,
        stepIndex: 3,
        targetId: 'todo-duel-answer-1-A',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
        postAction: async () => {
          const duel2B = page.locator('[data-story-target="todo-duel-answer-2-B"]').first();
          await duel2B.waitFor({ state: 'visible', timeout: 10000 });
        },
      });
      beats.push(beat3.beat);

      // Beat 4: Duel tournament 2: pick choice B, returning to final list with winner
      console.log('[capture-story] Locating duel answer 2-B...');
      const duel2B = page.locator('[data-story-target="todo-duel-answer-2-B"]').first();
      await duel2B.waitFor({ state: 'visible', timeout: 10000 });

      console.log('[capture-story] Capturing Beat 4 (Tournament duel 2 and winner reveal)...');
      const beat4 = await captureBeat({
        page,
        cardLocator,
        targetLocator: duel2B,
        stepIndex: 4,
        targetId: 'todo-duel-answer-2-B',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
        postAction: async () => {
          const winnerItem = page.locator('.todo-item-row--winner').first();
          await winnerItem.waitFor({ state: 'visible', timeout: 10000 });
        },
      });
      beats.push(beat4.beat);
    } else if (storyId === 'todo-add-ai-prompt') {
      // Style prompt-card so it matches the 450px dock width cleanly
      await page.addStyleTag({
        content: `
          .card.prompt-card {
            max-width: 450px !important;
            width: 450px !important;
          }
        `,
      });

      console.log('[capture-story] Filling AI prompt textarea...');
      const promptInput = page.locator('[data-story-target="todo-ai-prompt-text"], textarea').first();
      await promptInput.waitFor({ state: 'visible', timeout: 10000 });
      await promptInput.fill(
        'Create follow-up tasks for a live AppWeaver demo: prepare notes, schedule a dry run, and send the recap.',
      );
      await page.waitForTimeout(400);

      const submitBtn = page.locator('[data-story-target="todo-ai-prompt-submit"]').first();
      await submitBtn.waitFor({ state: 'visible', timeout: 10000 });

      const promptCardLocator = page.locator('.card.prompt-card').first();

      console.log('[capture-story] Capturing Beat 1 (Run AI prompt)...');
      const beat1 = await captureBeat({
        page,
        cardLocator,
        afterCardLocator: promptCardLocator,
        targetLocator: submitBtn,
        stepIndex: 1,
        targetId: 'todo-ai-prompt-submit',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
        postAction: async () => {
          const draftAccept = page.locator('[data-story-target="draft-review-accept"]').first();
          await draftAccept.waitFor({ state: 'visible', timeout: 10000 });
        },
      });
      beats.push(beat1.beat);
      initialCardDimensions = beat1.beforeCardBox;

      console.log('[capture-story] Capturing Beat 2 (Accept AI draft proposal)...');
      const draftAcceptBtn = page.locator('[data-story-target="draft-review-accept"]').first();
      const beat2 = await captureBeat({
        page,
        cardLocator: promptCardLocator,
        afterCardLocator: cardLocator,
        targetLocator: draftAcceptBtn,
        stepIndex: 2,
        targetId: 'draft-review-accept',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
        postAction: async () => {
          await page.waitForTimeout(600);
        },
      });
      beats.push(beat2.beat);
    } else if (storyId === 'todo-add') {
      // Beat 1: Hover row 105, click todo-row-actions-105 to open menu
      console.log('[capture-story] Locating row 105 and row actions...');
      const row105 = page.locator('[data-story-target="todo-row-105"]').first();
      await row105.waitFor({ state: 'visible', timeout: 10000 });
      await row105.hover();
      await page.waitForTimeout(400);

      const rowActions105 = page.locator('[data-story-target="todo-row-actions-105"]').first();
      await rowActions105.waitFor({ state: 'visible', timeout: 10000 });

      console.log('[capture-story] Capturing Beat 1 (Open row actions menu)...');
      const beat1 = await captureBeat({
        page,
        cardLocator,
        targetLocator: rowActions105,
        stepIndex: 1,
        targetId: 'todo-row-actions-105',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
      });
      beats.push(beat1.beat);
      initialCardDimensions = beat1.beforeCardBox;

      // Beat 2: Click todo-add-child-105, and in postAction fill the input
      console.log('[capture-story] Locating add child action...');
      const addChild105 = page.locator('[data-story-target="todo-add-child-105"]').first();
      await addChild105.waitFor({ state: 'visible', timeout: 10000 });

      console.log('[capture-story] Capturing Beat 2 (Reveal and fill inline add child form)...');
      const beat2 = await captureBeat({
        page,
        cardLocator,
        targetLocator: addChild105,
        stepIndex: 2,
        targetId: 'todo-add-child-105',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
        postAction: async () => {
          const addText = page.locator('[data-story-target="todo-add-text"], input[type="text"]').first();
          await addText.waitFor({ state: 'visible', timeout: 10000 });
          await addText.fill('Verify permission boundaries');
          await page.waitForTimeout(300);
        },
      });
      beats.push(beat2.beat);

      // Beat 3: Click todo-add-submit to create subtask and render expanded tree
      console.log('[capture-story] Locating add submit button...');
      const addSubmit = page.locator('[data-story-target="todo-add-submit"]').first();
      await addSubmit.waitFor({ state: 'visible', timeout: 10000 });

      console.log('[capture-story] Capturing Beat 3 (Submit nested child task)...');
      const beat3 = await captureBeat({
        page,
        cardLocator,
        targetLocator: addSubmit,
        stepIndex: 3,
        targetId: 'todo-add-submit',
        title: storyTitle,
        description: storyDesc,
        outDir,
        actionType: 'click',
        dpr,
        storyId,
        postAction: async () => {
          const item108 = page.locator('[data-story-target="todo-row-108"]').first();
          await item108.waitFor({ state: 'visible', timeout: 10000 });
        },
      });
      beats.push(beat3.beat);
    } else {
      throw new Error(`Workflow for story "${storyId}" not implemented yet.`);
    }

    const manifest: StoryCaptureManifest = {
      storyId,
      pluginTag,
      title: storyTitle,
      description: storyDesc,
      cardWidth: initialCardDimensions.width,
      cardHeight: initialCardDimensions.height,
      dpr,
      beats,
    };

    const manifestPath = resolve(outDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`[capture-story] Wrote capture manifest to: ${manifestPath}`);

    return manifest;
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      story: { type: 'string', default: 'todo-filter-champions' },
      url: { type: 'string', default: 'http://127.0.0.1:5553' },
      out: { type: 'string', default: 'scratch/story-media/todo-filter-champions' },
      channel: { type: 'string', default: 'chrome' },
    },
  });

  void runStoryCapture({
    storyId: values.story,
    url: values.url,
    outDir: resolve(values.out),
    channel: values.channel,
  }).catch((err: unknown) => {
    console.error('[capture-story] Failed:', err);
    process.exit(1);
  });
}
