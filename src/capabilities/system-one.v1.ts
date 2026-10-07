import { z } from 'zod';

import { defineCapability } from './types';

const SystemOneQuestionV1Schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    instructions: z.string().min(1),
    // Candidate descriptions may contain structured JSON, not just text.
    criteria: z
      .record(z.string(), z.json())
      .refine((value) => Object.keys(value).length > 0),
  }),
  z.object({
    type: z.literal('score'),
    instructions: z.string().min(1),
    criteria: z.array(z.string().min(1)).min(1),
  }),
]);

const SystemOneAnswerV1Schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    choice: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
    probabilities: z
      .record(z.string(), z.number().finite().min(0).max(1))
      .optional(),
  }),
  z.object({
    type: z.literal('score'),
    score: z.number().finite(),
    confidence: z.number().finite().min(0).max(1),
  }),
]);

export const SystemOneEvaluateInputV1Schema = z.object({
  model: z.string().min(1).nullable(),
  state: z.record(z.string(), z.unknown()),
  questions: z
    .record(z.string().min(1), SystemOneQuestionV1Schema)
    .refine((value) => Object.keys(value).length > 0),
});

export const SystemOneEvaluateOutputV1Schema = z.object({
  model: z.string().min(1).nullable(),
  answers: z.record(z.string(), SystemOneAnswerV1Schema),
});

export const SystemOneV1 = defineCapability({
  capability: { name: 'system-one', version: 1 },
  addedInCoreVersion: '13.9.2',
  operations: {
    evaluate: {
      id: 'capability:v1:system-one.evaluate',
      required: true,
      inputSchema: SystemOneEvaluateInputV1Schema,
      outputSchema: SystemOneEvaluateOutputV1Schema,
    },
  },
});

export type SystemOneEvaluateInputV1 = z.infer<
  typeof SystemOneEvaluateInputV1Schema
>;
export type SystemOneEvaluateOutputV1 = z.infer<
  typeof SystemOneEvaluateOutputV1Schema
>;

/** Check answer IDs, choice candidates, and probability keys against the caller's offered questions. */
export function validateSystemOneAnswers(
  input: SystemOneEvaluateInputV1,
  output: SystemOneEvaluateOutputV1,
): void {
  const requestedIds = Object.keys(input.questions).sort();
  const returnedIds = Object.keys(output.answers).sort();

  if (JSON.stringify(requestedIds) !== JSON.stringify(returnedIds)) {
    throw new Error(
      'System One returned a different set of answer IDs than requested.',
    );
  }

  for (const [id, question] of Object.entries(input.questions)) {
    const answer = output.answers[id]!;

    if (question.type !== answer.type) {
      throw new Error(`System One returned the wrong answer type for ${id}.`);
    }

    if (question.type === 'choice' && answer.type === 'choice') {
      const choices = Object.keys(question.criteria);

      if (!choices.includes(answer.choice)) {
        throw new Error(`System One returned an unknown choice for ${id}.`);
      }

      for (const candidate of Object.keys(answer.probabilities ?? {})) {
        if (!choices.includes(candidate)) {
          throw new Error(
            `System One returned a probability for an unknown choice in ${id}.`,
          );
        }
      }
    }
  }
}
