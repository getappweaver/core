import { Show, createMemo, createSignal, onCleanup } from 'solid-js';

import type { WebNode, WebNodeRoot } from '@src/web/ui-schema';

import {
  emitStoryPassivePlaybackPausedChange,
  emitStoryPassivePlaybackReplayRequested,
  emitStoryPassivePlaybackSeekRequested,
  onStoryPassivePlaybackChange,
  onStoryPassivePlaybackPausedChange,
} from '../../story/events';
import type { StoryRuntimePayload } from '../../story/types';
import type { TimelineItem } from '../../types';

import { ClientViewHost } from '../ClientViewHost';
import { WebButton } from '../WebButton';
import {
  clearTreeItemExpandedStateForScope,
  type WebTreeToolbarRegistration,
} from '../WebNodeRenderer';
import { WebNodeShadowRoot } from '../WebNodeShadowRoot';

import { attachTimelineTreeHeaderInViewEffect } from './attachTimelineTreeHeaderInViewEffect';
import {
  cardHeadStoryPauseIcon,
  cardHeadStoryPlayIcon,
  cardHeadStoryPreviousIcon,
  cardHeadStoryNextIcon,
} from './timelineCardHeadIcons';
import { TimelineCollapsibleCard } from './TimelineCollapsibleCard';
import { TimelineSpeechButton } from './TimelineSpeechButton';
import { TimelineWebTreeToolbar } from './TimelineWebTreeToolbar';
import type { TimelineViewProps } from './types';

/** Shorter than native `behavior: "smooth"` (often 300ms+), still feels animated. */
const SCROLL_TO_TOP_MS = 150;

