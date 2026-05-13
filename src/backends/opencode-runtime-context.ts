type BuildOpenCodeRuntimeContentProps = {
  backendName: 'opencode';
  agentName: string;
  dmBotRoot: string;
  cwd: string;
  content: string;
};

function workspaceTargetLabel(props: {
  cwd: string;
  dmBotRoot: string;
}): string {
  return props.cwd === props.dmBotRoot ? 'appweaver' : 'parent';
}

export function buildOpenCodeRuntimeContent({
  backendName,
  agentName,
  dmBotRoot,
  cwd,
  content,
}: BuildOpenCodeRuntimeContentProps): string {
  const workspaceTarget = workspaceTargetLabel({ cwd, dmBotRoot });

  return `## Active Runtime Context

Backend: ${backendName}
OpenCode agent profile: ${agentName}
OpenCode agent profile source of truth: .opencode/agents
Workspace target: ${workspaceTarget}
Workspace root: ${cwd}
AppWeaver root: ${dmBotRoot}
Tool permissions: enforced by the active OpenCode agent profile; do not add an extra shell approval layer from AGENTS.md.
AppWeaver chat runtime: AGENTS.md applies, with this additional in-app constraint: do not create, touch, or modify restart.requested. That would restart the host process and can interrupt the active chat. If code changes need a restart, say so in your final response instead.
Intent reminder: follow AGENTS.md "User intent comes first". If the user asks a question, proposes a hypothesis, asks for Q&A/brainstorming/discussion, or wants to figure something out together, respond conversationally and do not edit files or run implementation steps until the user clearly asks for a change.

## User Request

${content}`;
}
