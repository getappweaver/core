// ---------------------------------------------------------------------------
// backends/factory.ts
// ---------------------------------------------------------------------------

import type { AgentBackendName } from '../db';

import { opencodeRuntimeController } from './opencode-runtime-controller';
import { createOpencodeSDKBackend } from './opencode-sdk';
import type { AgentBackend } from './types';

type CreateBackendProps = {
  backendName: AgentBackendName;
  dmBotRoot: string;
};

export function createBackend({
  backendName: _backendName,
  dmBotRoot,
}: CreateBackendProps): AgentBackend {
  const backend = createOpencodeSDKBackend({ dmBotRoot });

  return {
    ...backend,
    createSession: (cwd) =>
      opencodeRuntimeController.withAdmission(() => backend.createSession(cwd)),
    runMessage: (props) =>
      opencodeRuntimeController.withAdmission(() => backend.runMessage(props)),
    runChatCompletion: (props) =>
      opencodeRuntimeController.withAdmission(() =>
        backend.runChatCompletion(props),
      ),
    availableModels: () =>
      opencodeRuntimeController.withAdmission(() => backend.availableModels()),
  };
}
