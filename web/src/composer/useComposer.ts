import { createEffect, onMount } from 'solid-js';

import { logChatDebug } from '../chat/debug';

import type { ComposerAdapters, ComposerHook } from './types';

export function useComposer(adapters: ComposerAdapters): ComposerHook {
  async function submitComposer(): Promise<void> {
    const text = adapters.composerText().trim();

    if (!text) {
      return;
    }

    let promptRequestId = adapters.pendingPromptRequestId();

    logChatDebug('composer.submit', {
      length: text.length,
      startsWithSlash: text.startsWith('/'),
      pendingPromptRequestId: promptRequestId,
      hasPendingPromptRequest: promptRequestId
        ? adapters.hasPendingRequest(promptRequestId)
        : false,
      chromePromptRequestId:
        adapters.chrome.chromePromptSession()?.requestId ?? null,
    });

    if (promptRequestId && !adapters.hasPendingRequest(promptRequestId)) {
      logChatDebug('composer.prompt.stale_clear', { promptRequestId });
      adapters.setPendingPromptRequestId(null);
      promptRequestId = null;
    }

    if (promptRequestId) {
      const chrome = adapters.chrome.chromePromptSession();

      logChatDebug('composer.route.prompt_answer', {
        promptRequestId,
        chromePrompt: chrome?.requestId ?? null,
      });

      if (!chrome) {
        adapters.chat.appendUserMessage(text);
      }

      adapters.setComposerText('');
      adapters.setPendingPromptRequestId(null);

      if (chrome !== null && chrome.requestId === promptRequestId) {
        adapters.chrome.setChromePromptSession(null);
      }

      adapters.chat.sendPromptAnswer(promptRequestId, text);

      return;
    }

    if (text === '/') {
      adapters.palette.openPalette();
      adapters.setComposerText('');

      return;
    }

    if (text.startsWith('/')) {
      try {
        const [commandToken, ...rest] = text.slice(1).trim().split(/\s+/);

        if (!commandToken) {
          adapters.palette.openPalette();
          adapters.setComposerText('');

          return;
        }

        const subcommandToken = rest[0];
        const detail = await adapters.ensureCommandDetail(commandToken);

        if (!subcommandToken) {
          adapters.palette.showCommandSubcommands(detail);

          return;
        }

        const subcommand = detail.subcommands.find(
          (item) =>
            item.name === subcommandToken ||
            item.aliases.includes(subcommandToken),
        );

        if (!subcommand) {
          throw new Error(`Unknown subcommand: ${subcommandToken}`);
        }

        await adapters.openSubcommand(
          detail,
          subcommand,
          adapters.payloadFromPathTokens(subcommand, rest.slice(1)),
          {
            preferRun: true,
          },
        );

        adapters.setComposerText('');

        return;
      } catch (err) {
        adapters.appendSystemMessage(
          err instanceof Error ? err.message : String(err),
        );

        return;
      }
    }

    adapters.setComposerText('');
    logChatDebug('composer.route.chat', { length: text.length });
    adapters.chat.sendChat(text);
  }

  function useComposerFocus(props: {
    blocked: () => boolean;
    focusInput: () => void;
  }): void {
    onMount(() => {
      queueMicrotask(() => {
        if (!props.blocked()) {
          props.focusInput();
        }
      });
    });

    createEffect(() => {
      if (props.blocked()) {
        return;
      }

      queueMicrotask(() => props.focusInput());
    });
  }

  return { submitComposer, useComposerFocus };
}
