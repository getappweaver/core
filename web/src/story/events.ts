import type {
  StoryPassivePlaybackState,
  StoryWalkthroughState,
  StoryWidgetOpenedEvent,
} from './types';

const WALKTHROUGH_CHANGE_EVENT = 'appweaver-story-walkthrough-change';

const PASSIVE_PLAYBACK_CHANGE_EVENT = 'appweaver-story-passive-playback-change';

const PASSIVE_PLAYBACK_PAUSED_CHANGE_EVENT =
  'appweaver-story-passive-playback-paused-change';

const PASSIVE_PLAYBACK_REPLAY_REQUESTED_EVENT =
  'appweaver-story-passive-playback-replay-requested';

const PASSIVE_PLAYBACK_SEEK_REQUESTED_EVENT =
  'appweaver-story-passive-playback-seek-requested';

const WIDGET_OPENED_EVENT = 'appweaver-story-widget-opened';
const TARGET_CLICKED_EVENT = 'appweaver-story-target-clicked';
const TARGET_HOVERED_EVENT = 'appweaver-story-target-hovered';
const COMMAND_COMPLETED_EVENT = 'appweaver-story-command-completed';
const QUIT_REQUESTED_EVENT = 'appweaver-story-quit-requested';
const CLOSE_WIDGET_REQUESTED_EVENT = 'appweaver-story-close-widget-requested';

const CLEAR_PROMPTS_REQUESTED_EVENT = 'appweaver-story-clear-prompts-requested';

const FILL_FORM_EVENT = 'appweaver-story-fill-form';

export type StoryCommandCompletedEvent = {
  command: string;
  subcommand: string;
};

export type StoryCloseWidgetRequestedEvent = {
  command: string;
  subcommand: string;
};

export function emitStoryWalkthroughChange(
  state: StoryWalkthroughState | null,
): void {
  window.dispatchEvent(
    new CustomEvent<StoryWalkthroughState | null>(WALKTHROUGH_CHANGE_EVENT, {
      detail: state,
    }),
  );
}

export function onStoryWalkthroughChange(
  handler: (state: StoryWalkthroughState | null) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<StoryWalkthroughState | null>).detail);
  };

  window.addEventListener(WALKTHROUGH_CHANGE_EVENT, listener);

  return () => window.removeEventListener(WALKTHROUGH_CHANGE_EVENT, listener);
}

export function emitStoryPassivePlaybackChange(
  state: StoryPassivePlaybackState | null,
): void {
  window.dispatchEvent(
    new CustomEvent<StoryPassivePlaybackState | null>(
      PASSIVE_PLAYBACK_CHANGE_EVENT,
      { detail: state },
    ),
  );
}

export function onStoryPassivePlaybackChange(
  handler: (state: StoryPassivePlaybackState | null) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<StoryPassivePlaybackState | null>).detail);
  };

  window.addEventListener(PASSIVE_PLAYBACK_CHANGE_EVENT, listener);

  return () =>
    window.removeEventListener(PASSIVE_PLAYBACK_CHANGE_EVENT, listener);
}

export function emitStoryPassivePlaybackPausedChange(paused: boolean): void {
  window.dispatchEvent(
    new CustomEvent<boolean>(PASSIVE_PLAYBACK_PAUSED_CHANGE_EVENT, {
      detail: paused,
    }),
  );
}

export function onStoryPassivePlaybackPausedChange(
  handler: (paused: boolean) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<boolean>).detail);
  };

  window.addEventListener(PASSIVE_PLAYBACK_PAUSED_CHANGE_EVENT, listener);

  return () =>
    window.removeEventListener(PASSIVE_PLAYBACK_PAUSED_CHANGE_EVENT, listener);
}

export function emitStoryPassivePlaybackReplayRequested(storyId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(PASSIVE_PLAYBACK_REPLAY_REQUESTED_EVENT, {
      detail: storyId,
    }),
  );
}

export function onStoryPassivePlaybackReplayRequested(
  handler: (storyId: string) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<string>).detail);
  };

  window.addEventListener(PASSIVE_PLAYBACK_REPLAY_REQUESTED_EVENT, listener);

  return () =>
    window.removeEventListener(
      PASSIVE_PLAYBACK_REPLAY_REQUESTED_EVENT,
      listener,
    );
}

export type StoryPassivePlaybackSeekRequest = {
  storyId: string;
  direction: 'previous' | 'next';
};

export function emitStoryPassivePlaybackSeekRequested(
  request: StoryPassivePlaybackSeekRequest,
): void {
  window.dispatchEvent(
    new CustomEvent<StoryPassivePlaybackSeekRequest>(
      PASSIVE_PLAYBACK_SEEK_REQUESTED_EVENT,
      { detail: request },
    ),
  );
}

