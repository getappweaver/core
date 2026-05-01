// ---------------------------------------------------------------------------
// backends/factory.ts
// ---------------------------------------------------------------------------

import type { AgentBackendName, AgentMode } from '../db';
import type { ProviderName } from '../providers/types';
import { assertUnreachable } from '../utils';

import { createCursorSdkBackend } from './cursor-sdk';
import { createOpencodeSDKBackend } from './opencode-sdk';
import type { AgentBackend } from './types';

type CreateBackendProps = {
  backendName: AgentBackendName;
  dmBotRoot: string;
  cursorMode: AgentMode;
  opencodeAgentName: string | null;
  attachUrl: string | null;
  modelOverride: string | null;
  providerName: ProviderName | null;
};

export function createBackend({
  backendName,
  dmBotRoot,
  cursorMode,
  opencodeAgentName,
  modelOverride,
  providerName,
}: CreateBackendProps): AgentBackend {
  switch (backendName) {
    case 'cursor':
      return createCursorSdkBackend(modelOverride);
    case 'opencode':
      return createOpencodeSDKBackend({
        dmBotRoot,
        agentName: opencodeAgentName ?? cursorMode,
        modelOverride,
        providerName,
      });
    default:
      return assertUnreachable(backendName);
  }
}
