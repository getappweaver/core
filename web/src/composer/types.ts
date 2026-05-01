import type { Accessor, Setter } from 'solid-js';

import type { ChatHook } from '../chat/types';
import type { ChromeHook } from '../chrome/types';
import type { PaletteHook } from '../palette/types';
import type {
  CommandDetail,
  CommandPayload,
  CommandSubcommand,
} from '../types';

export type ComposerChromePromptSession = {
  requestId: string;
  prompt: import('../ws-types').PromptPayload;
};

export type ComposerAdapters = {
  composerText: Accessor<string>;
  pendingPromptRequestId: Accessor<string | null>;
  setComposerText: Setter<string>;
  setPendingPromptRequestId: Setter<string | null>;
  appendSystemMessage: (text: string) => void;
  chat: Pick<ChatHook, 'appendUserMessage' | 'sendChat' | 'sendPromptAnswer'>;
  chrome: Pick<ChromeHook, 'chromePromptSession' | 'setChromePromptSession'>;
  palette: Pick<PaletteHook, 'openPalette' | 'showCommandSubcommands'>;
  ensureCommandDetail: (name: string) => Promise<CommandDetail>;
  openSubcommand: (
    command: CommandDetail,
    subcommand: CommandSubcommand,
    initialValues?: CommandPayload,
    opts?: { preferRun?: boolean },
  ) => Promise<void>;
  payloadFromPathTokens: (
    subcommand: CommandSubcommand,
    tokens: string[],
  ) => CommandPayload;
};

export type ComposerHook = {
  submitComposer: () => Promise<void>;
  useComposerFocus: (props: {
    blocked: Accessor<boolean>;
    focusInput: () => void;
  }) => void;
};
