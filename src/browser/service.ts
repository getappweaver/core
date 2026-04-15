import { mkdirSync } from 'fs';

import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';

import { log } from '@src/logger';

export type BrowserRuntimeConfig = {
  profileDir: string;
  headless: boolean;
};

export type BrowserInteractableElement = {
  id: string;
  tag: string;
  role: string | null;
  label: string | null;
  text: string | null;
  inputType: string | null;
  disabled: boolean;
};

export type BrowserSnapshot = {
  url: string;
  title: string;
  visibleTextSummary: string;
  interactableElements: BrowserInteractableElement[];
};

export type BrowserAction =
  | { type: 'start' }
  | { type: 'prompt_user'; message: string }
  | { type: 'navigate'; url: string }
  | { type: 'snapshot' }
  | { type: 'click'; elementId: string }
  | { type: 'type'; elementId: string; text: string; clear?: boolean }
  | { type: 'press'; key: string }
  | { type: 'scroll'; deltaX?: number; deltaY?: number }
  | { type: 'wait'; elementId?: string; text?: string; timeoutMs?: number };

export type BrowserActionResult = {
  summary: string;
  snapshot: BrowserSnapshot;
};

const STABLE_ID_ATTR = 'data-dm-bot-browser-id';
const MAX_SNAPSHOT_ELEMENTS = 40;
const MAX_VISIBLE_TEXT_CHARS = 1400;

const BRAVE_EXECUTABLE_PATH =
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const BROWSER_LAUNCH_ARGS = ['--disable-blink-features=AutomationControlled'];

class BrowserService {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private activeProfileDir: string | null = null;

