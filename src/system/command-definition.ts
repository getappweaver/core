// ---------------------------------------------------------------------------
// Command/subcommand metadata for CLI help, web catalog, and parsing.
// Authors supply every field explicitly (empty arrays, false, null as needed).
// ---------------------------------------------------------------------------

export type CommandValueKind = 'string' | 'integer' | 'boolean';

export type CommandArgumentDefinition = {
  name: string;
  summary: string;
  kind: CommandValueKind;
  /** Optional default used only by the web form layer. */
  webDefaultValue?: string | number | boolean;
  /** When omitted, treated as false at parse time; prefer writing `false` explicitly. */
  required?: boolean;
  /** When omitted, treated as false at parse time; prefer writing `false` explicitly. */
  variadic?: boolean;
};

export type CommandOptionDefinition = {
  name: string;
  summary: string;
  flag: string;
  /** Optional default used only by the web form layer. */
  webDefaultValue?: string | number | boolean;
  /**
   * Omit or `null` when there is no short flag (parse/help treat as long-flag only).
   * Prefer writing `null` explicitly for new definitions.
   */
  shortFlag?: string | null;
  kind: CommandValueKind;
  /** When omitted, treated as false at parse time; prefer writing `false` explicitly. */
  required?: boolean;
  /**
   * Omit or `null` when there is no fixed choice list.
   * Prefer writing `null` explicitly for new definitions.
   */
  choices?: string[] | null;
};

/** Optional widget metadata for the web UI (discovered via command catalog). */
export type WebWidget = {
  placement: 'header' | 'fixed';
  surface: 'modal' | 'timeline_singleton';
  label?: string;
  modalTitle: string;
  /** Optional icon key used by web header chrome widget buttons. */
  icon?: string;
  /** Optional header sort order (ascending), defaults to definition order. */
  order?: number;
};

export type SubcommandDefinition = {
  name: string;
  summary: string;
  details?: string[];
  textHidden?: boolean;
  aliases: string[];
  arguments: CommandArgumentDefinition[];
  options: CommandOptionDefinition[];
  examples: string[];
  /** When set, the web app may expose a shared modal/widget target for this subcommand. */
  webWidget?: WebWidget;
  /** Override generated web behavior for commands that are safe to run with provided action values. */
  webExecutionMode?:
    | 'requires_input'
    | 'runnable_default'
    | 'runnable_customizable';
};

export type CommandDefinition = {
  name: string;
  summary: string;
  aliases: string[];
  subcommands: SubcommandDefinition[];
};

export function matchesCommandName(
  definition: CommandDefinition,
  token: string,
): boolean {
  return (
    definition.name === token || definition.aliases.some((a) => a === token)
  );
}

export function matchesSubcommandName(
  definition: SubcommandDefinition,
  token: string,
): boolean {
  return (
    definition.name === token || definition.aliases.some((a) => a === token)
  );
}

export function getSubcommandDefinition(
  command: CommandDefinition,
  token: string,
): SubcommandDefinition | null {
  return (
    command.subcommands.find((subcommand) =>
      matchesSubcommandName(subcommand, token),
    ) ?? null
  );
}
