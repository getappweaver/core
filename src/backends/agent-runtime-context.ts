import type { AgentBackendName } from '@src/db';

import type { AgentRunContext } from './types';

type BuildAgentRuntimeContentProps = {
  context: AgentRunContext | null;
  content: string;
};

type BuildActiveRuntimeContextProps = {
  backendName: AgentBackendName;
  dmBotRoot: string;
  cwd: string;
  sessionId: string | null;
  sessionTitle: string | null;
};

function workspaceTargetLabel(props: {
  cwd: string;
  dmBotRoot: string;
}): string {
  return props.cwd === props.dmBotRoot ? 'appweaver' : 'parent';
}

export function buildActiveRuntimeContext({
  backendName,
  dmBotRoot,
  cwd,
  sessionId,
  sessionTitle,
}: BuildActiveRuntimeContextProps): string {
  const workspaceTarget = workspaceTargetLabel({ cwd, dmBotRoot });

  const appweaverRuntimeConstraint =
    workspaceTarget === 'appweaver'
      ? '\nAppWeaver chat runtime constraint: do not create, touch, or modify restart.requested. That would restart the host process and can interrupt the active chat. If code changes need a restart, say so in your final response instead.'
      : '';

  const titleGuidance = sessionId
    ? `\nAppWeaver session ID: ${sessionId}
AppWeaver session title: ${sessionTitle ? JSON.stringify(sessionTitle) : '(untitled)'}
After the first meaningful user request, give an untitled session a specific title of at most 30 characters. If an automatically assigned title no longer describes the current conversation, update it. Use the session-title skill and run bun "${dmBotRoot}/src/cli.ts" session rename with JSON {"sessionId":"${sessionId}","title":"<short title>","mode":"auto"}. Use this exact session ID, not a global current-session ID. Auto renames never override manual titles; avoid renaming when the existing title still fits. Do not interrupt the user's task to discuss title maintenance.`
    : '';

  return `Backend: ${backendName}
Workspace target: ${workspaceTarget}
Workspace root: ${cwd}
AppWeaver root: ${dmBotRoot}
${appweaverRuntimeConstraint}
${titleGuidance}
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
