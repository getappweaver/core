import { createSignal } from 'solid-js';

export type BackgroundCommandStatus = {
  state: 'idle' | 'pending' | 'success' | 'error';
  activeTargetId: string | null;
  message: string | null;
  output: string | null;
  progress: number | null;
  updatedAt: number;
};

export const BACKGROUND_COMMAND_STATUS_MARKER = '__WEB_COMMAND_STATUS__';

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
    const parsed = JSON.parse(
      value.slice(BACKGROUND_COMMAND_STATUS_MARKER.length),
    ) as Partial<Parameters<typeof setBackgroundCommandStatus>[0]>;

    if (!parsed.id || !parsed.state) {
      return null;
    }

    return {
      id: parsed.id,
      state: parsed.state,
      message: parsed.message ?? null,
      output: parsed.output ?? null,
      progress:
        typeof parsed.progress === 'number'
          ? Math.max(0, Math.min(1, parsed.progress))
          : null,
    };
  } catch {
    return null;
  }
}
