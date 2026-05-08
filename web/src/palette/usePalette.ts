import { createMemo, createSignal } from 'solid-js';

import type { CommandDetail, CommandSubcommand } from '../types';

import type { PaletteAdapters, PaletteHook } from './types';

function helpTopicSubcommand(
  command: CommandDetail,
  topic: CommandSubcommand,
): CommandSubcommand {
  return {
    name: topic.name,
    summary: topic.summary,
    usage: `help ${topic.name}`,
    aliases: topic.aliases,
    arguments:
      command.subcommands.find((item) => item.name === 'help')?.arguments ?? [],
    options: [],
    examples: [`/${command.name} help ${topic.name}`],
    inferredWeb: { executionMode: 'requires_input' as const },
  };
}

type GlobalHelpTopicSubcommandProps = {
  helpCommand: CommandDetail;
  command: CommandDetail;
  topic: CommandSubcommand;
};

function globalHelpTopicSubcommand({
  helpCommand,
  command,
  topic,
}: GlobalHelpTopicSubcommandProps): CommandSubcommand {
  return {
    name: 'topic',
    summary: topic.summary,
    usage: `topic ${command.name} ${topic.name}`,
    aliases: topic.aliases,
    arguments: helpCommand.subcommands[0]?.arguments ?? [],
    options: [],
    examples: [`/help ${command.name} ${topic.name}`],
    inferredWeb: { executionMode: 'requires_input' as const },
  };
}

function topicPathMatches(
  topic: CommandSubcommand,
  queryTokens: string[],
): boolean {
  if (queryTokens.length === 0) {
    return true;
  }

  const topicTokens = topic.name.toLowerCase().split(/\s+/).filter(Boolean);

  if (queryTokens.length > topicTokens.length) {
    return false;
  }

  return queryTokens.every((token, index) => {
    const topicToken = topicTokens[index];

    if (topicToken === undefined) {
      return false;
    }

    if (index === queryTokens.length - 1) {
      return topicToken.startsWith(token);
    }

    return topicToken === token;
  });
}

