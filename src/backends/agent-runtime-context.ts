import type { AgentBackendName } from '@src/db';

import type { AgentRunContext } from './types';

type BuildAgentRuntimeContentProps = {
  context: AgentRunContext | null;
  content: string;
};

type BuildActiveRuntimeContextProps = {
  backendName: AgentBackendName;
  agentName: string;
  dmBotRoot: string;
  cwd: string;
};

function workspaceTargetLabel(props: {
  cwd: string;
  dmBotRoot: string;
}): string {
  return props.cwd === props.dmBotRoot ? 'appweaver' : 'parent';
}

export function buildActiveRuntimeContext({
  backendName,
  agentName,
  dmBotRoot,
  cwd,
}: BuildActiveRuntimeContextProps): string {
  const workspaceTarget = workspaceTargetLabel({ cwd, dmBotRoot });

  const appweaverRuntimeConstraint =
    workspaceTarget === 'appweaver'
      ? '\nAppWeaver chat runtime constraint: do not create, touch, or modify restart.requested. That would restart the host process and can interrupt the active chat. If code changes need a restart, say so in your final response instead.'
      : '';

  return `Backend: ${backendName}
Agent profile: ${agentName}
Workspace target: ${workspaceTarget}
Workspace root: ${cwd}
AppWeaver root: ${dmBotRoot}
Tool permissions: enforced by the active agent profile.${appweaverRuntimeConstraint}
`;
}

export function buildAgentRuntimeContent({
  context,
  content,
}: BuildAgentRuntimeContentProps): string {
  if (context === null) {
    return content;
  }

  const sections: string[] = [];

  if (context.runtimeContext !== null) {
    sections.push(`## Active Runtime Context\n\n${context.runtimeContext}`);
  }

  if (context.workspaceInstructions !== null) {
    sections.push(
      `## Workspace Instructions\n\n${context.workspaceInstructions || '(No additional workspace instructions.)'}`,
    );
  }

  if (context.agentsInstructions !== null) {
    sections.push(`## AGENTS Instructions\n\n${context.agentsInstructions}`);
  }

  if (context.extraInstructions !== null) {
    sections.push(`## Extra Instructions\n\n${context.extraInstructions}`);
  }

  if (sections.length === 0) {
    return content;
  }

  sections.push(`## User Request\n\n${content}`);

  return sections.join('\n\n');
}
