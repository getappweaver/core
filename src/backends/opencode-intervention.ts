import { randomUUID } from 'crypto';

import { z } from 'zod';

import {
  findToolInvocationRule,
  saveToolInvocationRule,
  type CoreDb,
} from '@src/db';
import { log } from '@src/logger';

export const OPENCODE_INTERVENTION_PATH = '/api/opencode/intervention';

const interventionToken = randomUUID();
let interventionPort = 5551;

export type ToolInterventionPhase = 'before' | 'after';

export type ToolInterventionRequest = {
  id: string;
  phase: ToolInterventionPhase;
  sessionId: string;
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  output: string | null;
  matchedRuleId?: string;
  matchedRulePattern?: string | null;
};

export type ToolInterventionDecision = {
  action: 'continue' | 'stop' | 'send';
  output: string | null;
  remember: boolean;
  ruleArgumentKey: string | null;
  rulePattern: string | null;
};

export type InterventionBridge = {
  db: CoreDb;
  enabled: () => boolean;
  send: (request: ToolInterventionRequest) => void;
  abort: () => void;
};

const RequestSchema = z.object({
  phase: z.enum(['before', 'after']),
  sessionId: z.string().min(1),
  callId: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  output: z.string().nullable(),
});

const bridges = new Map<string, InterventionBridge>();

const pending = new Map<
  string,
  {
    bridge: InterventionBridge;
    resolve: (decision: ToolInterventionDecision) => void;
  }
>();

function defaultDecision(request: {
  phase: ToolInterventionPhase;
  output: string | null;
}): ToolInterventionDecision {
  return request.phase === 'before'
    ? {
        action: 'continue',
        output: null,
        remember: false,
        ruleArgumentKey: null,
        rulePattern: null,
      }
    : {
        action: 'send',
        output: request.output ?? '',
        remember: false,
        ruleArgumentKey: null,
        rulePattern: null,
      };
}

export function configureOpencodeInterventionPort(port: number): void {
  interventionPort = port;
}

export function getOpencodeInterventionEnvironment(): {
  callbackUrl: string;
  token: string;
} {
  return {
    callbackUrl: `http://127.0.0.1:${interventionPort}${OPENCODE_INTERVENTION_PATH}`,
    token: interventionToken,
  };
}

export function registerOpencodeInterventionBridge(props: {
  sessionId: string;
  bridge: InterventionBridge;
}): void {
  bridges.set(props.sessionId, props.bridge);
  log.info(`[intervention] registered session ${props.sessionId}`);
}

export function unregisterOpencodeInterventionBridge(props: {
  sessionId: string;
  bridge: InterventionBridge;
}): void {
  if (bridges.get(props.sessionId) === props.bridge) {
    bridges.delete(props.sessionId);
    log.info(`[intervention] unregistered session ${props.sessionId}`);
  }
}

export function clearOpencodeInterventionsForBridge(
  bridge: InterventionBridge,
): void {
  for (const [requestId, current] of pending) {
    if (current.bridge !== bridge) {
      continue;
    }

    pending.delete(requestId);

    current.resolve({
      action: 'stop',
      output: null,
      remember: false,
      ruleArgumentKey: null,
      rulePattern: null,
    });
  }
}

export function resolveOpencodeIntervention(
  requestId: string,
  decision: ToolInterventionDecision,
): boolean {
  const current = pending.get(requestId);

  if (!current) {
    return false;
  }

  pending.delete(requestId);

  current.resolve(decision);

  return true;
}

export async function handleOpencodeInterventionRequest(
  req: Request,
): Promise<Response> {
  if (req.headers.get('Authorization') !== `Bearer ${interventionToken}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const request: ToolInterventionRequest = {
    id: randomUUID(),
    ...parsed.data,
  };

  const bridge = bridges.get(request.sessionId);

  if (!bridge?.enabled()) {
    log.info(
      `[intervention] bypass ${request.phase} ${request.tool} ${request.callId}`,
    );

    return Response.json(defaultDecision(request));
  }

  const remembered = findToolInvocationRule({
    db: bridge.db,
    phase: request.phase,
    tool: request.tool,
    args: request.args,
  });

  if (remembered) {
    log.info(
      `[intervention] remembered ${request.phase} ${request.tool}: ${remembered.action}`,
    );

    if (remembered.action === 'stop') {
      queueMicrotask(bridge.abort);
    }

    bridge.send({
      ...request,
      matchedRuleId: remembered.id,
      matchedRulePattern: remembered.pattern,
    });

    return Response.json(
      request.phase === 'after'
        ? {
            action: remembered.action,
            output: request.output ?? '',
            remember: true,
            ruleArgumentKey: remembered.argumentKey,
            rulePattern: remembered.pattern,
          }
        : {
            action: remembered.action,
            output: null,
            remember: true,
            ruleArgumentKey: remembered.argumentKey,
            rulePattern: remembered.pattern,
          },
    );
  }

  log.info(
    `[intervention] waiting ${request.phase} ${request.tool} ${request.callId}`,
  );

  const decision = await new Promise<ToolInterventionDecision>((resolve) => {
    pending.set(request.id, {
      bridge,
      resolve: (value) => {
        if (value.remember) {
          saveToolInvocationRule({
            db: bridge.db,
            phase: request.phase,
            tool: request.tool,
            args: request.args,
            action: value.action,
            argumentKey: value.ruleArgumentKey,
            pattern: value.rulePattern,
          });
        }

        resolve(value);
      },
    });

    bridge.send(request);
  });

  log.info(
    `[intervention] resolved ${request.phase} ${request.tool}: ${decision.action}${decision.remember ? ' (remembered)' : ''}`,
  );

  if (decision.action === 'stop') {
    queueMicrotask(bridge.abort);
  }

  return Response.json(decision);
}