export function usePalette(adapters: PaletteAdapters): PaletteHook {
  const [paletteOpen, setPaletteOpen] = createSignal(false);

  const [paletteStep, setPaletteStep] = createSignal<
    'commands' | 'subcommands'
  >('commands');

  const [paletteQuery, setPaletteQuery] = createSignal('');
  const [paletteSelectedIndex, setPaletteSelectedIndex] = createSignal(0);

  const [selectedCommand, setSelectedCommand] =
    createSignal<CommandDetail | null>(null);

  const [paletteError, setPaletteError] = createSignal<string | null>(null);

  const filteredCommands = createMemo(() => {
    const query = paletteQuery().trim().toLowerCase();

    if (!query) {
      return adapters.commands();
    }

    return adapters
      .commands()
      .map((command) => ({
        command,
        score: adapters.scoreCommandMatch(command, query),
      }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.command);
  });

  const filteredSubcommands = createMemo(() => {
    const command = selectedCommand();

    if (!command) {
      return [] as CommandSubcommand[];
    }

    if (command.name === 'help') {
      const queryPath = adapters
        .getSubcommandQueryFromPalette(command, paletteQuery())
        .trim()
        .toLowerCase();

      const pathTokens = queryPath.split(/\s+/).filter(Boolean);
      const commandQuery = pathTokens[0] ?? '';
      const topicQueryTokens = pathTokens.slice(1);

      const topicCommand = adapters
        .commands()
        .find(
          (entry) =>
            entry.name !== 'help' &&
            [entry.name, ...entry.aliases].some(
              (value) => value.toLowerCase() === commandQuery,
            ),
        );

      if (
        topicCommand !== undefined &&
        (paletteQuery().endsWith(' ') || pathTokens.length > 1)
      ) {
        return topicCommand.subcommands
          .filter((entry) => entry.name !== 'help')
          .filter((entry) => topicPathMatches(entry, topicQueryTokens))
          .map((entry) =>
            globalHelpTopicSubcommand({
              helpCommand: command,
              command: topicCommand,
              topic: entry,
            }),
          );
      }

      return adapters
        .commands()
        .filter((entry) => entry.name !== 'help')
        .filter((entry) => {
          if (!commandQuery) {
            return true;
          }

          return [entry.name, entry.summary, ...entry.aliases].some((value) =>
            value.toLowerCase().includes(commandQuery),
          );
        })
        .map((entry) => ({
          name: 'topic',
          summary: entry.summary,
          usage: `topic ${entry.name}`,
          aliases: entry.aliases,
          arguments: command.subcommands[0]?.arguments ?? [],
          options: [],
          examples: [`/help ${entry.name}`],
          inferredWeb: { executionMode: 'requires_input' as const },
        }));
    }

    const query = adapters.getSubcommandQueryFromPalette(
      command,
      paletteQuery(),
    );

    const queryTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    if (
      queryTokens[0] === 'help' &&
      (paletteQuery().endsWith(' ') || queryTokens.length > 1)
    ) {
      const topicQueryTokens = queryTokens.slice(1);

      return command.subcommands
        .filter((entry) => entry.name !== 'help')
        .filter((entry) => topicPathMatches(entry, topicQueryTokens))
        .map((entry) => helpTopicSubcommand(command, entry));
    }

    if (!query) {
      return command.subcommands;
    }

    return command.subcommands
      .map((subcommand) => ({
        subcommand,
        score: adapters.scoreSubcommandMatch(subcommand, query),
      }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.subcommand);
  });

  function openPalette(): void {
    setPaletteError(null);
    setPaletteStep('commands');
    setSelectedCommand(null);
    setPaletteQuery('');
    setPaletteSelectedIndex(0);
    setPaletteOpen(true);
  }

  function closePalette(): void {
    setPaletteOpen(false);
    setPaletteError(null);
  }

  function goPaletteRoot(): void {
    setPaletteError(null);
    setPaletteStep('commands');
    setSelectedCommand(null);
    setPaletteQuery('');
    setPaletteSelectedIndex(0);
  }

  function goPaletteCommandLevel(): void {
    const command = selectedCommand();

    if (!command) {
      goPaletteRoot();

      return;
    }

    setPaletteStep('commands');
    setPaletteQuery(command.name);

    setPaletteSelectedIndex(
      Math.max(
        0,
        adapters.commands().findIndex((item) => item.name === command.name),
      ),
    );
  }

  async function chooseCommand(name: string): Promise<void> {
    await chooseCommandInternal(name, false);
  }

  async function chooseHighlightedCommandForSubcommands(): Promise<void> {
    const query = paletteQuery().trim();

    if (!query) {
      return;
    }

    const commandsList = filteredCommands();
    const command = commandsList[paletteSelectedIndex()] ?? commandsList[0];

    if (!command) {
      return;
    }

    await chooseCommandInternal(command.name, true);
    setPaletteQuery(`${command.name} `);
    setPaletteSelectedIndex(0);
  }

  async function openPaletteForCommand(name: string): Promise<void> {
    openPalette();
    await chooseCommandInternal(name, true);
  }

  function showCommandSubcommands(command: CommandDetail): void {
    setSelectedCommand(command);
    setPaletteStep('subcommands');
    setPaletteQuery('');
    setPaletteOpen(true);
  }

  async function chooseCommandInternal(
    name: string,
    preserveQuery: boolean,
  ): Promise<void> {
    setPaletteError(null);
    try {
      const detail = await adapters.ensureCommandDetail(name);
      setSelectedCommand(detail);
      setPaletteStep('subcommands');
      setPaletteSelectedIndex(0);

      if (!preserveQuery) {
        setPaletteQuery('');
        adapters.setComposerText('');
      }
    } catch (err) {
      setPaletteError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePaletteFilterInput(value: string): Promise<void> {
    setPaletteQuery(value);
    setPaletteSelectedIndex(0);

    if (paletteStep() === 'commands') {
      const trimmedStart = value.trimStart();
      const firstSpace = trimmedStart.indexOf(' ');

      if (firstSpace > 0) {
        const commandToken = trimmedStart.slice(0, firstSpace);
        const remainder = trimmedStart.slice(firstSpace + 1).trimStart();

        const command = adapters
          .commands()
          .find((item) => adapters.matchesCommandToken(item, commandToken));

        if (command) {
          await chooseCommandInternal(command.name, true);

          if (remainder.length === 0) {
            setPaletteQuery(`${commandToken} `);
          }

          return;
        }
      }
    }

    if (paletteStep() === 'subcommands' && value.endsWith(' ')) {
      const command = selectedCommand();
      const first = filteredSubcommands()[0];

      if (!command || !first) {
        return;
      }

      const current = adapters.getSubcommandQueryFromPalette(command, value);

      if (!current) {
        return;
      }

      const tokens = value.trim().split(/\s+/).filter(Boolean);
      const commandTokens = [command.name, ...command.aliases];

      if (tokens.length > 0 && commandTokens.includes(tokens[0]!)) {
        tokens.shift();
      }

      if (command.name === 'help') {
        const topic = first.usage.replace(/^topic\s+/, '');
        const currentTopic = current.trim();

        if (topic.split(/\s+/).length > currentTopic.split(/\s+/).length) {
          return;
        }

        setPaletteQuery(`${command.name} ${topic} `);

        return;
      }

      if (first.usage.startsWith('help ')) {
        if (tokens[0] === 'help') {
          return;
        }

        const topic = first.usage.replace(/^help\s+/, '');

        setPaletteQuery(`${command.name} help ${topic} `);

        return;
      }

      if (tokens.length <= 1) {
        setPaletteQuery(`${command.name} ${first.name} `);
      }
    }
  }

  async function submitPalette(): Promise<void> {
    if (paletteStep() === 'commands') {
      const commandsList = filteredCommands();
      const first = commandsList[paletteSelectedIndex()] ?? commandsList[0];

      if (first) {
        await chooseCommand(first.name);
      }

      return;
    }

    const command = selectedCommand();

    if (!command) {
      return;
    }

    const trimmed = paletteQuery().trim();

    const tokens =
      trimmed.length > 0 ? trimmed.split(/\s+/).filter(Boolean) : [];

    const commandTokens = [command.name, ...command.aliases];

    if (tokens.length > 0 && commandTokens.includes(tokens[0]!)) {
      tokens.shift();
    }

    if (command.name === 'help') {
      const subcommand = command.subcommands.find(
        (item) => item.name === 'topic',
      );

      if (!subcommand) {
        return;
      }

      const selectedTopic = filteredSubcommands()[
        paletteSelectedIndex()
      ]?.usage.replace(/^topic\s+/, '');

      const explicitTopic = selectedTopic ?? tokens.join(' ');

      await adapters.openSubcommand(command, subcommand, {
        arguments: { path: explicitTopic },
        options: {},
      });

      return;
    }

    if (
      tokens[0] === 'help' &&
      (tokens.length > 1 || paletteQuery().endsWith(' '))
    ) {
      const subcommand = command.subcommands.find(
        (item) => item.name === 'help',
      );

      if (!subcommand) {
        return;
      }

      const selectedTopic = filteredSubcommands()[
        paletteSelectedIndex()
      ]?.usage.replace(/^help\s+/, '');

      const explicitTopic =
        tokens.length > 1 ? tokens.slice(1).join(' ') : (selectedTopic ?? '');

      await adapters.openSubcommand(command, subcommand, {
        arguments: { topic: explicitTopic },
        options: {},
      });

      return;
    }

    const subcommandToken = tokens[0] ?? '';
    const argTokens = tokens.slice(1);

    const subcommand =
      (subcommandToken
        ? command.subcommands.find(
            (item) =>
              item.name === subcommandToken ||
              item.aliases.includes(subcommandToken),
          )
        : null) ??
      filteredSubcommands()[paletteSelectedIndex()] ??
      filteredSubcommands()[0];

    if (!subcommand) {
      return;
    }

    await adapters.openSubcommand(
      command,
      subcommand,
      adapters.payloadFromPathTokens(subcommand, argTokens),
      {
        preferRun: true,
      },
    );
  }

  function handlePaletteKeyDown(
    event: KeyboardEvent & { currentTarget: HTMLInputElement; target: Element },
  ): void {
    if (event.key === 'Escape') {
      event.preventDefault();

      if (paletteQuery().length > 0) {
        setPaletteQuery('');
      } else {
        closePalette();
      }

      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      const count =
        paletteStep() === 'commands'
          ? filteredCommands().length
          : filteredSubcommands().length;

      if (count === 0) {
        return;
      }

      setPaletteSelectedIndex((current) => {
        if (event.key === 'ArrowDown') {
          return (current + 1) % count;
        }

        return (current - 1 + count) % count;
      });

      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void submitPalette();

      return;
    }

    if (event.key === ' ' && paletteStep() === 'commands') {
      event.preventDefault();
      void chooseHighlightedCommandForSubcommands();
    }
  }

  return {
    chooseCommand,
    closePalette,
    filteredCommands,
    filteredSubcommands,
    goPaletteCommandLevel,
    goPaletteRoot,
    handlePaletteFilterInput,
    handlePaletteKeyDown,
    openPalette,
    openPaletteForCommand,
    showCommandSubcommands,
    paletteError,
    paletteOpen,
    paletteQuery,
    paletteSelectedIndex,
    paletteStep,
    selectedCommand,
    setPaletteOpen,
    setPaletteQuery,
    setPaletteSelectedIndex,
    setPaletteStep,
    setSelectedCommand,
    submitPalette,
  };
}
