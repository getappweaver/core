import { getOutputString } from '@src/backends/types';
import {
  getBrowserService,
  type BrowserAction,
  type BrowserSnapshot,
} from '@src/browser/service';
import {
  getCurrentOrDefaultMode,
  getModelOverride,
  getRoutstrSkKey,
} from '@src/db';
import type { WebNodeRoot } from '@src/web/ui-schema';

import { handleError, type RouteCommandContext } from '../../dispatch';

type BrowserAgentDecision =
  | {
      type: 'action';
      action: BrowserAction;
      comment?: string;
    }
  | {
      type: 'final';
      message: string;
    };

const MAX_BROWSER_STEPS = 12;
const MAX_MODEL_STEP_MS = 60_000;

export async function handleBotBrowser(
  ctx: RouteCommandContext,
): Promise<string | WebNodeRoot> {
  return handleError(async () => {
    const userPrompt = ctx.args.slice(1).join(' ').trim();

    if (!userPrompt) {
      return `Usage: ${ctx.prefix}bot browser <prompt>`;
    }

    const browser = getBrowserService();
    const config = ctx.config.browser;
    const mode = getCurrentOrDefaultMode(ctx.seenDb);
    const modelOverride = getModelOverride(ctx.seenDb, ctx.backend.name);
    const sessionId = await ctx.backend.createSession(ctx.cwd);

    let current = await browser.ensureStarted(config);
    let feedback = 'Browser started and initial snapshot captured.';
    const actionLog = [current.summary];

    try {
      for (let step = 1; step <= MAX_BROWSER_STEPS; step += 1) {
        const prompt = buildBrowserAgentPrompt({
          userPrompt,
          step,
          maxSteps: MAX_BROWSER_STEPS,
          feedback,
          snapshot: current.snapshot,
        });

        const abortController = new AbortController();

        const timeout = setTimeout(
          () => abortController.abort(),
          MAX_MODEL_STEP_MS,
        );

        const result = await ctx.backend
          .runMessage({
            sessionId,
            content: prompt,
            mode,
            cwd: ctx.cwd,
            getRoutstrSkKey: () => getRoutstrSkKey(ctx.seenDb),
            modelOverride,
            onAgentStreamChunk: null,
            streamAbortSignal: abortController.signal,
          })
          .finally(() => clearTimeout(timeout));

        const raw = getOutputString(result).trim();
        const decision = parseBrowserAgentDecision(raw);

        if (decision.type === 'final') {
          await maybeSendCompletionDm(ctx, decision.message);

          return renderBrowserResult({
            message: decision.message,
            snapshot: current.snapshot,
            actionLog,
            profileDir: config.profileDir,
            headless: config.headless,
          });
        }

        if (decision.action.type === 'prompt_user') {
          if (!ctx.promptFn) {
            throw new Error(
              'Browser agent requested user input but promptFn is unavailable.',
            );
          }

          const answer = (await ctx.promptFn(decision.action.message)).trim();

          current = {
            summary:
              'Captured a fresh browser snapshot after manual user action.',
            snapshot: await browser.snapshot(config),
          };

          feedback = [
            `User prompt: ${decision.action.message}`,
            `User reply: ${answer || '(empty)'}`,
            'Fresh snapshot captured after manual interaction.',
          ].join('\n');

          actionLog.push(
            `Prompted user: ${decision.action.message} Reply: ${answer || '(empty)'}.`,
          );

          continue;
        }

        try {
          current = await browser.runAction(config, decision.action);

          const actionLine = decision.comment
            ? `${current.summary} ${decision.comment}`
            : current.summary;

          actionLog.push(actionLine);

          feedback = [
            `Last action succeeded: ${current.summary}`,
            decision.comment ? `Model note: ${decision.comment}` : null,
          ]
            .filter((value): value is string => value !== null)
            .join('\n');
        } catch (error) {
          feedback = `Last action failed: ${error instanceof Error ? error.message : String(error)}`;
          actionLog.push(feedback);
        }
      }

      return renderBrowserResult({
        message:
          'Stopped after reaching the step limit. The browser profile was preserved and the browser was closed.',
        snapshot: current.snapshot,
        actionLog,
        profileDir: config.profileDir,
        headless: config.headless,
      });
    } finally {
      await browser.dispose();
    }
  }, 'Browser command failed');
}

async function maybeSendCompletionDm(
  ctx: RouteCommandContext,
  message: string,
): Promise<void> {
  if (ctx.source === 'nostr' || !ctx.sendDm) {
    return;
  }

  await ctx.sendDm(`Browser task finished. ${message}`);
}

