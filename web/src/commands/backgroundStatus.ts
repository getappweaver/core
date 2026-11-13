import { createSignal } from 'solid-js';

import {
  BACKGROUND_COMMAND_STATUS_MARKER,
  BackgroundCommandUpdateSchema,
} from '@src/web/command-status';

export type BackgroundCommandStatus = {
  state: 'idle' | 'pending' | 'success' | 'warning' | 'error';
  activeTargetId: string | null;
  message: string | null;
  output: string | null;
  progress: number | null;
  updatedAt: number;
};

export { BACKGROUND_COMMAND_STATUS_MARKER } from '@src/web/command-status';

const [statuses, setStatuses] = createSignal<
  Record<string, BackgroundCommandStatus>
>({});

export function backgroundCommandStatuses() {
  return statuses();
}

export function backgroundCommandStatus(
  id: string | undefined,
): BackgroundCommandStatus | null {
  if (!id) {
    return null;
  }

  return statuses()[id] ?? null;
}

export function setBackgroundCommandStatus({
  id,
  state,
  activeTargetId,
  message,
  output,
  progress,
}: {
  id: string;
  state: BackgroundCommandStatus['state'];
  activeTargetId?: string | null;
  message: string | null;
  output: string | null;
  progress: number | null;
}): void {
  setStatuses((current) => ({
    ...current,
    [id]: {
      state,
      activeTargetId:
        activeTargetId === undefined
          ? (current[id]?.activeTargetId ?? null)
          : activeTargetId,
      message,
      output,
      progress,
      updatedAt: Date.now(),
    },
  }));
}

export function encodeBackgroundCommandStatus({
  id,
  state,
  message,
  output,
  progress,
}: {
  id: string;
  state: BackgroundCommandStatus['state'];
  message: string | null;
  output: string | null;
  progress: number | null;
}): string {
  return `${BACKGROUND_COMMAND_STATUS_MARKER}${JSON.stringify({
    id,
    state,
    message,
    output,
    progress,
  })}`;
}

export function parseBackgroundCommandStatus(
  value: string,
): Parameters<typeof setBackgroundCommandStatus>[0] | null {
  if (!value.startsWith(BACKGROUND_COMMAND_STATUS_MARKER)) {
    return null;
  }

  try {
    const parsed = BackgroundCommandUpdateSchema.safeParse(
      JSON.parse(value.slice(BACKGROUND_COMMAND_STATUS_MARKER.length)),
    );

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
