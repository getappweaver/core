import {
  OPENCODE_PERMISSION_TOOLS,
  getSimplePermissionActions,
  listOpencodeModelCatalog,
  readOpencodeAgentsDraft,
  type OpencodePermissionTool,
  type PermissionAction,
} from '@src/backends/opencode-config';
import type { ClientViewRoot } from '@src/web/ui-schema';

type AgentEditorValues = {
  name: string;
  description: string;
  model: string;
  color: string;
  steps: string;
  mode: string;
  systemPrompt: string;
  hidden: boolean;
  disabled: boolean;
  permissions: Record<OpencodePermissionTool, '' | PermissionAction>;
};

function emptyPermissionMap(): Record<
  OpencodePermissionTool,
  '' | PermissionAction
> {
  return Object.fromEntries(
    OPENCODE_PERMISSION_TOOLS.map((tool) => [tool, '']),
  ) as Record<OpencodePermissionTool, '' | PermissionAction>;
}

export async function buildAiAgentEditorClientView(params: {
  dmBotRoot: string;
  mode: 'new' | 'edit';
  name?: string;
}): Promise<ClientViewRoot> {
  const draft = await readOpencodeAgentsDraft(params.dmBotRoot);

  const agent =
    params.mode === 'edit'
      ? draft.agents.find((entry) => entry.name === (params.name ?? ''))
      : null;

  if (params.mode === 'edit' && !agent) {
    throw new Error(`agent_not_found:${params.name ?? ''}`);
  }

  const permissions = emptyPermissionMap();

  if (agent) {
    const simple = getSimplePermissionActions(agent.permission);

    for (const tool of OPENCODE_PERMISSION_TOOLS) {
      permissions[tool] = simple[tool] ?? '';
    }
  }

  const values: AgentEditorValues = {
    name: agent?.name ?? '',
    description: agent?.description ?? '',
    model: agent?.model ?? '',
    color: agent?.color ?? '',
    steps: agent?.steps != null ? String(agent.steps) : '',
    mode: agent?.mode ?? 'primary',
    systemPrompt: agent?.systemPrompt ?? '',
    hidden: agent?.hidden ?? false,
    disabled: agent?.disabled ?? false,
    permissions,
  };

  const modelCatalog = listOpencodeModelCatalog(params.dmBotRoot);

  return {
    kind: 'client_view',
    version: 1,
    view: 'ai-agent-editor',
    meta: {
      command: 'ai',
      subcommand: params.mode === 'edit' ? 'agents edit' : 'agents new',
    },
    payload: {
      mode: params.mode,
      originalName: params.mode === 'edit' ? agent!.name : null,
      values,
      modelCatalog,
    },
  };
}
