import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotInferenceKeySubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'inference-key',
    summary: 'Rotate the Bearer token for the OpenAI-compatible inference API.',
    details: [
      'The previous token stops working immediately.',
      'Copy the generated token into Inference Bridge as the endpoint API key.',
    ],
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${prefix}bot inference-key`],
  };
}