function buildBrowserAgentPrompt(params: {
  userPrompt: string;
  step: number;
  maxSteps: number;
  feedback: string;
  snapshot: BrowserSnapshot;
}): string {
  return [
    'You are controlling a persistent Playwright browser session for the user.',
    'The browser is already running on the backend. Decide exactly one next step.',
    'Do not describe hypothetical browser actions. Either return one action to execute or return a final answer when the task is complete.',
    'Use only the current snapshot. Do not assume hidden DOM details.',
    'Prefer using stable element ids from interactableElements for click/type/wait actions.',
    'Keep responses as JSON only with no markdown fences and no extra prose.',
    '',
    `User task: ${params.userPrompt}`,
    `Step: ${params.step}/${params.maxSteps}`,
    '',
    'Allowed JSON response shapes:',
    '{"type":"action","comment":"short reason","action":{"type":"start"}}',
    '{"type":"action","comment":"short reason","action":{"type":"prompt_user","message":"Please log in to X in the opened browser, then reply once you are done."}}',
    '{"type":"action","comment":"short reason","action":{"type":"navigate","url":"https://example.com"}}',
    '{"type":"action","comment":"short reason","action":{"type":"snapshot"}}',
    '{"type":"action","comment":"short reason","action":{"type":"click","elementId":"e1"}}',
    '{"type":"action","comment":"short reason","action":{"type":"type","elementId":"e2","text":"hello","clear":true}}',
    '{"type":"action","comment":"short reason","action":{"type":"press","key":"Enter"}}',
    '{"type":"action","comment":"short reason","action":{"type":"scroll","deltaY":700}}',
    '{"type":"action","comment":"short reason","action":{"type":"wait","elementId":"e3","timeoutMs":10000}}',
    '{"type":"action","comment":"short reason","action":{"type":"wait","text":"Home","timeoutMs":10000}}',
    '{"type":"final","message":"concise completion summary for the user"}',
    '',
    'Action rules:',
    '- If manual login, 2FA, or a captcha is required, use prompt_user and wait for the user.',
    '- Use navigate when a URL is known or needed.',
    '- Use snapshot if the page may have changed and you need a fresh view without interacting.',
    '- Use wait after navigation or an action when content is still loading.',
    '- Use press for keys like Enter, Tab, Escape, ArrowDown.',
    '- Use scroll with deltaY positive for down and negative for up.',
    '- If the task is complete, return final instead of another action.',
    '',
    'Latest action result:',
    params.feedback,
    '',
    'Current snapshot JSON:',
    JSON.stringify(params.snapshot, null, 2),
  ].join('\n');
}

function parseBrowserAgentDecision(raw: string): BrowserAgentDecision {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const type = typeof parsed.type === 'string' ? parsed.type : '';

  if (type === 'final') {
    const message =
      typeof parsed.message === 'string' ? parsed.message.trim() : '';

    if (!message) {
      throw new Error('Browser agent final response is missing message.');
    }

    return { type: 'final', message };
  }

  if (type !== 'action') {
    throw new Error('Browser agent must return type "action" or "final".');
  }

  const action = parseBrowserAction(parsed.action);

  const comment =
    typeof parsed.comment === 'string' ? parsed.comment.trim() : undefined;

  return {
    type: 'action',
    action,
    comment: comment && comment.length > 0 ? comment : undefined,
  };
}

function parseBrowserAction(value: unknown): BrowserAction {
  if (!value || typeof value !== 'object') {
    throw new Error('Browser agent action must be an object.');
  }

  const action = value as Record<string, unknown>;
  const type = typeof action.type === 'string' ? action.type : '';

  if (type === 'start' || type === 'snapshot') {
    return { type };
  }

  if (type === 'prompt_user') {
    return {
      type,
      message: readNonEmptyString(action.message, 'prompt_user.message'),
    };
  }

  if (type === 'navigate') {
    const url = typeof action.url === 'string' ? action.url.trim() : '';

    if (!url) {
      throw new Error('navigate action requires url.');
    }

    return { type, url };
  }

  if (type === 'click') {
    return {
      type,
      elementId: readNonEmptyString(action.elementId, 'click.elementId'),
    };
  }

  if (type === 'type') {
    const text = typeof action.text === 'string' ? action.text : null;

    if (text === null) {
      throw new Error('type action requires text.');
    }

    return {
      type,
      elementId: readNonEmptyString(action.elementId, 'type.elementId'),
      text,
      clear: typeof action.clear === 'boolean' ? action.clear : true,
    };
  }

  if (type === 'press') {
    return { type, key: readNonEmptyString(action.key, 'press.key') };
  }

  if (type === 'scroll') {
    return {
      type,
      deltaX: typeof action.deltaX === 'number' ? action.deltaX : 0,
      deltaY: typeof action.deltaY === 'number' ? action.deltaY : 600,
    };
  }

  if (type === 'wait') {
    return {
      type,
      elementId:
        typeof action.elementId === 'string' &&
        action.elementId.trim().length > 0
          ? action.elementId.trim()
          : undefined,
      text:
        typeof action.text === 'string' && action.text.trim().length > 0
          ? action.text.trim()
          : undefined,
      timeoutMs:
        typeof action.timeoutMs === 'number' ? action.timeoutMs : 10_000,
    };
  }

  throw new Error(`Unsupported browser action type: ${JSON.stringify(type)}`);
}

function readNonEmptyString(value: unknown, fieldName: string): string {
  const stringValue = typeof value === 'string' ? value.trim() : '';

  if (!stringValue) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return stringValue;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('Browser agent did not return JSON.');
}

function renderBrowserResult(params: {
  message: string;
  snapshot: BrowserSnapshot;
  actionLog: string[];
  profileDir: string;
  headless: boolean;
}): string {
  return [
    'Browser task complete.',
    '',
    params.message,
    '',
    `Browser mode: ${params.headless ? 'headless' : 'headed'}`,
    `Profile dir: ${params.profileDir}`,
    `Current URL: ${params.snapshot.url}`,
    `Current title: ${params.snapshot.title || '(untitled)'}`,
    params.snapshot.visibleTextSummary
      ? `Visible text summary: ${params.snapshot.visibleTextSummary}`
      : 'Visible text summary: (empty)',
    '',
    'Action log:',
    ...params.actionLog.map((line, index) => `${index + 1}. ${line}`),
  ].join('\n');
}
