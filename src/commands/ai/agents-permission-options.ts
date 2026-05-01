import {
  OPENCODE_PERMISSION_TOOLS,
  type OpencodePermissionTool,
} from '@src/backends/opencode-config';
import type { CommandOptionDefinition } from '@src/system/command-definition';

export function getAiAgentPermissionOptionDefinitions(): CommandOptionDefinition[] {
  return OPENCODE_PERMISSION_TOOLS.map((tool) => ({
    name: `perm_${tool}`,
    summary: `${tool} permission (blank = default behavior)`,
    flag: `--perm-${tool}`,
    kind: 'string' as const,
    required: false,
    choices: ['', 'allow', 'ask', 'deny'],
  }));
}

export function toPermissionFormOptions(
  values: Partial<Record<OpencodePermissionTool, string>>,
): Record<string, string> {
  return Object.fromEntries(
    OPENCODE_PERMISSION_TOOLS.map((tool) => [
      `perm_${tool}`,
      values[tool] ?? '',
    ]),
  );
}
