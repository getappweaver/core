import { createEffect, createSignal, onCleanup } from 'solid-js';

import type { StoryStep } from '@src/system/story-definition';

import {
  emitStoryClearPromptsRequested,
  emitStoryPassivePlaybackChange,
  emitStoryWalkthroughChange,
  emitStoryCloseWidgetRequested,
  onStoryPassivePlaybackPausedChange,
  onStoryPassivePlaybackReplayRequested,
  onStoryPassivePlaybackSeekRequested,
  onStoryCommandCompleted,
  onStoryQuitRequested,
  onStoryTargetClicked,
  onStoryTargetHovered,
  onStoryWidgetOpened,
} from './events';
import { activateStorySandbox, deactivateStorySandbox } from './sandbox';
import {
  STORY_FILL_FORM_TARGET_ID,
  storyActionMatches,
  type StoryPassivePlaybackState,
  type StoryRuntimePayload,
} from './types';

type StoryRuntimeViewProps = {
  payload: StoryRuntimePayload;
};

const DEFAULT_PASSIVE_STEP_DELAY_MS = 1800;
const PASSIVE_CATCH_UP_STEP_DELAY_MS = 16;
const MIN_PASSIVE_SHOWCASE_STEP_DELAY_MS = 2800;

function stepLabel(step: StoryStep<unknown>): string {
  if (step.type === 'instruction') {
    return step.text;
  }

  if (step.type === 'focus_target') {
    if (step.target.type === 'header_widget') {
      return `Use the highlighted header widget to open /${step.target.command} ${step.target.subcommand}.`;
    }

    if (step.target.type === 'web_node') {
      return 'Use the highlighted control.';
    }

    return `Use the highlighted /${step.target.command} ${step.target.subcommand} action.`;
  }

  if (step.type === 'wait_for_action') {
    if (step.match.type === 'widget_opened') {
      return `Waiting for /${step.match.command} ${step.match.subcommand} to open.`;
    }

    if (step.match.type === 'target_clicked') {
      return 'Waiting for the target control to be clicked.';
    }

    if (step.match.type === 'target_hovered') {
      return 'Waiting for the target control to be hovered.';
    }

    return `Waiting for /${step.match.command} ${step.match.subcommand}.`;
  }

  if (step.type === 'complete') {
    return 'Story complete.';
  }

  return step.type.replace(/_/g, ' ');
}

