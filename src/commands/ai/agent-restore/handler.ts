import { restoreDefaultOpencodeAgents } from '@src/backends/opencode-config';
import {
  getAgentBackend,
  getSelectedOpencodeAgent,
  setSelectedOpencodeAgent,
  type CoreDb,
} from '@src/db';

type HandleAiAgentRestoreProps = {
  dmBotRoot: string;
  seenDb: CoreDb;
};

export async function handleAiAgentRestore(
  props: HandleAiAgentRestoreProps,
): Promise<string> {
  const backendName = getAgentBackend(props.seenDb);

  if (backendName === 'cursor') {
    return 'OpenCode agent restore is available only when the backend is opencode.';
  }

  const selectedBefore = getSelectedOpencodeAgent(props.seenDb);
  const nextConfig = await restoreDefaultOpencodeAgents(props.dmBotRoot);

  const stillExists = nextConfig.agents.some(
    (agent) => agent.name === selectedBefore,
  );

  if (!stillExists) {
    setSelectedOpencodeAgent(
      props.seenDb,
      nextConfig.agents[0]?.name ?? 'agent',
    );
  }

  return 'Restored OpenCode agents to the built-in defaults.';
}