  private async getPage(config: BrowserRuntimeConfig): Promise<Page> {
    if (
      this.context === null ||
      this.activeProfileDir !== config.profileDir ||
      this.context.browser()?.isConnected() === false
    ) {
      await this.dispose();
      mkdirSync(config.profileDir, { recursive: true });

      log.info(
        `browser: launching persistent Chromium (${config.headless ? 'headless' : 'headed'}) at ${config.profileDir}`,
      );

      this.context = await chromium.launchPersistentContext(config.profileDir, {
        executablePath: BRAVE_EXECUTABLE_PATH,
        headless: config.headless,
        args: BROWSER_LAUNCH_ARGS,
        ignoreDefaultArgs: ['--enable-automation'],
        viewport: null,
      });

      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true,
        });
      });

      this.activeProfileDir = config.profileDir;

      this.context.on('page', (page) => {
        this.page = page;
      });
    }

    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    const existing = this.context
      .pages()
      .find((candidate) => !candidate.isClosed());

    this.page = existing ?? (await this.context.newPage());

    return this.page;
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }

    this.context = null;
    this.page = null;
    this.activeProfileDir = null;
  }

  async ensureStarted(
    config: BrowserRuntimeConfig,
  ): Promise<BrowserActionResult> {
    const page = await this.getPage(config);
    await settlePage(page);

    return {
      summary: `Browser ready with persistent profile at ${config.profileDir}.`,
      snapshot: await this.snapshot(config),
    };
  }

  async snapshot(config: BrowserRuntimeConfig): Promise<BrowserSnapshot> {
    const page = await this.getPage(config);
    await settlePage(page);

    const snapshot = await page.evaluate(
      ({ attr, maxElements, maxVisibleTextChars }) => {
        const scopedWindow = window as Window & {
          __dmBotBrowserNextId?: number;
        };

        if (typeof scopedWindow.__dmBotBrowserNextId !== 'number') {
          scopedWindow.__dmBotBrowserNextId = 1;
        }

        function normalizeText(
          value: string | null | undefined,
        ): string | null {
          const normalized = (value ?? '').replace(/\s+/g, ' ').trim();

          return normalized.length > 0 ? normalized : null;
        }

        function isVisible(el: Element): boolean {
          const htmlEl = el as HTMLElement;
          const style = window.getComputedStyle(htmlEl);
          const rect = htmlEl.getBoundingClientRect();

          return !(
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0' ||
            rect.width === 0 ||
            rect.height === 0
          );
        }

        function getStableId(el: Element): string {
          const existing = el.getAttribute(attr);

          if (existing) {
            return existing;
          }

          const nextId = `e${scopedWindow.__dmBotBrowserNextId ?? 1}`;

          scopedWindow.__dmBotBrowserNextId =
            (scopedWindow.__dmBotBrowserNextId ?? 1) + 1;

          el.setAttribute(attr, nextId);

          return nextId;
        }

        function getLabel(el: Element): string | null {
          const htmlEl = el as HTMLElement;
          const ariaLabel = normalizeText(htmlEl.getAttribute('aria-label'));

          if (ariaLabel) {
            return ariaLabel;
          }

          if (htmlEl instanceof HTMLInputElement) {
            const fromLabels = normalizeText(
              Array.from(htmlEl.labels ?? [])
                .map((label) => label.innerText || label.textContent || '')
                .join(' '),
            );

            if (fromLabels) {
              return fromLabels;
            }
          }

          return (
            normalizeText(htmlEl.getAttribute('placeholder')) ??
            normalizeText(htmlEl.innerText) ??
            normalizeText(htmlEl.textContent)
          );
        }

        const selectors = [
          'a[href]',
          'button',
          'input:not([type="hidden"])',
          'textarea',
          'select',
          'summary',
          '[role="button"]',
          '[role="link"]',
          '[contenteditable="true"]',
          '[contenteditable=""]',
        ].join(',');

        const interactableElements = Array.from(
          document.querySelectorAll(selectors),
        )
          .filter((el) => isVisible(el))
          .slice(0, maxElements)
          .map((el) => {
            const htmlEl = el as HTMLElement;
            const inputEl = el instanceof HTMLInputElement ? el : null;

            return {
              id: getStableId(el),
              tag: el.tagName.toLowerCase(),
              role: normalizeText(el.getAttribute('role')),
              label: getLabel(el),
              text:
                normalizeText(htmlEl.innerText) ??
                normalizeText(el.textContent),
              inputType: inputEl ? normalizeText(inputEl.type) : null,
              disabled:
                htmlEl.hasAttribute('disabled') ||
                htmlEl.getAttribute('aria-disabled') === 'true',
            };
          });

        const visibleTextSummary = normalizeText(
          document.body?.innerText,
        )?.slice(0, maxVisibleTextChars);

        return {
          url: window.location.href,
          title: document.title,
          visibleTextSummary: visibleTextSummary ?? '',
          interactableElements,
        };
      },
      {
        attr: STABLE_ID_ATTR,
        maxElements: MAX_SNAPSHOT_ELEMENTS,
        maxVisibleTextChars: MAX_VISIBLE_TEXT_CHARS,
      },
    );

    return snapshot;
  }

  async runAction(
    config: BrowserRuntimeConfig,
    action: BrowserAction,
  ): Promise<BrowserActionResult> {
    const page = await this.getPage(config);

    if (action.type === 'start') {
      return this.ensureStarted(config);
    }

    if (action.type === 'navigate') {
      await page.goto(action.url, { waitUntil: 'domcontentloaded' });
      await settlePage(page);

      return {
        summary: `Navigated to ${action.url}.`,
        snapshot: await this.snapshot(config),
      };
    }

    if (action.type === 'snapshot') {
      return {
        summary: 'Captured a fresh browser snapshot.',
        snapshot: await this.snapshot(config),
      };
    }

    if (action.type === 'click') {
      await this.locatorForElementId(page, action.elementId).click();
      await settlePage(page);

      return {
        summary: `Clicked element ${action.elementId}.`,
        snapshot: await this.snapshot(config),
      };
    }

    if (action.type === 'type') {
      const locator = this.locatorForElementId(page, action.elementId);

      if (action.clear !== false) {
        await locator.clear().catch(() => undefined);
      }

      const typed = await locator.evaluate((el, text) => {
        const htmlEl = el as HTMLElement;

        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          el.focus();
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));

          return true;
        }

        if (htmlEl.isContentEditable) {
          htmlEl.focus();
          htmlEl.textContent = text;
          htmlEl.dispatchEvent(new Event('input', { bubbles: true }));

          return true;
        }

        return false;
      }, action.text);

      if (!typed) {
        await locator.click();
        await page.keyboard.type(action.text);
      }

      await settlePage(page);

      return {
        summary: `Typed into element ${action.elementId}.`,
        snapshot: await this.snapshot(config),
      };
    }

    if (action.type === 'press') {
      await page.keyboard.press(action.key);
      await settlePage(page);

      return {
        summary: `Pressed key ${action.key}.`,
        snapshot: await this.snapshot(config),
      };
    }

    if (action.type === 'scroll') {
      const deltaX = Number.isFinite(action.deltaX) ? (action.deltaX ?? 0) : 0;

      const deltaY = Number.isFinite(action.deltaY)
        ? (action.deltaY ?? 600)
        : 600;

      await page.mouse.wheel(deltaX, deltaY);
      await settlePage(page);

      return {
        summary: `Scrolled page by (${deltaX}, ${deltaY}).`,
        snapshot: await this.snapshot(config),
      };
    }

    if (action.type === 'wait') {
      const timeoutMs =
        Number.isFinite(action.timeoutMs) && (action.timeoutMs ?? 0) > 0
          ? (action.timeoutMs as number)
          : 10_000;

      if (action.elementId) {
        await this.locatorForElementId(page, action.elementId).waitFor({
          state: 'visible',
          timeout: timeoutMs,
        });
      } else if (action.text) {
        await page.getByText(action.text, { exact: false }).first().waitFor({
          state: 'visible',
          timeout: timeoutMs,
        });
      } else {
        await page.waitForTimeout(timeoutMs);
      }

      await settlePage(page);

      return {
        summary:
          action.elementId != null
            ? `Waited for element ${action.elementId}.`
            : action.text != null
              ? `Waited for text ${JSON.stringify(action.text)}.`
              : `Waited ${timeoutMs}ms.`,
        snapshot: await this.snapshot(config),
      };
    }

    throw new Error(`Unsupported browser action: ${JSON.stringify(action)}`);
  }

  private locatorForElementId(page: Page, elementId: string): Locator {
    return page
      .locator(`[${STABLE_ID_ATTR}="${cssEscape(elementId)}"]`)
      .first();
  }
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

async function settlePage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(250);
}

const singleton = new BrowserService();

export function getBrowserService(): BrowserService {
  return singleton;
}
