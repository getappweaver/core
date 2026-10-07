import type { SubcommandDefinition } from '@src/system/command-definition';

export function getBotInferenceKeySubcommandDefinition(
  prefix: string,
): SubcommandDefinition {
  return {
    name: 'inference-key',
    summary:
      'Rotate the shared inference Bearer token and list available endpoints.',
    details: [
      'The previous token stops working immediately.',
      'Copy the generated token into Inference Bridge as the endpoint API key.',
      'The same token authenticates all explicitly registered inference endpoints.',
    ],
    aliases: [],
    arguments: [],
    options: [],
    examples: [`${prefix}bot inference-key`],
  };
}
