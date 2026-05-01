import { createSignal } from 'solid-js';

import type {
  ChromeHook,
  ChromeModalState,
  ChromePromptSession,
} from './types';

export const CHROME_WEB_COMMAND_SOURCE_ID = '__chrome_web__';

export function chromePromptWebCommandSourceId(requestId: string): string {
  return `__chrome_prompt__:${requestId}`;
}

export function useChrome(): ChromeHook {
  const [chromeModal, setChromeModal] = createSignal<ChromeModalState | null>(
    null,
  );

  const [chromeLoading, setChromeLoading] = createSignal(false);
  const [chromeError, setChromeError] = createSignal<string | null>(null);
  const [chromeText, setChromeText] = createSignal<string | null>(null);

  const [chromeWeb, setChromeWeb] = createSignal<
    import('@src/web/ui-schema').WebNodeRoot | null
  >(null);

  const [chromePromptSession, setChromePromptSession] =
    createSignal<ChromePromptSession | null>(null);

  return {
    chromeError,
    chromeLoading,
    chromeModal,
    chromePromptSession,
    chromeText,
    chromeWeb,
    setChromeError,
    setChromeLoading,
    setChromeModal,
    setChromePromptSession,
    setChromeText,
    setChromeWeb,
  };
}
