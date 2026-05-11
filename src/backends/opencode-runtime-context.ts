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
Ready-to-test reload rule: after changes under src/ or plugins/ pass lint/verification, create or touch restart.requested in the project root.

## User Request

${content}`;
}
