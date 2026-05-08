import { setSelectedOpencodeAgent } from '@src/db';

type HandleAiAgentSetProps = {
  seenDb: Parameters<typeof setSelectedOpencodeAgent>[0];
  name: string | undefined;
};

export function handleAiAgentSet(props: HandleAiAgentSetProps): string {
  const name = props.name?.trim() ?? '';

  if (name.length === 0) {
    return 'Usage: ai agents set <name>';
  }

  setSelectedOpencodeAgent(props.seenDb, name);

  return `Selected OpenCode agent: ${name}`;
}
