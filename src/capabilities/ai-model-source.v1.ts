import { z } from 'zod';

import { WorkspaceTargetSchema } from '@src/db/shared';

import { defineCapability } from './types';

const DecimalStringSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/,
    'Expected a non-negative decimal string',
  );

export const AiModelAvailabilitySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('available') }),
  z.strictObject({
    status: z.literal('unavailable'),
    reason: z.string().min(1).max(500),
  }),
]);

export const AiModelPriceSchema = z
  .strictObject({
    inputPerMillionTokens: DecimalStringSchema.nullable(),
    outputPerMillionTokens: DecimalStringSchema.nullable(),
    currency: z.string().min(1).max(16),
  })
  .nullable();

export const AiModelSourceModelSchema = z.strictObject({
  id: z.string().min(1).max(500),
  label: z.string().min(1).max(500),
  description: z.string().max(2_000).nullable(),
  group: z.string().min(1).max(200),
  contextWindowTokens: z.number().int().positive().nullable(),
  inputModalities: z.array(z.string().min(1).max(50)).max(20),
  outputModalities: z.array(z.string().min(1).max(50)).max(20),
  features: z.array(z.string().min(1).max(100)).max(100),
  privacy: z.string().min(1).max(200).nullable(),
  price: AiModelPriceSchema,
  favorite: z.boolean(),
  lastUsedAt: z.string().datetime().nullable(),
  availability: AiModelAvailabilitySchema,
});

export const AiModelSourceStateSchema = z.strictObject({
  sourceId: z.string().min(1).max(300),
  title: z.string().min(1).max(200),
  active: z.boolean(),
  transitionState: z.enum(['stable', 'pending', 'failed']),
  health: z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('healthy') }),
    z.strictObject({
      status: z.literal('degraded'),
      message: z.string().max(500),
    }),
    z.strictObject({
      status: z.literal('unavailable'),
      message: z.string().max(500),
    }),
  ]),
  selectedModelId: z.string().min(1).max(500).nullable(),
  effectiveModelId: z.string().min(1).max(500),
  fallbackReason: z.enum(['selected', 'root', 'backend-default']),
  catalogRevision: z.string().min(1).max(300),
});

const WorkspaceInputSchema = z.strictObject({
  workspaceTarget: WorkspaceTargetSchema,
  backend: z.literal('opencode'),
});

const StateOutputSchema = z.strictObject({ state: AiModelSourceStateSchema });

const ModelsOutputSchema = z.strictObject({
  state: AiModelSourceStateSchema,
  models: z.array(AiModelSourceModelSchema).max(20_000),
});

export const AiModelSourceContextUsageSchema = z.strictObject({
  tokensTotal: z.number().int().nonnegative(),
  contextLimit: z.number().int().positive().nullable(),
  contextPercent: z.number().finite().min(0).max(100).nullable(),
  estimated: z.boolean(),
});

export const AiModelRuntimeConfigSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('canonical-model'),
    model: z.string().min(1).max(500),
  }),
  z.strictObject({
    kind: z.literal('openai-compatible'),
    provider: z.strictObject({
      id: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z0-9._-]+$/, 'Invalid OpenCode provider ID'),
      label: z.string().min(1).max(200),
      baseUrl: z.string().url().max(2_000),
      models: z
        .array(
          z.strictObject({
            id: z.string().min(1).max(500),
            label: z.string().min(1).max(500),
          }),
        )
        .min(1)
        .max(20_000),
    }),
    model: z.string().min(1).max(500),
  }),
]);

export const AiModelSourceV1 = defineCapability({
  capability: { name: 'ai-model-source', version: 1 },
  addedInCoreVersion: '12.8.6',
  operations: {
    'get-state': {
      id: 'capability:v1:ai-model-source.get-state',
      required: true,
      inputSchema: WorkspaceInputSchema,
      outputSchema: StateOutputSchema,
    },
    'list-models': {
      id: 'capability:v1:ai-model-source.list-models',
      required: true,
      inputSchema: WorkspaceInputSchema,
      outputSchema: ModelsOutputSchema,
    },
    'select-model': {
      id: 'capability:v1:ai-model-source.select-model',
      required: true,
      inputSchema: WorkspaceInputSchema.extend({
        modelId: z.string().min(1).max(500).nullable(),
      }),
      outputSchema: StateOutputSchema,
    },
    'set-favorite': {
      id: 'capability:v1:ai-model-source.set-favorite',
      required: true,
      inputSchema: WorkspaceInputSchema.extend({
        modelId: z.string().min(1).max(500),
        favorite: z.boolean(),
      }),
      outputSchema: ModelsOutputSchema,
    },
    'record-use': {
      id: 'capability:v1:ai-model-source.record-use',
      required: true,
      inputSchema: WorkspaceInputSchema.extend({
        modelId: z.string().min(1).max(500),
        usedAt: z.string().datetime(),
      }),
      outputSchema: z.strictObject({ recorded: z.boolean() }),
    },
    preflight: {
      id: 'capability:v1:ai-model-source.preflight',
      required: true,
      inputSchema: WorkspaceInputSchema.extend({
        modelId: z.string().min(1).max(500),
      }),
      outputSchema: z.discriminatedUnion('ready', [
        z.strictObject({ ready: z.literal(true) }),
        z.strictObject({
          ready: z.literal(false),
          reason: z.string().min(1).max(500),
        }),
      ]),
    },
    'get-runtime-config': {
      id: 'capability:v1:ai-model-source.get-runtime-config',
      required: true,
      inputSchema: WorkspaceInputSchema.extend({
        modelId: z.string().min(1).max(500),
      }),
      outputSchema: z.strictObject({ config: AiModelRuntimeConfigSchema }),
    },
    'get-context-usage': {
      id: 'capability:v1:ai-model-source.get-context-usage',
      required: true,
      inputSchema: WorkspaceInputSchema.extend({
        sessionId: z.string().min(1).max(500),
        modelId: z.string().min(1).max(500),
      }),
      outputSchema: z.strictObject({
        usage: AiModelSourceContextUsageSchema.nullable(),
      }),
    },
    activate: {
      id: 'capability:v1:ai-model-source.activate',
      required: false,
      inputSchema: WorkspaceInputSchema,
      outputSchema: StateOutputSchema,
    },
    deactivate: {
      id: 'capability:v1:ai-model-source.deactivate',
      required: false,
      inputSchema: WorkspaceInputSchema,
      outputSchema: z.strictObject({ active: z.boolean() }),
    },
  },
});

export type AiModelSourceModel = z.infer<typeof AiModelSourceModelSchema>;
export type AiModelSourceState = z.infer<typeof AiModelSourceStateSchema>;
export type AiModelSourceContextUsage = z.infer<
  typeof AiModelSourceContextUsageSchema
>;
export type AiModelRuntimeConfig = z.infer<typeof AiModelRuntimeConfigSchema>;
