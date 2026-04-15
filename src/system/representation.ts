import { z } from 'zod';

// Shared metadata carried by every handler result, regardless of plugin.
export const RepresentationMetaSchema = z.object({
  command: z.string().min(1),
  subcommand: z.string().min(1),
});

// Core representation envelope. Plugins provide their own `data` schema by
// extending this shape with `createRepresentationSchema(...)`.
export const RepresentationBaseSchema = z.object({
  kind: z.string().min(1),
  version: z.literal(1),
  meta: RepresentationMetaSchema,
});

export type RepresentationMeta = z.infer<typeof RepresentationMetaSchema>;
export type RepresentationBase = z.infer<typeof RepresentationBaseSchema>;

export function createRepresentationSchema<TDataSchema extends z.ZodTypeAny>(
  dataSchema: TDataSchema,
) {
  return RepresentationBaseSchema.extend({
    data: dataSchema,
  });
}
