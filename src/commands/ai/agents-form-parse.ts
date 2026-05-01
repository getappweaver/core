import {
  OPENCODE_PERMISSION_TOOLS,
  type OpencodePermissionTool,
  type PermissionAction,
} from '@src/backends/opencode-config';

type ParsedAiAgentForm = {
  name: string;
  description: string | null;
  model: string | null;
  color: string | null;
  steps: number | null;
  mode: string | null;
  systemPrompt: string | null;
  hidden: boolean;
  disabled: boolean;
  permissionActions: Partial<
    Record<OpencodePermissionTool, PermissionAction | null>
  >;
};

function readOptionValue(args: string[], startIndex: number): [string, number] {
  const parts: string[] = [];
  let index = startIndex;

  while (index < args.length) {
    const token = args[index] ?? '';

    if (token.startsWith('--')) {
      break;
    }

    parts.push(token);
    index += 1;
  }

  return [parts.join(' '), index - 1];
}

function readOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';

  return trimmed.length > 0 ? trimmed : null;
}

export function parseAiAgentFormArgs(args: string[]): ParsedAiAgentForm {
  const name = args[0]?.trim() ?? '';
  let description: string | null = null;
  let model: string | null = null;
  let color: string | null = null;
  let steps: number | null = null;
  let mode: string | null = null;
  let systemPrompt: string | null = null;
  let hidden = false;
  let disabled = false;

  const permissionActions: Partial<
    Record<OpencodePermissionTool, PermissionAction | null>
  > = {};

  for (let index = 1; index < args.length; index += 1) {
    const token = args[index] ?? '';

    switch (token) {
      case '--description': {
        const [value, nextIndex] = readOptionValue(args, index + 1);
        description = readOptionalString(value);
        index = nextIndex;
        break;
      }

      case '--model': {
        const [value, nextIndex] = readOptionValue(args, index + 1);
        model = readOptionalString(value);
        index = nextIndex;
        break;
      }

      case '--color': {
        const [value, nextIndex] = readOptionValue(args, index + 1);
        color = readOptionalString(value);
        index = nextIndex;
        break;
      }

      case '--steps': {
        const [value, nextIndex] = readOptionValue(args, index + 1);
        const parsed = Number.parseInt(value, 10);
        steps = Number.isFinite(parsed) ? parsed : null;
        index = nextIndex;
        break;
      }

      case '--mode': {
        const [value, nextIndex] = readOptionValue(args, index + 1);
        mode = readOptionalString(value);
        index = nextIndex;
        break;
      }

      case '--prompt': {
        const [value, nextIndex] = readOptionValue(args, index + 1);
        systemPrompt = readOptionalString(value);
        index = nextIndex;
        break;
      }

      case '--hidden':
        hidden = true;
        break;
      case '--disabled':
        disabled = true;
        break;
      default:
        if (token.startsWith('--perm-')) {
          const tool = token.slice('--perm-'.length) as OpencodePermissionTool;

          if (OPENCODE_PERMISSION_TOOLS.includes(tool)) {
            const [value, nextIndex] = readOptionValue(args, index + 1);

            permissionActions[tool] =
              value === 'allow' || value === 'ask' || value === 'deny'
                ? value
                : null;

            index = nextIndex;
          }
        }

        break;
    }
  }

  return {
    name,
    description,
    model,
    color,
    steps,
    mode,
    systemPrompt,
    hidden,
    disabled,
    permissionActions,
  };
}
