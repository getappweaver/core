// ---------------------------------------------------------------------------
// backends/types.ts
// ---------------------------------------------------------------------------
import type { AgentBackendName } from '../db';

import type { AgentStreamChunk } from './agent-stream-chunk';

export type OutputSegment =
  { type: 'text'; value: string } | { type: 'reasoning'; value: string };

export type AgentRunResult = AgentErrorResult | AgentSuccessResult;

export type AgentErrorResult = {
  type: 'error';
  output: string;
  sessionId: string;
  statusCode?: number;
};

export type AgentSuccessResult = {
  type: 'success';
  outputs: OutputSegment[];
  sessionId: string;
  model?: string;
  tokens?: { input: number; output: number; total: number };
  cost?: number;
};

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning: string | null;
};

export type ChatCompletionChunk =
  | { type: 'text_delta'; content: string }
  | { type: 'reasoning_delta'; content: string };

export type RunChatCompletionProps = {
  messages: ChatCompletionMessage[];
  model: string;
  cwd: string;
  onChunk: (chunk: ChatCompletionChunk) => void;
  abortSignal: AbortSignal;
};

export type ChatCompletionResult = {
  outputs: OutputSegment[];
  model: string;
  tokens: { input: number; output: number; total: number } | null;
};

export function getMessageOutput(outputs: OutputSegment[]): string {
  return outputs
    .filter((o): o is { type: 'text'; value: string } => o.type === 'text')
    .map((o) => o.value)
    .join('');
}

export function getOutputString(result: AgentRunResult): string {
  return result.type === 'success'
    ? getMessageOutput(result.outputs)
    : result.output;
}

export type RunMessageProps = {
  sessionId: string;
  content: string;
  cwd: string;
  context: AgentRunContext | null;
  modelOverride: string | null;
  onAgentStreamChunk: ((chunk: AgentStreamChunk) => void) | null;
  streamAbortSignal: AbortSignal | null;
};

export type AgentRunContext = {
  runtimeContext: string | null;
  workspaceInstructions: string | null;
  agentsInstructions: string | null;
  extraInstructions: string | null;
};

export type AgentBackend = {
  name: AgentBackendName;
  createSession(cwd: string): Promise<string>;
  runMessage(props: RunMessageProps): Promise<AgentRunResult>;
  runChatCompletion(
    props: RunChatCompletionProps,
  ): Promise<ChatCompletionResult>;
  availableModels(): Promise<string[]>;
};
