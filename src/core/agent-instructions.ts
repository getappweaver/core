import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkspaceTarget } from '@src/db';

export function readAgentsInstructions(props: {
  workspaceTarget: WorkspaceTarget;
  dmBotRoot: string;
  parentOfBotRoot: string;
}): string | null {
  const path =
    props.workspaceTarget === 'appweaver'
      ? join(props.dmBotRoot, '.appweaver', 'AGENTS.md')
      : join(props.parentOfBotRoot, 'AGENTS.md');

  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}
