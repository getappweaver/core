import { z } from 'zod';

import {
  OPENCODE_PERMISSION_TOOLS,
  saveOpencodeAgent,
  type OpencodePermissionTool,
  type PermissionAction,
} from '@src/backends/opencode-config';

const PermissionActionSchema = z.enum(['allow', 'ask', 'deny']);

const AgentEditorJsonPayloadSchema = z.object({
  mode: z.enum(['new', 'edit']),
  originalName: z.string().nullable(),
  values: z.object({
    name: z.string(),
    description: z.string(),
    model: z.string(),
    color: z.string(),
    steps: z.string(),
    mode: z.string(),
    systemPrompt: z.string(),
    hidden: z.boolean(),
    disabled: z.boolean(),
    permissions: z.record(
      z.string(),
      z.union([z.literal(''), PermissionActionSchema]),
    ),
  }),
});

type HandleAiAgentsUpsertJsonProps = {
  dmBotRoot: string;
  payload: unknown;
};

function normalizePermissionActions(
  values: Record<string, '' | PermissionAction>,
): Partial<Record<OpencodePermissionTool, PermissionAction | null>> {
  const out: Partial<Record<OpencodePermissionTool, PermissionAction | null>> =
    {};

  for (const tool of OPENCODE_PERMISSION_TOOLS) {
    out[tool] = values[tool] || null;
  }

  return out;
}

export async function handleAiAgentsUpsertJson(
  props: HandleAiAgentsUpsertJsonProps,
): Promise<string> {
  const { mode, originalName, values } = AgentEditorJsonPayloadSchema.parse(
    props.payload,
  );

  await saveOpencodeAgent(props.dmBotRoot, {
    currentName: mode === 'edit' ? originalName : null,
    name: values.name.trim(),
    description: values.description.trim() || null,
    model: values.model.trim() || null,
    color: values.color.trim() || null,
    steps:
      values.steps.trim().length > 0
        ? Number.parseInt(values.steps.trim(), 10)
        : null,
    mode: values.mode.trim() || null,
    systemPrompt: values.systemPrompt,
    hidden: values.hidden,
    disabled: values.disabled,
    permissionActions: normalizePermissionActions(values.permissions),
  });

  return `Saved OpenCode agent: ${values.name.trim()}`;
}
