import type { Accessor } from 'solid-js';

import type { CommandDetail } from '../types';

export function resolveCommandDetail(
  commands: Accessor<CommandDetail[]>,
  name: string,
): CommandDetail | null {
  const normalized = name.trim().toLowerCase();

  for (const command of commands()) {
    if (command.name.toLowerCase() === normalized) {
      return command;
    }

    if (command.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return command;
    }
  }

  return null;
}

export async function ensureCommandDetail(
  commands: Accessor<CommandDetail[]>,
  name: string,
): Promise<CommandDetail> {
  const detail = resolveCommandDetail(commands, name);

  if (detail) {
    return detail;
  }

  throw new Error(`Command not found: ${name}`);
}
