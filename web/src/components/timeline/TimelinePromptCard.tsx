import { Show, createSignal } from 'solid-js';

import type { TimelineItem } from '../../types';

import { WebNodeShadowRoot } from '../WebNodeShadowRoot';

import { TimelineCollapsibleCard } from './TimelineCollapsibleCard';
import {
  TimelineSpeechButton,
  readablePromptText,
} from './TimelineSpeechButton';
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

type TimelinePromptCardProps = {
  item: Extract<TimelineItem, { type: 'prompt' }>;
  isWebUiBusy: TimelineViewProps['isWebUiBusy'];
  onDeleteTimelineItem: TimelineViewProps['onDeleteTimelineItem'];
  onRunWebAction: TimelineViewProps['onRunWebAction'];
  onAppendSystem: TimelineViewProps['onAppendSystem'];
};

export function TimelinePromptCard(props: TimelinePromptCardProps) {
  const [cardEl, setCardEl] = createSignal<HTMLDivElement | undefined>();

  const speechText = () =>
    readablePromptText({ text: props.item.text, web: props.item.web });

  const scrollCardToTop = () => {
    const el = cardEl();

    if (el != null) {
      scrollTimelineItemToTop(el);
    }
  };

  return (
    <TimelineCollapsibleCard
      class="card result-card prompt-card"
      ref={(el) => setCardEl(el)}
      expandedHeadClass="card-head--timeline-sticky"
      expandedTrailingButtonClass="card-head__control"
      expandedHead={
        <div class="card-head-leading">
          <span class="tag mode-tag card-head__control">prompt</span>
          <button
            type="button"
            class="card-head__scroll-ledge"
            tabIndex={-1}
            title="Scroll to top of this prompt"
            aria-label="Scroll to top of this prompt"
            onClick={scrollCardToTop}
          />
        </div>
      }
      expandedHeadToolbar={
        <div class="card-head-tree-toolbar" role="toolbar" aria-label="Prompt">
          <TimelineSpeechButton
            text={speechText()}
            class="card-head__control card-head-tree-toolbar-btn card-head-speech-btn--manual"
            label="prompt"
          />
        </div>
      }
      collapsedHeadSummary={
        <span class="tag mode-tag card-head__control">prompt</span>
      }
      onDismiss={() => props.onDeleteTimelineItem(props.item.id)}
    >
      <Show when={props.item.web} fallback={<pre>{props.item.text ?? ''}</pre>}>
        <div class="web-result">
          <WebNodeShadowRoot
            root={props.item.web!}
            promptRequestId={props.item.requestId}
            busy={props.isWebUiBusy(props.item.id)}
            onRunAction={(action, params) =>
              props.onRunWebAction(action, {
                ...params,
                webCommandSourceId: props.item.id,
              })
            }
            onError={(message) => props.onAppendSystem(message)}
          />
        </div>
      </Show>
    </TimelineCollapsibleCard>
  );
}
