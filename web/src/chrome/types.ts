import type { Accessor, Setter } from 'solid-js';

import type { WebNodeRoot } from '@src/web/ui-schema';

import type { PromptPayload } from '../ws-types';

export type ChromeModalState = {
  command: string;
  subcommand: string;
  title: string;
};

export type ChromePromptSession = {
  requestId: string;
  prompt: PromptPayload;
};

export type ChromeHook = {
  chromeError: Accessor<string | null>;
  chromeLoading: Accessor<boolean>;
  chromeModal: Accessor<ChromeModalState | null>;
  chromePromptSession: Accessor<ChromePromptSession | null>;
  chromeText: Accessor<string | null>;
  chromeWeb: Accessor<WebNodeRoot | null>;
  setChromeError: Setter<string | null>;
  setChromeLoading: Setter<boolean>;
  setChromeModal: Setter<ChromeModalState | null>;
  setChromePromptSession: Setter<ChromePromptSession | null>;
  setChromeText: Setter<string | null>;
  setChromeWeb: Setter<WebNodeRoot | null>;
};
