/**
 * Capability: translation:v1
 * Added in AppWeaver core: 10.0.1
 */
import { z } from 'zod';

import type { WebNodeRoot } from '@src/web/ui-schema';

import { defineCapability } from './types';

export const TranslationFormatV1Schema = z.enum(['plain-text', 'markdown']);

export const TranslationInputV1Schema = z.object({
  content: z.string().min(1),
  format: TranslationFormatV1Schema,
  sourceLanguage: z.string().min(1).nullable(),
  targetLanguage: z.string().min(1),
  context: z.string().nullable(),
});

export const TranslationOutputV1Schema = z.object({
  content: z.string(),
  sourceLanguage: z.string().min(1).nullable(),
  targetLanguage: z.string().min(1),
});

function renderTranslationResult(
  output: z.infer<typeof TranslationOutputV1Schema>,
): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: {
      command: 'translation',
      subcommand: 'translate',
    },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'sm' },
      children: [
        {
          type: 'element',
          tag: 'text',
          props: { tone: 'muted', size: 'sm' },
          children: [
            {
              type: 'text',
              value: `${output.sourceLanguage ?? 'auto'} → ${output.targetLanguage}`,
            },
          ],
        },
        {
          type: 'element',
          tag: 'text',
          props: { whiteSpace: 'pre-wrap' },
          children: [{ type: 'text', value: output.content }],
        },
      ],
    },
  };
}

export const TranslationV1 = defineCapability({
  capability: { name: 'translation', version: 1 },
  addedInCoreVersion: '10.0.1',
  operations: {
    translate: {
      id: 'capability:v1:translation.translate',
      required: true,
      inputSchema: TranslationInputV1Schema,
      outputSchema: TranslationOutputV1Schema,
      webResult: renderTranslationResult,
    },
  },
});

export type TranslationInputV1 = z.infer<typeof TranslationInputV1Schema>;
export type TranslationOutputV1 = z.infer<typeof TranslationOutputV1Schema>;
