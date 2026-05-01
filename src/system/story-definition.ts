import type { WebNodeRoot, ClientViewRoot } from '@src/web/ui-schema';

export type StoryKind = 'command' | 'ai';

export type StoryCommandOutput = {
  text?: string | null;
  web?: WebNodeRoot | null;
  clientView?: ClientViewRoot | null;
};

export type StoryChatMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export type StoryChatState = {
  messages: StoryChatMessage[];
};

export type StoryChoice<TState> = {
  id: string;
  label: string;
  steps: StoryStep<TState>[];
};

export type StorySandboxState = Record<string, unknown>;

export type StoryShowcaseTiming = {
  initialDelayMs?: number;
  stepDelayMs?: number;
  storyDelayMs?: number;
};

export type StoryShowcase = {
  title: string;
  description: string;
  timing?: StoryShowcaseTiming;
};

export type StoryStepShowcase = {
  title?: string;
  description?: string;
  delayMs?: number;
};

type StoryStepBase = {
  showcase?: StoryStepShowcase;
};

export type StoryTarget =
  | {
      type: 'header_widget';
      command: string;
      subcommand: string;
    }
  | {
      type: 'web_node_action';
      command: string;
      subcommand: string;
      arguments?: Record<string, unknown>;
      options?: Record<string, unknown>;
    }
  | {
      type: 'web_node';
      targetId: string;
    };

export type StoryActionMatch =
  | {
      type: 'widget_opened';
      command: string;
      subcommand: string;
    }
  | {
      type: 'web_action';
      command: string;
      subcommand: string;
      arguments?: Record<string, unknown>;
      options?: Record<string, unknown>;
    }
  | {
      type: 'command_completed';
      command: string;
      subcommand: string;
      arguments?: Record<string, unknown>;
      options?: Record<string, unknown>;
    }
  | {
      type: 'target_clicked';
      targetId: string;
    }
  | {
      type: 'target_hovered';
      targetId: string;
    };

export type StoryStep<TState> = StoryStepBase &
  (
    | {
        type: 'instruction';
        text: string;
      }
    | {
        type: 'seed_sandbox';
        state: StorySandboxState;
      }
    | {
        type: 'focus_target';
        target: StoryTarget;
      }
    | {
        type: 'wait_for_action';
        match: StoryActionMatch;
      }
    | {
        type: 'fill_form';
        targetId?: string;
        values: {
          arguments: Record<string, unknown>;
          options: Record<string, unknown>;
        };
      }
    | {
        type: 'complete';
        cleanup?: {
          closeWidgets: Array<{
            command: string;
            subcommand: string;
          }>;
        };
      }
    | {
        type: 'user_message';
        text: string;
      }
    | {
        type: 'run_command';
        command: string;
        subcommand: string;
        payload: {
          arguments: Record<string, unknown>;
          options: Record<string, unknown>;
        };
      }
    | {
        type: 'assistant_message';
        text: string;
      }
    | {
        type: 'tool_activity';
        label: string;
        detail?: string;
      }
    | {
        type: 'set_state';
        state: TState;
      }
    | {
        type: 'choice';
        prompt: string;
        choices: StoryChoice<TState>[];
      }
  );

export type StoryDefinition<TState> = {
  id: string;
  title: string;
  description?: string;
  showcase?: StoryShowcase;
  kind: StoryKind;
  initialState: TState;
  sandbox?: StorySandboxState;
  nextStoryId?: string;
  steps: StoryStep<TState>[];
  commandOutput?: StoryCommandOutput;
};
