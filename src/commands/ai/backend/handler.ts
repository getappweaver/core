import { createBackend } from '@src/backends/factory';
import { disposeOpencodeSdk } from '@src/backends/opencode-sdk';
import {
  AgentBackendNameSchema,
  getAgentBackend,
  getBackendExecutionProfile,
  getCurrentOrDefaultMode,
  getModelOverride,
  getProviderName,
  getWorkspaceTarget,
  setAgentBackend,
  type CoreDb,
} from '@src/db';
import { createNewSession } from '@src/session';
import { ensureOpencodeParentWorkspaceAssets } from '@src/workspace-assets';

import type { AiBackendRepresentation } from './representation';

type HandleAiBackendProps = {
  db: CoreDb;
  dmBotRoot: string;
  parentOfBotRoot: string;
  attachUrl: string | null;
  selected: string | undefined;
  prefix: string;
};

function toRepresentation(
  data: AiBackendRepresentation['data'],
): AiBackendRepresentation {
  return {
    kind: 'ai.backend',
    version: 1,
    meta: { command: 'ai', subcommand: 'backend' },
    data,
  };
}

export async function handleAiBackend(
  props: HandleAiBackendProps,
): Promise<AiBackendRepresentation> {
  const { db, dmBotRoot, parentOfBotRoot, attachUrl, selected, prefix } = props;

  const backendOpts = AgentBackendNameSchema.options.join('|');

  if (!selected) {
    return toRepresentation({
      view: 'query',
      backend: getAgentBackend(db),
    });
  }

  const parsed = AgentBackendNameSchema.safeParse(selected);

  if (!parsed.success) {
    return toRepresentation({
      view: 'invalid-usage',
      prefix,
      backendOpts,
    });
  }

  const nextBackendName = parsed.data;
  const prevBackendName = getAgentBackend(db);

  if (nextBackendName === prevBackendName) {
    return toRepresentation({
      view: 'unchanged',
      backend: nextBackendName,
    });
  }

  setAgentBackend(db, nextBackendName);

  if (prevBackendName === 'opencode' && nextBackendName !== 'opencode') {
    disposeOpencodeSdk();
  }

  const workspace = getWorkspaceTarget(db);

  ensureOpencodeParentWorkspaceAssets({
    backend: nextBackendName,
    workspace,
    dmBotRoot,
    parentOfBotRoot,
  });

  const cwd = workspace === 'appweaver' ? dmBotRoot : parentOfBotRoot;
  const executionProfile = getBackendExecutionProfile(db, nextBackendName);
  const modelOverride = getModelOverride(db, nextBackendName);
  const providerName = getProviderName(db);

  const newBackend = createBackend({
    backendName: nextBackendName,
    dmBotRoot,
    cursorMode: getCurrentOrDefaultMode(db),
    opencodeAgentName:
      executionProfile.kind === 'opencode' ? executionProfile.agent : null,
    attachUrl,
    modelOverride,
    providerName,
  });

  try {
    const sessionId = await createNewSession({
      db,
      backend: newBackend,
      cwd,
    });

    return toRepresentation({
      view: 'switched',
      previousBackend: prevBackendName,
      nextBackend: nextBackendName,
      newSessionId: sessionId,
    });
  } catch (err) {
    return toRepresentation({
      view: 'switched-session-failed',
      nextBackend: nextBackendName,
      errorMessage: String(err),
    });
  }
}
