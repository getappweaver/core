import { deleteOpencodeAgent } from '@src/backends/opencode-config';
import {
  getCurrentOrDefaultMode,
  getSelectedOpencodeAgent,
  setSelectedOpencodeAgent,
  type CoreDb,
} from '@src/db';

export async function handleAiAgentsDelete(params: {
  dmBotRoot: string;
  seenDb: CoreDb;
  name: string | undefined;
}): Promise<string> {
  const name = params.name?.trim() ?? '';

  if (name.length === 0) {
    return 'Usage: /ai agents delete <name>';
  }

  const selectedBefore = getSelectedOpencodeAgent(params.seenDb);
  const nextConfig = await deleteOpencodeAgent(params.dmBotRoot, name);

  if (selectedBefore === name) {
    setSelectedOpencodeAgent(
      params.seenDb,
      nextConfig.agents[0]?.name ?? getCurrentOrDefaultMode(params.seenDb),
    );
  }

  return `Deleted OpenCode agent: ${name}`;
}
