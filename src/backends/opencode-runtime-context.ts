import { existsSync } from 'fs';
import { join } from 'path';

type BuildOpenCodeRuntimeContentProps = {
  backendName: 'opencode';
  agentName: string;
  dmBotRoot: string;
  cwd: string;
  workspaceInstructions: string;
  content: string;
};

type BuildOpenCodeActiveRuntimeContextProps = Omit<
  BuildOpenCodeRuntimeContentProps,
  'content' | 'workspaceInstructions'
>;

function workspaceTargetLabel(props: {
  cwd: string;
  dmBotRoot: string;
}): string {
  return props.cwd === props.dmBotRoot ? 'appweaver' : 'parent';
}

export function buildOpenCodeActiveRuntimeContext({
  backendName,
  agentName,
  dmBotRoot,
  cwd,
}: BuildOpenCodeActiveRuntimeContextProps): string {
  const workspaceTarget = workspaceTargetLabel({ cwd, dmBotRoot });
  const agentsMdExists = existsSync(join(cwd, 'AGENTS.md'));

  const appweaverRuntimeConstraint =
    workspaceTarget === 'appweaver'
      ? '\nAppWeaver chat runtime constraint: do not create, touch, or modify restart.requested. That would restart the host process and can interrupt the active chat. If code changes need a restart, say so in your final response instead.'
      : '';

  return `Backend: ${backendName}
OpenCode agent profile: ${agentName}
OpenCode agent profile source of truth: .opencode/agents
Workspace target: ${workspaceTarget}
Workspace root: ${cwd}
AppWeaver root: ${dmBotRoot}
Tool permissions: enforced by the active OpenCode agent profile; do not add an extra shell approval layer from AGENTS.md.
Workspace AGENTS.md: ${agentsMdExists ? 'present and applied by OpenCode' : 'not found'}.${appweaverRuntimeConstraint}
`;
}

export function buildOpenCodeRuntimeContent({
  backendName,
  agentName,
  dmBotRoot,
  cwd,
  workspaceInstructions,
  content,
}: BuildOpenCodeRuntimeContentProps): string {
  const activeRuntimeContext = buildOpenCodeActiveRuntimeContext({
    backendName,
    agentName,
    dmBotRoot,
    cwd,
  });

  const effectiveWorkspaceInstructions =
    workspaceInstructions.length > 0
      ? workspaceInstructions
      : '(No additional workspace instructions.)';

  return `## Active Runtime Context

${activeRuntimeContext}
## Workspace Instructions

${effectiveWorkspaceInstructions}

## User Request

${content}`;
}
