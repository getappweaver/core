import type {
  StoryActionMatch,
  StoryDefinition,
  StoryTarget,
} from '@src/system/story-definition';

export type StoryRuntimePayload = {
  id: string;
  pluginAlias: string;
  pluginName: string;
  story: StoryDefinition<unknown>;
  autoStart?: boolean;
  walkthrough?: boolean;
  initialStepIndex?: number;
};

export type StoryWalkthroughTarget = StoryTarget;

export type StoryPassivePlaybackState = {
  storyId: string;
  stepIndex: number;
  title: string;
  description: string;
  target: StoryWalkthroughTarget | null;
  action:
    | { type: 'none' }
    | {
        type: 'open_widget';
        command: string;
        subcommand: string;
      }
    | { type: 'click_target'; targetId: string }
    | { type: 'hover_target'; targetId: string }
    | {
        type: 'fill_form';
        values: {
          arguments: Record<string, unknown>;
          options: Record<string, unknown>;
        };
      };
  complete?: boolean;
  catchingUp?: boolean;
};

export type StoryWalkthroughState = {
  storyId: string;
  instruction: string;
  target: StoryWalkthroughTarget | null;
  complete?: boolean;
  nextStoryId?: string;
  fillFormValues?: {
    arguments: Record<string, unknown>;
    options: Record<string, unknown>;
  };
};

export const STORY_FILL_FORM_TARGET_ID = '__story_fill_form__';

export type StoryWidgetOpenedEvent = {
  type: 'widget_opened';
  command: string;
  subcommand: string;
};

export type StoryObservedActionEvent =
  | StoryWidgetOpenedEvent
  | {
      type: 'target_hovered';
      targetId: string;
    };

export function storyActionMatches(
  match: StoryActionMatch,
  event: StoryObservedActionEvent,
): boolean {
  if (match.type !== event.type) {
    return false;
  }

  if (event.type === 'widget_opened') {
    return (
      match.command === event.command && match.subcommand === event.subcommand
    );
  }

  return match.targetId === event.targetId;
}