export function StoryRuntimeView(props: StoryRuntimeViewProps) {
  const navigationType = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;

  const autoStartOnMount =
    (props.payload.autoStart === true && navigationType?.type !== 'reload') ||
    window.location.pathname.startsWith('/demo/') ||
    false;

  const steps = () => props.payload.story.steps;

  const initialStepIndex = Math.min(
    Math.max(props.payload.initialStepIndex ?? 0, 0),
    props.payload.story.steps.length,
  );

  const [stepIndex, setStepIndex] = createSignal(
    props.payload.walkthrough === false ? 0 : initialStepIndex,
  );

  const [started, setStarted] = createSignal(autoStartOnMount);

  const [instruction, setInstruction] = createSignal(
    props.payload.story.description ?? 'Follow the story steps.',
  );

  const [passiveDisplayTitle, setPassiveDisplayTitle] = createSignal(
    props.payload.story.showcase?.title ?? props.payload.story.title,
  );

  const [passiveDisplayDescription, setPassiveDisplayDescription] =
    createSignal(
      props.payload.story.showcase?.description ??
        props.payload.story.description ??
        'Watching the story play through the app.',
    );

  const [complete, setComplete] = createSignal(false);
  const [passivePaused, setPassivePaused] = createSignal(false);

  const isPassivePlayback = () => props.payload.walkthrough === false;

  function stepPassiveDelayMs(step: StoryStep<unknown>): number {
    const delayMs =
      step.showcase?.delayMs ??
      props.payload.story.showcase?.timing?.stepDelayMs ??
      DEFAULT_PASSIVE_STEP_DELAY_MS;

    return step.showcase
      ? Math.max(delayMs, MIN_PASSIVE_SHOWCASE_STEP_DELAY_MS)
      : delayMs;
  }

  function clearWalkthrough(): void {
    emitStoryWalkthroughChange(null);
  }

  function emitWalkthrough(
    state: Parameters<typeof emitStoryWalkthroughChange>[0],
  ): void {
    if (isPassivePlayback()) {
      return;
    }

    emitStoryWalkthroughChange(state);
  }

  function emitPassivePlayback(params: {
    step: StoryStep<unknown> | null;
    currentStepIndex: number;
    instructionText: string;
    target: NonNullable<
      Parameters<typeof emitStoryPassivePlaybackChange>[0]
    >['target'];
    action: StoryPassivePlaybackState['action'];
    complete: boolean;
    catchingUp: boolean;
  }): void {
    if (!isPassivePlayback()) {
      return;
    }

    const title = params.step?.showcase?.title ?? passiveDisplayTitle();

    const description =
      params.step?.showcase?.description ?? passiveDisplayDescription();

    setPassiveDisplayTitle(title);
    setPassiveDisplayDescription(description);

    emitStoryPassivePlaybackChange({
      storyId: props.payload.id,
      stepIndex: params.currentStepIndex,
      title,
      description,
      target: params.target,
      action: params.action,
      complete: params.complete,
      catchingUp: params.catchingUp,
    });
  }

  function passiveStepAction(
    step: StoryStep<unknown>,
  ): StoryPassivePlaybackState['action'] {
    if (step.type === 'fill_form') {
      return { type: 'fill_form', values: step.values };
    }

    if (step.type !== 'wait_for_action') {
      return { type: 'none' };
    }

    if (step.match.type === 'widget_opened') {
      return {
        type: 'open_widget',
        command: step.match.command,
        subcommand: step.match.subcommand,
      };
    }

    if (step.match.type === 'target_clicked') {
      return { type: 'click_target', targetId: step.match.targetId };
    }

    if (step.match.type === 'target_hovered') {
      return { type: 'hover_target', targetId: step.match.targetId };
    }

    return { type: 'none' };
  }

  function passiveStepTarget(step: StoryStep<unknown>) {
    if (step.type === 'focus_target') {
      return step.target;
    }

    if (step.type === 'fill_form' && step.targetId) {
      return { type: 'web_node', targetId: step.targetId } as const;
    }

    if (step.type !== 'wait_for_action') {
      return null;
    }

    if (step.match.type === 'widget_opened') {
      return {
        type: 'header_widget',
        command: step.match.command,
        subcommand: step.match.subcommand,
      } as const;
    }

    if (
      step.match.type === 'target_clicked' ||
      step.match.type === 'target_hovered'
    ) {
      return { type: 'web_node', targetId: step.match.targetId } as const;
    }

    return null;
  }

  if (started()) {
    activateStorySandbox(props.payload);
  }

  function start(): void {
    activateStorySandbox(props.payload);

    setInstruction(
      props.payload.story.description ?? 'Follow the story steps.',
    );

    setStepIndex(0);
    setComplete(false);
    setStarted(true);
  }

  function advance(): void {
    setStepIndex((current) => Math.min(current + 1, steps().length));
  }

  function showcaseStepIndexes(): number[] {
    return steps().flatMap((step, index) => (step.showcase ? [index] : []));
  }

  function seekPassivePlayback(direction: 'previous' | 'next'): void {
    const indexes = showcaseStepIndexes();
    const current = stepIndex();

    const target =
      direction === 'next'
        ? (indexes.find((index) => index > current) ?? steps().length)
        : ([...indexes].reverse().find((index) => index < current) ?? 0);

    activateStorySandbox(props.payload);
    setComplete(false);
    setStarted(true);
    setStepIndex(target);
  }

  function quit(): void {
    for (const step of steps()) {
      if (step.type !== 'complete') {
        continue;
      }

      for (const widget of step.cleanup?.closeWidgets ?? []) {
        emitStoryCloseWidgetRequested(widget);
      }
    }

    clearWalkthrough();
    emitStoryPassivePlaybackChange(null);
    emitStoryClearPromptsRequested();
    deactivateStorySandbox(props.payload);
    setComplete(true);
    setInstruction('Story quit.');
  }

  createEffect(() => {
    if (!started()) {
      return;
    }

    const step = steps()[stepIndex()];

    if (!step) {
      setComplete(true);
      setInstruction('Story complete.');

      emitPassivePlayback({
        step: null,
        currentStepIndex: stepIndex(),
        instructionText: 'Story complete.',
        target: null,
        action: { type: 'none' },
        complete: true,
        catchingUp: false,
      });

      emitWalkthrough({
        storyId: props.payload.id,
        instruction: 'Story complete.',
        target: null,
        complete: true,
        nextStoryId: props.payload.story.nextStoryId,
      });

      return;
    }

    if (isPassivePlayback()) {
      if (passivePaused()) {
        return;
      }

      const passiveInstruction =
        step.type === 'instruction' ? step.text : stepLabel(step);

      const passiveTarget = passiveStepTarget(step);
      const catchingUp = stepIndex() < initialStepIndex;

      setInstruction(passiveInstruction);

      emitPassivePlayback({
        step,
        currentStepIndex: stepIndex(),
        instructionText: passiveInstruction,
        target: passiveTarget,
        action: passiveStepAction(step),
        complete: step.type === 'complete',
        catchingUp,
      });

      if (step.type === 'complete') {
        setComplete(true);

        return;
      }

      const delayMs = catchingUp
        ? PASSIVE_CATCH_UP_STEP_DELAY_MS
        : stepPassiveDelayMs(step);

      const timeoutId = window.setTimeout(() => {
        advance();
      }, delayMs);

      onCleanup(() => {
        window.clearTimeout(timeoutId);
      });

      return;
    }

    if (step.type === 'seed_sandbox') {
      advance();

      return;
    }

    if (step.type === 'instruction') {
      setInstruction(step.text);
      advance();

      return;
    }

    if (step.type === 'focus_target') {
      const text = instruction();

      emitWalkthrough({
        storyId: props.payload.id,
        instruction: text,
        target: step.target,
      });

      advance();

      return;
    }

    if (step.type === 'fill_form') {
      const text = 'Click Fill to fill the input for me.';
      setInstruction(text);

      emitWalkthrough({
        storyId: props.payload.id,
        instruction: text,
        target: step.targetId
          ? {
              type: 'web_node',
              targetId: step.targetId,
            }
          : null,
        fillFormValues: step.values,
      });

      return;
    }

    if (step.type === 'complete') {
      setComplete(true);
      setInstruction('Story complete.');

      emitWalkthrough({
        storyId: props.payload.id,
        instruction: 'Story complete.',
        target: null,
        complete: true,
        nextStoryId: props.payload.story.nextStoryId,
      });
    }
  });

  const stopWidgetOpenedListener = onStoryWidgetOpened((event) => {
    if (!started()) {
      return;
    }

    const step = steps()[stepIndex()];

    if (step?.type !== 'wait_for_action') {
      return;
    }

    if (!storyActionMatches(step.match, event)) {
      return;
    }

    clearWalkthrough();
    advance();
  });

  const stopTargetClickedListener = onStoryTargetClicked((targetId) => {
    if (!started()) {
      return;
    }

    const step = steps()[stepIndex()];

    if (step?.type === 'fill_form') {
      if (targetId !== STORY_FILL_FORM_TARGET_ID) {
        return;
      }

      clearWalkthrough();
      advance();

      return;
    }

    if (step?.type !== 'wait_for_action') {
      return;
    }

    if (
      step.match.type !== 'target_clicked' ||
      step.match.targetId !== targetId
    ) {
      return;
    }

    clearWalkthrough();
    advance();
  });

  const stopTargetHoveredListener = onStoryTargetHovered((targetId) => {
    if (!started()) {
      return;
    }

    const step = steps()[stepIndex()];

    if (step?.type !== 'wait_for_action') {
      return;
    }

    if (
      step.match.type !== 'target_hovered' ||
      step.match.targetId !== targetId
    ) {
      return;
    }

    clearWalkthrough();
    advance();
  });

  const stopCommandCompletedListener = onStoryCommandCompleted((event) => {
    if (!started()) {
      return;
    }

    const step = steps()[stepIndex()];

    if (step?.type !== 'wait_for_action') {
      return;
    }

    if (
      step.match.type !== 'command_completed' ||
      step.match.command !== event.command ||
      step.match.subcommand !== event.subcommand
    ) {
      return;
    }

    clearWalkthrough();
    advance();
  });

  const stopQuitRequestedListener = onStoryQuitRequested((storyId) => {
    if (storyId !== props.payload.id) {
      return;
    }

    quit();
  });

  const stopPassivePausedListener = onStoryPassivePlaybackPausedChange(
    (paused) => {
      setPassivePaused(paused);
    },
  );

  const stopPassiveReplayRequestedListener =
    onStoryPassivePlaybackReplayRequested((storyId) => {
      if (storyId !== props.payload.id || !isPassivePlayback()) {
        return;
      }

      activateStorySandbox(props.payload);
      setPassivePaused(false);
      setComplete(false);
      setStarted(true);
      setStepIndex(0);
    });

  const stopPassiveSeekRequestedListener = onStoryPassivePlaybackSeekRequested(
    (request) => {
      if (request.storyId !== props.payload.id || !isPassivePlayback()) {
        return;
      }

      seekPassivePlayback(request.direction);
    },
  );

  onCleanup(() => {
    stopWidgetOpenedListener();
    stopTargetClickedListener();
    stopTargetHoveredListener();
    stopCommandCompletedListener();
    stopQuitRequestedListener();
    stopPassivePausedListener();
    stopPassiveReplayRequestedListener();
    stopPassiveSeekRequestedListener();
    clearWalkthrough();
    emitStoryPassivePlaybackChange(null);
    deactivateStorySandbox(props.payload);
  });

  if (isPassivePlayback()) {
    return (
      <div class="story-runtime-card">
        <div class="story-runtime-card__eyebrow">Now playing</div>
        <div class="story-runtime-card__title">{passiveDisplayTitle()}</div>
        <div class="story-runtime-card__body">
          {passiveDisplayDescription()}
        </div>
      </div>
    );
  }

  return (
    <div class="story-runtime-card">
      <div class="story-runtime-card__eyebrow">
        {props.payload.pluginAlias} / {props.payload.id}
      </div>
      <div class="story-runtime-card__title">{props.payload.story.title}</div>
      <div class="story-runtime-card__body">{instruction()}</div>
      {!started() && !complete() ? (
        <div class="story-runtime-card__actions">
          <button type="button" class="web-button" onClick={start}>
            Start story
          </button>
        </div>
      ) : null}
      <div class="story-runtime-card__meta">
        {complete()
          ? 'Complete'
          : `Step ${Math.min(stepIndex() + 1, steps().length)} of ${steps().length}: ${stepLabel(steps()[Math.min(stepIndex(), steps().length - 1)]!)}`}
      </div>
      <div class="story-runtime-card__actions">
        <button type="button" class="web-button" onClick={quit}>
          Quit story
        </button>
      </div>
    </div>
  );
}
