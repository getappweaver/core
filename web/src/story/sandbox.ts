import type { PromptPayload, WebSocketServerMessage } from '../ws-types';

import type { StoryRuntimePayload } from './types';

type RunCommandClientMessageLike = {
  type: 'run_command';
  requestId: string;
  command: string;
  subcommand: string;
};

type PromptAnswerClientMessageLike = {
  type: 'prompt_answer';
  requestId: string;
  answer: string;
};

type StorySandboxState = {
  payload: StoryRuntimePayload;
  outputIndexes: Record<string, number>;
  activePrompt: {
    requestId: string;
    command: string;
    subcommand: string;
  } | null;
};

type ScriptedTransition = {
  on: { command: string; subcommand: string };
  answer?: string;
  advanceOutput?: { command: string; subcommand: string };
  advanceOutputs?: Array<{ command: string; subcommand: string }>;
};

let activeSandbox: StorySandboxState | null = null;

function isRunCommandMessage(
  message: unknown,
): message is RunCommandClientMessageLike {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const value = message as Record<string, unknown>;

  return (
    value.type === 'run_command' &&
    typeof value.requestId === 'string' &&
    typeof value.command === 'string' &&
    typeof value.subcommand === 'string'
  );
}

function isPromptAnswerMessage(
  message: unknown,
): message is PromptAnswerClientMessageLike {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const value = message as Record<string, unknown>;

  return (
    value.type === 'prompt_answer' &&
    typeof value.requestId === 'string' &&
    typeof value.answer === 'string'
  );
}

export function activateStorySandbox(payload: StoryRuntimePayload): void {
  activeSandbox = { payload, outputIndexes: {}, activePrompt: null };
}

function commandKey(command: string, subcommand: string): string {
  return `${command}:${subcommand}`;
}

function sandboxRecord(): Record<string, unknown> {
  return (activeSandbox?.payload.story.sandbox ?? {}) as Record<
    string,
    unknown
  >;
}

function scriptedOutputs(): Record<string, unknown[]> {
  const value = sandboxRecord().__outputs;

  return value && typeof value === 'object'
    ? (value as Record<string, unknown[]>)
    : {};
}

function scriptedPrompts(): Record<string, PromptPayload> {
  const value = sandboxRecord().__prompts;

  return value && typeof value === 'object'
    ? (value as Record<string, PromptPayload>)
    : {};
}

function scriptedTransitions(): ScriptedTransition[] {
  const value = sandboxRecord().__transitions;

  return Array.isArray(value) ? (value as ScriptedTransition[]) : [];
}

export function deactivateStorySandbox(payload: StoryRuntimePayload): void {
  if (activeSandbox?.payload.id !== payload.id) {
    return;
  }

  activeSandbox = null;
}

export function canStorySandboxHandleCommand(
  command: string,
  subcommand: string,
): boolean {
  const output = activeSandbox?.payload.story.commandOutput;
  const outputs = scriptedOutputs()[commandKey(command, subcommand)];
  const prompt = scriptedPrompts()[commandKey(command, subcommand)];
  const webMeta = output?.web?.meta;
  const clientViewMeta = output?.clientView?.meta;

  return (
    !!prompt ||
    (Array.isArray(outputs) && outputs.length > 0) ||
    (webMeta?.command === command && webMeta.subcommand === subcommand) ||
    (clientViewMeta?.command === command &&
      clientViewMeta.subcommand === subcommand)
  );
}

export function handleStorySandboxSocketMessage(params: {
  message: unknown;
  emit: (message: WebSocketServerMessage) => void;
}): boolean {
  const sandbox = activeSandbox;

  if (!sandbox) {
    return false;
  }

  if (isPromptAnswerMessage(params.message)) {
    const prompt = sandbox.activePrompt;

    if (!prompt || prompt.requestId !== params.message.requestId) {
      return false;
    }

    sandbox.activePrompt = null;

    const transitionTargets = scriptedTransitions().flatMap((transition) => {
      if (
        transition.on.command !== prompt.command ||
        transition.on.subcommand !== prompt.subcommand ||
        (transition.answer !== undefined &&
          transition.answer !== params.message.answer)
      ) {
        return [];
      }

      return [
        ...(transition.advanceOutput ? [transition.advanceOutput] : []),
        ...(transition.advanceOutputs ?? []),
      ];
    });

    for (const target of transitionTargets) {
      const targetKey = commandKey(target.command, target.subcommand);

      sandbox.outputIndexes[targetKey] =
        (sandbox.outputIndexes[targetKey] ?? 0) + 1;
    }

    params.emit({ type: 'done', requestId: params.message.requestId });

    return true;
  }

  if (!isRunCommandMessage(params.message)) {
    return false;
  }

  const key = commandKey(params.message.command, params.message.subcommand);
  const outputs = scriptedOutputs()[key];
  const outputIndex = sandbox.outputIndexes[key] ?? 0;
  const scriptedOutput = Array.isArray(outputs) ? outputs[outputIndex] : null;
  const output = sandbox.payload.story.commandOutput;

  if (
    !canStorySandboxHandleCommand(
      params.message.command,
      params.message.subcommand,
    )
  ) {
    return false;
  }

  const prompt = scriptedPrompts()[key];

  if (prompt) {
    sandbox.activePrompt = {
      requestId: params.message.requestId,
      command: params.message.command,
      subcommand: params.message.subcommand,
    };

    params.emit({
      type: 'prompt',
      requestId: params.message.requestId,
      prompt,
    });

    return true;
  }

  const transitionTargets = scriptedTransitions().flatMap((transition) => {
    if (
      transition.on.command !== params.message.command ||
      transition.on.subcommand !== params.message.subcommand ||
      transition.answer !== undefined
    ) {
      return [];
    }

    return [
      ...(transition.advanceOutput ? [transition.advanceOutput] : []),
      ...(transition.advanceOutputs ?? []),
    ];
  });

  for (const target of transitionTargets) {
    const targetKey = commandKey(target.command, target.subcommand);

    if (targetKey === key) {
      continue;
    }

    sandbox.outputIndexes[targetKey] =
      (sandbox.outputIndexes[targetKey] ?? 0) + 1;
  }

  params.emit({
    type: 'command_result',
    requestId: params.message.requestId,
    output:
      scriptedOutput ?? output.web ?? output.clientView ?? output.text ?? '',
  });

  for (const target of transitionTargets) {
    const targetKey = commandKey(target.command, target.subcommand);

    if (targetKey !== key) {
      continue;
    }

    sandbox.outputIndexes[targetKey] =
      (sandbox.outputIndexes[targetKey] ?? 0) + 1;
  }

  params.emit({ type: 'done', requestId: params.message.requestId });

  return true;
}
