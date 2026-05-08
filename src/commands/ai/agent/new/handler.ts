import type { ClientViewRoot } from '@src/web/ui-schema';

import { buildAiAgentEditorClientView } from '../editor-view';

export async function handleAiAgentsNew(params: {
  dmBotRoot: string;
  args: string[];
}): Promise<ClientViewRoot> {
  return buildAiAgentEditorClientView({
    dmBotRoot: params.dmBotRoot,
    mode: 'new',
  });
}
