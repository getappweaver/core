import type {
  CommandResultServerMessage,
  PromptPayload,
  WebSocketServerMessage,
} from '../ws-types';

import type { StoryRuntimePayload } from './types';

type RunCommandClientMessageLike = {
  type: 'run_command';
  requestId: string;
  command: string;
  subcommand: string;
};

type JsonCommandClientMessageLike = {
  type: 'json_command';
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
  promptIndexes: Record<string, number>;
  activePrompt: {
    requestId: string;
    command: string;
    subcommand: string;
    key: string;
  } | null;
};

type ScriptedTransition = {
  on: { command: string; subcommand: string };
  answer?: string;
  advanceOutput?: { command: string; subcommand: string };
  advanceOutputs?: Array<{ command: string; subcommand: string }>;
};

type StoryCommandOutputValue = CommandResultServerMessage['output'];

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

function isJsonCommandMessage(
  message: unknown,
): message is JsonCommandClientMessageLike {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const value = message as Record<string, unknown>;

  return (
    value.type === 'json_command' &&
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

function isStoryCommandOutputValue(
  value: unknown,
): value is StoryCommandOutputValue {
  if (typeof value === 'string') {
    return true;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    (record.kind === 'ui' ||
      record.kind === 'client_view' ||
      record.kind === 'timeline_event') &&
    record.version === 1
  );
}

export function activateStorySandbox(payload: StoryRuntimePayload): void {
  activeSandbox = {
    payload,
    outputIndexes: {},
    promptIndexes: {},
    activePrompt: null,
  };
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

function scriptedPrompts(): Record<string, PromptPayload | PromptPayload[]> {
  const value = sandboxRecord().__prompts;

  return value && typeof value === 'object'
    ? (value as Record<string, PromptPayload | PromptPayload[]>)
    : {};
}

function promptAtIndex(
  prompts: PromptPayload | PromptPayload[] | undefined,
  index: number,
): PromptPayload | null {
  if (!prompts) {
    return null;
  }

  if (!Array.isArray(prompts)) {
    return index === 0 ? prompts : null;
  }

  return prompts[index] ?? null;
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

  const prompt = promptAtIndex(
    scriptedPrompts()[commandKey(command, subcommand)],
    0,
  );

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
    const promptAnswer = params.message;
    const prompt = sandbox.activePrompt;

    if (!prompt || prompt.requestId !== promptAnswer.requestId) {
      return false;
    }

    sandbox.activePrompt = null;
    const promptKey = prompt.key;

    sandbox.promptIndexes[promptKey] =
      (sandbox.promptIndexes[promptKey] ?? 0) + 1;

    const nextPrompt = promptAtIndex(
      scriptedPrompts()[promptKey],
      sandbox.promptIndexes[promptKey] ?? 0,
    );

    if (nextPrompt) {
      sandbox.activePrompt = {
        requestId: promptAnswer.requestId,
        command: prompt.command,
        subcommand: prompt.subcommand,
        key: promptKey,
      };

      params.emit({
        type: 'prompt',
        requestId: promptAnswer.requestId,
        prompt: nextPrompt,
      });

      return true;
    }

    const transitionTargets = scriptedTransitions().flatMap((transition) => {
      if (
        transition.on.command !== prompt.command ||
        transition.on.subcommand !== prompt.subcommand ||
        (transition.answer !== undefined &&
          transition.answer !== promptAnswer.answer)
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

    const outputs = scriptedOutputs()[promptKey];
    const outputIndex = sandbox.outputIndexes[promptKey] ?? 0;
    const scriptedOutput = Array.isArray(outputs) ? outputs[outputIndex] : null;

    if (isStoryCommandOutputValue(scriptedOutput)) {
      params.emit({
        type: 'command_result',
        requestId: promptAnswer.requestId,
        output: scriptedOutput,
      });
    }

    params.emit({ type: 'done', requestId: promptAnswer.requestId });

    return true;
  }

  if (
    !isRunCommandMessage(params.message) &&
    !isJsonCommandMessage(params.message)
  ) {
    return false;
  }

  const commandMessage = params.message;

  const key = commandKey(commandMessage.command, commandMessage.subcommand);
  const outputs = scriptedOutputs()[key];
  const outputIndex = sandbox.outputIndexes[key] ?? 0;
  const scriptedOutput = Array.isArray(outputs) ? outputs[outputIndex] : null;
  const output = sandbox.payload.story.commandOutput;

  if (
    !canStorySandboxHandleCommand(
      commandMessage.command,
      commandMessage.subcommand,
    )
  ) {
    return false;
  }

  const prompt = promptAtIndex(scriptedPrompts()[key], 0);

  if (prompt) {
    sandbox.activePrompt = {
      requestId: commandMessage.requestId,
      command: commandMessage.command,
      subcommand: commandMessage.subcommand,
      key,
    };

    params.emit({
      type: 'prompt',
      requestId: commandMessage.requestId,
      prompt,
    });

    return true;
  }

  const transitionTargets = scriptedTransitions().flatMap((transition) => {
    if (
      transition.on.command !== commandMessage.command ||
      transition.on.subcommand !== commandMessage.subcommand ||
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

  const fallbackOutput =
    output?.web ?? output?.clientView ?? output?.text ?? '';

  const commandOutput = isStoryCommandOutputValue(scriptedOutput)
    ? scriptedOutput
    : fallbackOutput;

  params.emit({
    type: 'command_result',
    requestId: commandMessage.requestId,
    output: commandOutput,
  });

  for (const target of transitionTargets) {
    const targetKey = commandKey(target.command, target.subcommand);

    if (targetKey !== key) {
      continue;
    }

    sandbox.outputIndexes[targetKey] =
      (sandbox.outputIndexes[targetKey] ?? 0) + 1;
  }

  params.emit({ type: 'done', requestId: commandMessage.requestId });

  return true;
}
