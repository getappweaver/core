import type { Accessor, Setter } from 'solid-js';

import type { WebAction } from '@src/web/ui-schema';

import type {
  CommandDetail,
  CommandPayload,
  CommandSubcommand,
  TimelineItem,
} from '../types';

type CommandFormsAdapters = {
  selectedCommand: Accessor<CommandDetail | null>;
  setTimeline: Setter<TimelineItem[]>;
  setComposerText: Setter<string>;
  setActiveFormId: Setter<string | null>;
  appendSystemMessage: (text: string) => void;
  createId: () => string;
  closePalette: () => void;
  runCommand: (
    command: string,
    subcommand: CommandSubcommand,
    values: CommandPayload,
  ) => Promise<void>;
  saveTimelineForm: (
    item: Extract<TimelineItem, { type: 'command_form' }>,
  ) => void;
  defaultPayload: (subcommand: CommandSubcommand) => CommandPayload;
  mergeCommandPayload: (
    subcommand: CommandSubcommand,
    overlay: CommandPayload | undefined,
  ) => CommandPayload;
  hasMissingRequiredInputs: (
    subcommand: CommandSubcommand,
    payload: CommandPayload,
  ) => boolean;
  ensureCommandDetail: (name: string) => Promise<CommandDetail>;
};

export function useCommandForms(adapters: CommandFormsAdapters) {
  async function openSubcommand(
    command: CommandDetail,
    subcommand: CommandSubcommand,
    initialValues?: CommandPayload,
    opts?: { preferRun?: boolean },
  ): Promise<void> {
    const preferRun = opts?.preferRun === true;

    if (
      command.name === 'help' &&
      subcommand.name === 'topic' &&
      initialValues == null
    ) {
      await chooseSubcommand(subcommand, {
        arguments: {
          path: subcommand.usage.replace(/^topic\s+/, ''),
        },
        options: {},
      });

      return;
    }

    if (command.name === 'help' && subcommand.name === 'topic') {
      adapters.closePalette();

      await adapters.runCommand(
        command.name,
        subcommand,
        initialValues ?? adapters.defaultPayload(subcommand),
      );

      return;
    }

    if (subcommand.name === 'help') {
      adapters.closePalette();

      await adapters.runCommand(
        command.name,
        subcommand,
        initialValues ?? adapters.defaultPayload(subcommand),
      );

      return;
    }

    adapters.closePalette();

    const mode = subcommand.inferredWeb?.executionMode ?? 'requires_input';

    if (
      preferRun &&
      mode !== 'requires_input' &&
      !adapters.hasMissingRequiredInputs(
        subcommand,
        initialValues ?? adapters.defaultPayload(subcommand),
      )
    ) {
      await adapters.runCommand(
        command.name,
        subcommand,
        initialValues ?? adapters.defaultPayload(subcommand),
      );

      return;
    }

    if (mode === 'runnable_default') {
      await adapters.runCommand(
        command.name,
        subcommand,
        initialValues ?? adapters.defaultPayload(subcommand),
      );

      return;
    }

    const formId = adapters.createId();

    const formItem: Extract<TimelineItem, { type: 'command_form' }> = {
      id: formId,
      type: 'command_form',
      command: command.name,
      subcommand,
      values: adapters.mergeCommandPayload(subcommand, initialValues),
      autoRun: mode === 'runnable_customizable',
    };

    adapters.setTimeline((prev) => [...prev, formItem]);
    adapters.saveTimelineForm(formItem);
    adapters.setActiveFormId(formId);
  }

  async function chooseSubcommand(
    subcommand: CommandSubcommand,
    initialValues?: CommandPayload,
  ): Promise<void> {
    const command = adapters.selectedCommand();

    if (!command) {
      return;
    }

    await openSubcommand(command, subcommand, initialValues);
  }

  async function openCommandFormFromWebCommand(
    action: Extract<WebAction, { type: 'command' }>,
  ): Promise<void> {
    let command: CommandDetail;

    try {
      command = await adapters.ensureCommandDetail(action.command);
    } catch (err) {
      adapters.appendSystemMessage(
        err instanceof Error ? err.message : String(err),
      );

      return;
    }

    const subcommand = command.subcommands.find(
      (entry) =>
        entry.name === action.subcommand ||
        entry.aliases.includes(action.subcommand),
    );

    if (!subcommand) {
      adapters.appendSystemMessage(
        `Unknown subcommand: ${action.subcommand} for /${command.name}`,
      );

      return;
    }

    const values = adapters.mergeCommandPayload(subcommand, {
      arguments: { ...(action.arguments ?? {}) },
      options: { ...(action.options ?? {}) },
    });

    const mode = subcommand.inferredWeb?.executionMode ?? 'requires_input';

    if (mode === 'runnable_default') {
      await adapters.runCommand(command.name, subcommand, values);

      return;
    }

    adapters.closePalette();

    const formId = adapters.createId();

    const formItem: Extract<TimelineItem, { type: 'command_form' }> = {
      id: formId,
      type: 'command_form',
      command: command.name,
      subcommand,
      values,
      autoRun: mode === 'runnable_customizable',
      ...(action.optionHints ? { optionHints: action.optionHints } : {}),
      ...(action.argumentChoices
        ? { argumentChoices: action.argumentChoices }
        : {}),
    };

    adapters.setTimeline((prev) => [...prev, formItem]);
    adapters.saveTimelineForm(formItem);
    adapters.setActiveFormId(formId);
  }

  return {
    chooseSubcommand,
    openCommandFormFromWebCommand,
    openSubcommand,
  };
}
