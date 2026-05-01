import type { ClientViewRoot } from '@src/web/ui-schema';

import { buildAiAgentEditorClientView } from '../agent-editor-view';

export async function handleAiAgentsNew(params: {
  dmBotRoot: string;
  args: string[];
}): Promise<ClientViewRoot> {
  return buildAiAgentEditorClientView({
    dmBotRoot: params.dmBotRoot,
    mode: 'new',
  });
}