export function onStoryPassivePlaybackSeekRequested(
  handler: (request: StoryPassivePlaybackSeekRequest) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<StoryPassivePlaybackSeekRequest>).detail);
  };

  window.addEventListener(PASSIVE_PLAYBACK_SEEK_REQUESTED_EVENT, listener);

  return () =>
    window.removeEventListener(PASSIVE_PLAYBACK_SEEK_REQUESTED_EVENT, listener);
}

export function emitStoryWidgetOpened(event: StoryWidgetOpenedEvent): void {
  window.dispatchEvent(
    new CustomEvent<StoryWidgetOpenedEvent>(WIDGET_OPENED_EVENT, {
      detail: event,
    }),
  );
}

export function onStoryWidgetOpened(
  handler: (event: StoryWidgetOpenedEvent) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<StoryWidgetOpenedEvent>).detail);
  };

  window.addEventListener(WIDGET_OPENED_EVENT, listener);

  return () => window.removeEventListener(WIDGET_OPENED_EVENT, listener);
}

export function emitStoryTargetClicked(targetId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(TARGET_CLICKED_EVENT, { detail: targetId }),
  );
}

export function onStoryTargetClicked(
  handler: (targetId: string) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<string>).detail);
  };

  window.addEventListener(TARGET_CLICKED_EVENT, listener);

  return () => window.removeEventListener(TARGET_CLICKED_EVENT, listener);
}

export function emitStoryTargetHovered(targetId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(TARGET_HOVERED_EVENT, { detail: targetId }),
  );
}

export function onStoryTargetHovered(
  handler: (targetId: string) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<string>).detail);
  };

  window.addEventListener(TARGET_HOVERED_EVENT, listener);

  return () => window.removeEventListener(TARGET_HOVERED_EVENT, listener);
}

export function emitStoryCommandCompleted(
  event: StoryCommandCompletedEvent,
): void {
  window.dispatchEvent(
    new CustomEvent<StoryCommandCompletedEvent>(COMMAND_COMPLETED_EVENT, {
      detail: event,
    }),
  );
}

export function onStoryCommandCompleted(
  handler: (event: StoryCommandCompletedEvent) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<StoryCommandCompletedEvent>).detail);
  };

  window.addEventListener(COMMAND_COMPLETED_EVENT, listener);

  return () => window.removeEventListener(COMMAND_COMPLETED_EVENT, listener);
}

export function emitStoryQuitRequested(storyId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(QUIT_REQUESTED_EVENT, { detail: storyId }),
  );
}

export function onStoryQuitRequested(
  handler: (storyId: string) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<string>).detail);
  };

  window.addEventListener(QUIT_REQUESTED_EVENT, listener);

  return () => window.removeEventListener(QUIT_REQUESTED_EVENT, listener);
}

export function emitStoryCloseWidgetRequested(
  event: StoryCloseWidgetRequestedEvent,
): void {
  window.dispatchEvent(
    new CustomEvent<StoryCloseWidgetRequestedEvent>(
      CLOSE_WIDGET_REQUESTED_EVENT,
      {
        detail: event,
      },
    ),
  );
}

export function onStoryCloseWidgetRequested(
  handler: (event: StoryCloseWidgetRequestedEvent) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<StoryCloseWidgetRequestedEvent>).detail);
  };

  window.addEventListener(CLOSE_WIDGET_REQUESTED_EVENT, listener);

  return () =>
    window.removeEventListener(CLOSE_WIDGET_REQUESTED_EVENT, listener);
}

export function emitStoryClearPromptsRequested(): void {
  window.dispatchEvent(new CustomEvent(CLEAR_PROMPTS_REQUESTED_EVENT));
}

export function onStoryClearPromptsRequested(handler: () => void): () => void {
  const listener = () => {
    handler();
  };

  window.addEventListener(CLEAR_PROMPTS_REQUESTED_EVENT, listener);

  return () =>
    window.removeEventListener(CLEAR_PROMPTS_REQUESTED_EVENT, listener);
}

export function emitStoryFillForm(values: {
  arguments: Record<string, unknown>;
  options: Record<string, unknown>;
}): void {
  window.dispatchEvent(
    new CustomEvent<typeof values>(FILL_FORM_EVENT, { detail: values }),
  );
}

export function onStoryFillForm(
  handler: (values: {
    arguments: Record<string, unknown>;
    options: Record<string, unknown>;
  }) => void,
): () => void {
  const listener = (event: Event) => {
    handler(
      (
        event as CustomEvent<{
          arguments: Record<string, unknown>;
          options: Record<string, unknown>;
        }>
      ).detail,
    );
  };

  window.addEventListener(FILL_FORM_EVENT, listener);

  return () => window.removeEventListener(FILL_FORM_EVENT, listener);
}
