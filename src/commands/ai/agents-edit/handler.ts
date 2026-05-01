import type { ClientViewRoot } from '@src/web/ui-schema';

import { buildAiAgentEditorClientView } from '../agent-editor-view';

export async function handleAiAgentsEdit(params: {
  dmBotRoot: string;
  args: string[];
}): Promise<ClientViewRoot> {
  const name = params.args[0]?.trim() ?? '';

  return buildAiAgentEditorClientView({
    dmBotRoot: params.dmBotRoot,
    mode: 'edit',
    name,
  });
}
