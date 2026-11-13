import { z } from 'zod';

/** Transient command-result payload, never a timeline/history entry. */
export const BACKGROUND_COMMAND_STATUS_MARKER = '__WEB_COMMAND_STATUS__';

export const BackgroundCommandUpdateSchema = z.object({
  id: z.string().min(1),
  state: z.enum(['idle', 'pending', 'success', 'warning', 'error']),
  message: z.string().nullable(),
  output: z.string().nullable(),
  progress: z.number().min(0).max(1).nullable(),
});

export type BackgroundCommandUpdate = z.infer<
  typeof BackgroundCommandUpdateSchema
>;

export function encodeCommandStatus(update: BackgroundCommandUpdate): string {
  return `${BACKGROUND_COMMAND_STATUS_MARKER}${JSON.stringify(update)}`;
}