function scrollTimelineItemToTop(
  itemEl: HTMLElement,
  durationMs: number = SCROLL_TO_TOP_MS,
): void {
  const timeline = itemEl.closest('.timeline') as HTMLElement | null;

  if (timeline == null) {
    itemEl.scrollIntoView({ block: 'start', behavior: 'auto' });

    return;
  }

  const start = timeline.scrollTop;

  const delta =
    itemEl.getBoundingClientRect().top - timeline.getBoundingClientRect().top;

  const end = start + delta;

  if (Math.abs(end - start) < 1) {
    return;
  }

  const t0 = performance.now();
  const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / durationMs);
    timeline.scrollTop = start + (end - start) * easeOut(t);

    if (t < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

type TimelineCommandResultCardProps = {
  item: Extract<TimelineItem, { type: 'command_result' }>;
  onOpenCommand: TimelineViewProps['onOpenCommand'];
  onRepeatSubcommand: TimelineViewProps['onRepeatSubcommand'];
  onDeleteTimelineItem: TimelineViewProps['onDeleteTimelineItem'];
  onReplaceCommandWeb: TimelineViewProps['onReplaceCommandWeb'];
  isWebUiBusy: TimelineViewProps['isWebUiBusy'];
  onRunWebAction: TimelineViewProps['onRunWebAction'];
  onRunJsonCommand: TimelineViewProps['onRunJsonCommand'];
  onAppendSystem: TimelineViewProps['onAppendSystem'];
  currentUserPubkey: TimelineViewProps['currentUserPubkey'];
};

type SpeechSentenceState = {
  active: boolean;
  sentenceIndex: number | null;
  sentences: string[];
};

function isPassiveStoryRuntimeItem(
  item: TimelineCommandResultCardProps['item'],
): boolean {
  if (item.clientView?.view !== 'story-runtime') {
    return false;
  }

  const payload = item.clientView.payload as StoryRuntimePayload;

  return payload.walkthrough === false;
}

function passiveStoryRuntimeStoryId(
  item: TimelineCommandResultCardProps['item'],
): string | null {
  if (!isPassiveStoryRuntimeItem(item)) {
    return null;
  }

  const payload = item.clientView!.payload as StoryRuntimePayload;

  return typeof payload.id === 'string' ? payload.id : null;
}

function findTtsText(node: WebNode): string | null {
  if (node.type !== 'element') {
    return null;
  }

  const ttsText = node.props?.ttsText;

  if (typeof ttsText === 'string' && ttsText.trim().length > 0) {
    return ttsText;
  }

  for (const child of node.children ?? []) {
    const found = findTtsText(child);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

function webRootTtsText(root: WebNodeRoot | null | undefined): string | null {
  return root == null ? null : findTtsText(root.tree);
}

function StoryPlaybackToolbar(props: { buttonClass: string; storyId: string }) {
  const [paused, setPaused] = createSignal(false);
  const [completed, setCompleted] = createSignal(false);

  const stopPausedListener = onStoryPassivePlaybackPausedChange(setPaused);

  const stopPlaybackListener = onStoryPassivePlaybackChange((state) => {
    if (state?.storyId !== props.storyId) {
      return;
    }

    setCompleted(state.complete === true);

    if (state.complete === true) {
      setPaused(true);
    }
  });

  onCleanup(() => {
    stopPausedListener();
    stopPlaybackListener();
  });

  const setPlaybackPaused = (nextPaused: boolean): void => {
    setPaused(nextPaused);
    emitStoryPassivePlaybackPausedChange(nextPaused);
  };

  const togglePlayback = (): void => {
    if (completed()) {
      setCompleted(false);
      setPaused(false);
      emitStoryPassivePlaybackReplayRequested(props.storyId);

      return;
    }

    setPlaybackPaused(!paused());
  };

  const seekPlayback = (direction: 'previous' | 'next'): void => {
    setCompleted(false);

    emitStoryPassivePlaybackSeekRequested({
      storyId: props.storyId,
      direction,
    });
  };

  const btnClass = () =>
    [
      'tag',
      'tag-button',
      'card-head-chrome-btn',
      'card-head-tree-toolbar-btn',
      props.buttonClass,
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div
      class="card-head-tree-toolbar"
      role="toolbar"
      aria-label="Story playback"
    >
      <WebButton
        type="button"
        class={btnClass()}
        data-ui="story-playback-previous"
        title="Previous story step"
        aria-label="Previous story step"
        onClick={() => seekPlayback('previous')}
      >
        {cardHeadStoryPreviousIcon()}
      </WebButton>
      <WebButton
        type="button"
        class={btnClass()}
        data-ui="story-playback-toggle"
        title={paused() ? 'Play story' : 'Pause story'}
        aria-label={paused() ? 'Play story' : 'Pause story'}
        aria-pressed={!paused()}
        onClick={togglePlayback}
      >
        {paused() ? cardHeadStoryPlayIcon() : cardHeadStoryPauseIcon()}
      </WebButton>
      <WebButton
        type="button"
        class={btnClass()}
        data-ui="story-playback-next"
        title="Next story step"
        aria-label="Next story step"
        onClick={() => seekPlayback('next')}
      >
        {cardHeadStoryNextIcon()}
      </WebButton>
    </div>
  );
}

export function TimelineCommandResultCard(
  props: TimelineCommandResultCardProps,
) {
  const [cardEl, setCardEl] = createSignal<HTMLDivElement | undefined>();

  const [webTreeToolbar, setWebTreeToolbar] =
    createSignal<WebTreeToolbarRegistration | null>(null);

  const [webTreeHeaderEl, setWebTreeHeaderEl] =
    createSignal<HTMLElement | null>(null);

  const [treeHeaderInView, setTreeHeaderInView] = createSignal(true);

  const [speechState, setSpeechState] = createSignal<SpeechSentenceState>({
    active: false,
    sentenceIndex: null,
    sentences: [],
  });

  const [seekSentenceIndex, setSeekSentenceIndex] = createSignal<number | null>(
    null,
  );

  const storyRuntimeId = createMemo(() =>
    passiveStoryRuntimeStoryId(props.item),
  );

  const ttsText = createMemo(() => webRootTtsText(props.item.web));
  const speechHighlightActive = () => speechState().active;

  attachTimelineTreeHeaderInViewEffect({
    cardEl,
    treeHeaderEl: webTreeHeaderEl,
    setTreeHeaderInView,
  });

  const scrollCardToTop = () => {
    const el = cardEl();

    if (el != null) {
      scrollTimelineItemToTop(el);
    }
  };

  return (
    <TimelineCollapsibleCard
      class="card result-card"
      ref={(el) => setCardEl(el)}
      expandedHeadClass="card-head--timeline-sticky"
      expandedTrailingButtonClass="card-head__control"
      expandedHead={
        <>
          <button
            type="button"
            class="card-head__scroll-ledge"
            tabIndex={-1}
            title="Scroll to top of this result"
            aria-label="Scroll to top of this result"
            onClick={scrollCardToTop}
          />
          <div class="card-head-leading">
            <WebButton
              type="button"
              class="tag tag-button card-head__control"
              onClick={() => props.onOpenCommand(props.item.command)}
            >
              /{props.item.command}
            </WebButton>
            <WebButton
              type="button"
              class="tag tag-button card-head__control"
              onClick={() => props.onRepeatSubcommand(props.item)}
            >
              {props.item.subcommandTag}
            </WebButton>
          </div>
        </>
      }
      expandedHeadToolbar={
        <>
          <Show when={ttsText()}>
            {(text) => (
              <div
                class="card-head-tree-toolbar"
                role="toolbar"
                aria-label="Read result"
              >
                <TimelineSpeechButton
                  text={text()}
                  class="card-head__control card-head-tree-toolbar-btn card-head-speech-btn--manual"
                  label="result"
                  seekSentenceIndex={seekSentenceIndex()}
                  onSeekHandled={() => setSeekSentenceIndex(null)}
                  onSentenceState={setSpeechState}
                />
              </div>
            )}
          </Show>
          <Show when={props.item.web}>
            <TimelineWebTreeToolbar
              onScrollToTop={scrollCardToTop}
              toolbar={webTreeToolbar}
              treeHeaderInView={treeHeaderInView}
              buttonClass="card-head__control"
            />
          </Show>
          <Show when={storyRuntimeId()}>
            {(storyId) => (
              <StoryPlaybackToolbar
                buttonClass="card-head__control"
                storyId={storyId()}
              />
            )}
          </Show>
        </>
      }
      collapsedHeadSummary={
        <>
          <WebButton
            type="button"
            class="tag tag-button card-head__control"
            onClick={() => props.onOpenCommand(props.item.command)}
          >
            /{props.item.command}
          </WebButton>
          <WebButton
            type="button"
            class="tag tag-button card-head__control"
            onClick={() => props.onRepeatSubcommand(props.item)}
          >
            {props.item.subcommandTag}
          </WebButton>
        </>
      }
      onDismiss={() => {
        clearTreeItemExpandedStateForScope(props.item.id);
        props.onDeleteTimelineItem(props.item.id);
      }}
    >
      <Show
        when={props.item.web || props.item.clientView}
        fallback={<pre>{props.item.text ?? ''}</pre>}
      >
        <Show
          when={props.item.web}
          fallback={
            <ClientViewHost
              view={props.item.clientView!}
              onRunJsonCommand={props.onRunJsonCommand}
            />
          }
        >
          <div class="web-result">
            <WebNodeShadowRoot
              root={props.item.web!}
              renderSurface="timeline"
              stateScopeId={props.item.id}
              busy={props.isWebUiBusy(props.item.id)}
              currentUserPubkey={props.currentUserPubkey}
              speechSentences={
                speechHighlightActive() ? speechState().sentences : undefined
              }
              activeSpeechSentenceIndex={
                speechHighlightActive() ? speechState().sentenceIndex : null
              }
              onSpeechSentenceClick={
                speechHighlightActive()
                  ? (index) => setSeekSentenceIndex(index)
                  : null
              }
              onWebTreeToolbarChange={setWebTreeToolbar}
              onWebTreeHeaderEl={setWebTreeHeaderEl}
              onReplaceRoot={(root) =>
                props.onReplaceCommandWeb(props.item.id, root)
              }
              onRunAction={(action, params) =>
                props.onRunWebAction(action, {
                  ...params,
                  ...(props.item.timelineSingletonKey
                    ? {
                        uiExecutionPolicy: {
                          recordInTimeline: false,
                          suppressSystemMessage: true,
                        },
                      }
                    : {}),
                  webCommandSourceId: props.item.id,
                })
              }
              onError={(message) => props.onAppendSystem(message)}
            />
          </div>
        </Show>
      </Show>
    </TimelineCollapsibleCard>
  );
}
