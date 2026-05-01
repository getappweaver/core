import type { Accessor, Setter } from 'solid-js';

import type {
  CommandDetail,
  CommandPayload,
  CommandSubcommand,
} from '../types';

export type PaletteAdapters = {
  commands: Accessor<CommandDetail[]>;
  setComposerText: Setter<string>;
  ensureCommandDetail: (name: string) => Promise<CommandDetail>;
  matchesCommandToken: (command: CommandDetail, token: string) => boolean;
  scoreCommandMatch: (command: CommandDetail, query: string) => number;
  getSubcommandQueryFromPalette: (
    command: CommandDetail,
    query: string,
  ) => string;
  scoreSubcommandMatch: (
    subcommand: CommandSubcommand,
    query: string,
  ) => number;
  payloadFromPathTokens: (
    subcommand: CommandSubcommand,
    tokens: string[],
  ) => CommandPayload;
  openSubcommand: (
    command: CommandDetail,
    subcommand: CommandSubcommand,
    initialValues?: CommandPayload,
    opts?: { preferRun?: boolean },
  ) => Promise<void>;
};

export type PaletteHook = {
  chooseCommand: (name: string) => Promise<void>;
  closePalette: () => void;
  filteredCommands: Accessor<CommandDetail[]>;
  filteredSubcommands: Accessor<CommandSubcommand[]>;
  goPaletteCommandLevel: () => void;
  goPaletteRoot: () => void;
  handlePaletteFilterInput: (value: string) => Promise<void>;
  handlePaletteKeyDown: (
    event: KeyboardEvent & { currentTarget: HTMLInputElement; target: Element },
  ) => void;
  openPalette: () => void;
  openPaletteForCommand: (name: string) => Promise<void>;
  showCommandSubcommands: (command: CommandDetail) => void;
  paletteError: Accessor<string | null>;
  paletteOpen: Accessor<boolean>;
  paletteQuery: Accessor<string>;
  paletteSelectedIndex: Accessor<number>;
  paletteStep: Accessor<'commands' | 'subcommands'>;
  selectedCommand: Accessor<CommandDetail | null>;
  setPaletteOpen: Setter<boolean>;
  setPaletteQuery: Setter<string>;
  setPaletteSelectedIndex: Setter<number>;
  setPaletteStep: Setter<'commands' | 'subcommands'>;
  setSelectedCommand: Setter<CommandDetail | null>;
  submitPalette: () => Promise<void>;
};
