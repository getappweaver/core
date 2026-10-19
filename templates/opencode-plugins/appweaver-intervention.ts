type HookInput = {
  tool: string;
  sessionID: string;
  callID: string;
  args?: Record<string, unknown>;
};

type HookOutput = {
  args?: Record<string, unknown>;
  output?: string;
};

async function intervene(props: {
  phase: 'before' | 'after';
  input: HookInput;
  output: HookOutput;
}): Promise<{ action: string; output: string | null }> {
  const callbackUrl = process.env.APPWEAVER_INTERVENTION_URL;
  const token = process.env.APPWEAVER_INTERVENTION_TOKEN;

  if (!callbackUrl || !token) {
    return { action: props.phase === 'before' ? 'continue' : 'send', output: null };
  }

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phase: props.phase,
      sessionId: props.input.sessionID,
      callId: props.input.callID,
      tool: props.input.tool,
      args: props.phase === 'before' ? props.output.args ?? {} : props.input.args ?? {},
      output: props.phase === 'after' ? props.output.output ?? '' : null,
    }),
  });

  if (!response.ok) {
    throw new Error(`AppWeaver intervention failed: ${response.status}`);
  }

  return (await response.json()) as { action: string; output: string | null };
}

export const AppWeaverInterventionPlugin = async () => ({
  'chat.headers': async (input: { sessionID: string; agent: string }) => {
    const callbackUrl = process.env.APPWEAVER_INTERVENTION_URL;
    const token = process.env.APPWEAVER_INTERVENTION_TOKEN;

    if (!callbackUrl || !token) {
      return;
    }

    while (true) {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phase: 'model',
          sessionId: input.sessionID,
          agent: input.agent,
        }),
      });

      if (!response.ok) {
        throw new Error(`AppWeaver pause gate failed: ${response.status}`);
      }

      const decision = (await response.json()) as { action: string };

      if (decision.action === 'stop') {
        throw new Error('Agent stopped by user.');
      }

      if (decision.action !== 'wait') {
        return;
      }
    }
  },
  'tool.execute.before': async (input: HookInput, output: HookOutput) => {
    const decision = await intervene({ phase: 'before', input, output });

    if (decision.action === 'stop') {
      throw new Error('Tool call stopped by user.');
    }
  },
  'tool.execute.after': async (input: HookInput, output: HookOutput) => {
    const decision = await intervene({ phase: 'after', input, output });

    if (decision.action === 'stop') {
      throw new Error('Agent stopped by user.');
    }

    if (decision.output !== null) {
      output.output = decision.output;
    }
  },
});
