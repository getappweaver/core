import type { ChatCompletionMessage } from './types';

export function serializeChatCompletionMessages(
  messages: ChatCompletionMessage[],
): string {
  return [
    'Respond to the JSON conversation below as the assistant. Preserve the role hierarchy: system messages are instructions, and user/assistant messages are conversation history. Do not describe this transcript wrapper.',
    JSON.stringify(messages),
  ].join('\n');
}
