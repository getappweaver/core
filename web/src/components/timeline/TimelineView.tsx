import { For, Match, Show, Switch, createSignal } from 'solid-js';

import { CommandFormCard } from '../../commands/CommandFormCard';
import type { TimelineItem } from '../../types';
import {
  isChatItem,
  isCommandFormItem,
  isCommandResultItem,
  isDiffItem,
  isDiffSummaryItem,
  isPromptItem,
  isSystemItem,
  isToolItem,
} from '../../types';

import { ChatMarkdown } from '../ChatMarkdown';

import { TimelineCollapsibleCard } from './TimelineCollapsibleCard';
import { TimelineCommandResultCard } from './TimelineCommandResultCard';
import { TimelinePromptCard } from './TimelinePromptCard';
import { TimelineSpeechButton } from './TimelineSpeechButton';
import type { TimelineViewProps } from './types';

export function TimelineView(props: TimelineViewProps) {
  return (
    <div
      class="timeline panel"
      classList={{ 'timeline--bottom-fade': props.showBottomFade }}
      ref={(el) => props.setTimelineRef(el)}
    >
      <For each={props.timeline}>
        {(item) => (
          <Switch>
            <Match when={isSystemItem(item)}>
              <TimelineSystemCard
                text={(item as Extract<TimelineItem, { type: 'system' }>).text}
              />
            </Match>

            <Match when={isChatItem(item)}>
              <TimelineChatCard
                id={(item as Extract<TimelineItem, { type: 'chat' }>).id}
                role={(item as Extract<TimelineItem, { type: 'chat' }>).role}
                text={(item as Extract<TimelineItem, { type: 'chat' }>).text}
                onDeleteTimelineItem={props.onDeleteTimelineItem}
              />
            </Match>

            <Match when={isDiffItem(item)}>
              <TimelineDiffCard
                item={item as Extract<TimelineItem, { type: 'diff' }>}
                onDeleteTimelineItem={props.onDeleteTimelineItem}
              />
            </Match>

            <Match when={isDiffSummaryItem(item)}>
              <TimelineDiffSummaryRow
                summary={
                  (item as Extract<TimelineItem, { type: 'diff_summary' }>)
                    .summary
                }
              />
            </Match>

            <Match when={isToolItem(item)}>
              <TimelineToolCard
                tool={(item as Extract<TimelineItem, { type: 'tool' }>).tool}
              />
            </Match>

            <Match when={isPromptItem(item)}>
              <TimelinePromptCard
                item={item as Extract<TimelineItem, { type: 'prompt' }>}
                isWebUiBusy={props.isWebUiBusy}
                onDeleteTimelineItem={props.onDeleteTimelineItem}
                onRunWebAction={props.onRunWebAction}
                onAppendSystem={props.onAppendSystem}
                currentUserPubkey={props.currentUserPubkey}
              />
            </Match>

            <Match when={isCommandResultItem(item)}>
              <div
                classList={{
                  'timeline-item-visually-hidden':
                    props.isTimelineItemHidden?.(
                      item as Extract<TimelineItem, { type: 'command_result' }>,
                    ) === true,
                }}
              >
                <TimelineCommandResultCard
                  item={
                    item as Extract<TimelineItem, { type: 'command_result' }>
                  }
                  onOpenCommand={props.onOpenCommand}
                  onRepeatSubcommand={props.onRepeatSubcommand}
                  onDeleteTimelineItem={props.onDeleteTimelineItem}
                  onReplaceCommandWeb={props.onReplaceCommandWeb}
                  isWebUiBusy={props.isWebUiBusy}
                  onRunWebAction={props.onRunWebAction}
                  onRunJsonCommand={props.onRunJsonCommand}
                  onAppendSystem={props.onAppendSystem}
                  currentUserPubkey={props.currentUserPubkey}
                />
              </div>
            </Match>

            <Match when={isCommandFormItem(item)}>
              <CommandFormCard
                active={props.activeFormId === item.id}
                formItem={
                  item as Extract<TimelineItem, { type: 'command_form' }>
                }
                onOpenCommand={props.onOpenCommand}
                onRepeatSubcommand={props.onRepeatSubcommand}
                onDeleteTimelineItem={props.onDeleteTimelineItem}
                onUpdateFormValue={props.onUpdateFormValue}
                onSubmitForm={props.onSubmitForm}
              />
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
}

type TimelineSystemCardProps = {
  text: string;
};

export function TimelineSystemCard(props: TimelineSystemCardProps) {
  return <div class="card system-card">{props.text}</div>;
}

type TimelineChatCardProps = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  onDeleteTimelineItem: TimelineViewProps['onDeleteTimelineItem'];
};

type SpeechSentenceState = {
  active: boolean;
  sentenceIndex: number | null;
  sentences: string[];
};

function splitThinkingBlock(text: string): {
  thinking: string | null;
  output: string;
} {
  const prefix = '**Thinking:**\n';

  if (!text.startsWith(prefix)) {
    return { thinking: null, output: text };
  }

  const rest = text.slice(prefix.length);
  const separator = rest.indexOf('\n\n');

  if (separator < 0) {
    return { thinking: rest, output: '' };
  }

  return {
    thinking: rest.slice(0, separator),
    output: rest.slice(separator + 2),
  };
}

export function TimelineChatCard(props: TimelineChatCardProps) {
  let cardEl: HTMLDivElement | undefined;

  const [speechState, setSpeechState] = createSignal<SpeechSentenceState>({
    active: false,
    sentenceIndex: null,
    sentences: [],
  });

  const [seekSentenceIndex, setSeekSentenceIndex] = createSignal<number | null>(
    null,
  );

  const parts = () => splitThinkingBlock(props.text);

  const speechText = () =>
    props.role === 'assistant' ? parts().output.trim() : '';

  const speechHighlightActive = () =>
    props.role === 'assistant' && speechState().active;

  const scrollCardToTop = () => {
    cardEl?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const body = () => (
    <div classList={{ 'chat-card-body': props.role === 'assistant' }}>
      {props.role === 'assistant' && parts().thinking !== null ? (
        <>
          <div class="chat-thinking">
            <strong>Thinking:</strong>
            <ChatMarkdown text={parts().thinking ?? ''} role={props.role} />
          </div>
          <ChatMarkdown
            text={parts().output}
            role={props.role}
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
          />
        </>
      ) : props.role === 'assistant' ? (
        <ChatMarkdown
          text={props.text}
          role={props.role}
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
        />
      ) : (
        <ChatMarkdown text={props.text} role={props.role} />
      )}
    </div>
  );

  if (props.role !== 'assistant') {
    return <div class="card chat-card user">{body()}</div>;
  }

  return (
    <TimelineCollapsibleCard
      class="card chat-card assistant"
      ref={(el) => {
        cardEl = el;
      }}
      expandedHeadClass="card-head--timeline-sticky"
      expandedTrailingButtonClass="card-head__control"
      expandedHead={
        <>
          <button
            type="button"
            class="card-head__scroll-ledge"
            tabIndex={-1}
            title="Scroll to top of this reply"
            aria-label="Scroll to top of this reply"
            onClick={scrollCardToTop}
          />
          <div class="card-head-leading">
            <span class="tag mode-tag card-head__control">assistant</span>
          </div>
        </>
      }
      expandedHeadToolbar={
        <div class="card-head-tree-toolbar" role="toolbar" aria-label="Reply">
          <TimelineSpeechButton
            text={speechText()}
            class="card-head__control card-head-tree-toolbar-btn card-head-speech-btn--manual"
            label="reply"
            seekSentenceIndex={seekSentenceIndex()}
            onSeekHandled={() => setSeekSentenceIndex(null)}
            onSentenceState={setSpeechState}
          />
        </div>
      }
      collapsedHeadSummary={
        <span class="tag mode-tag card-head__control">assistant</span>
      }
      onDismiss={() => props.onDeleteTimelineItem(props.id)}
    >
      {body()}
    </TimelineCollapsibleCard>
  );
}

type TimelineDiffCardProps = {
  item: Extract<TimelineItem, { type: 'diff' }>;
  onDeleteTimelineItem: TimelineViewProps['onDeleteTimelineItem'];
};

type TimelineDiffSummaryRowProps = {
  summary: Extract<TimelineItem, { type: 'diff_summary' }>['summary'];
};

function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'diff-line diff-line--meta';
  }

  if (line.startsWith('+')) {
    return 'diff-line diff-line--add';
  }

  if (line.startsWith('-')) {
    return 'diff-line diff-line--del';
  }

  if (line.startsWith('@@')) {
    return 'diff-line diff-line--hunk';
  }

  return 'diff-line';
}

export function TimelineDiffCard(props: TimelineDiffCardProps) {
  let cardEl: HTMLDivElement | undefined;

  const additions = () =>
    props.item.files.reduce((sum, file) => sum + file.additions, 0);

  const deletions = () =>
    props.item.files.reduce((sum, file) => sum + file.deletions, 0);

  const [openFiles, setOpenFiles] = createSignal(new Set<number>());

  function toggleFile(index: number): void {
    setOpenFiles((prev) => {
      const next = new Set(prev);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }

  const head = () => (
    <>
      <span class="tag mode-tag">diff</span>
      <span class="diff-card__summary">
        {props.item.files.length}{' '}
        {props.item.files.length === 1 ? 'file' : 'files'}
      </span>
      <span class="diff-card__stat diff-card__stat--add">+{additions()}</span>
      <span class="diff-card__stat diff-card__stat--del">-{deletions()}</span>
    </>
  );

  return (
    <TimelineCollapsibleCard
      class="card diff-card"
      ref={(el) => {
        cardEl = el;
      }}
      expandedHeadClass="card-head--timeline-sticky"
      expandedHead={
        <div class="card-head-leading diff-card__head">
          <button
            type="button"
            class="card-head__scroll-ledge"
            tabIndex={-1}
            title="Scroll to top"
            aria-label="Scroll to top"
            onClick={() =>
              cardEl?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            }
          />
          {head()}
        </div>
      }
      collapsedHeadSummary={head()}
      onDismiss={() => props.onDeleteTimelineItem(props.item.id)}
    >
      <For each={props.item.files}>
        {(file, index) => (
          <div class="diff-file">
            <button
              type="button"
              class="diff-file__summary"
              onClick={() => toggleFile(index())}
              aria-expanded={openFiles().has(index())}
            >
              <span class="diff-file__name">{file.file}</span>
              <span class="diff-file__meta">
                {file.status ?? 'modified'} · +{file.additions} -
                {file.deletions}
              </span>
            </button>
            <Show when={openFiles().has(index())}>
              <pre class="diff-file__patch">
                <For each={file.patch.split('\n')}>
                  {(line, lineIndex) => (
                    <span class={diffLineClass(line)}>
                      <span class="diff-line__number">{lineIndex() + 1}</span>
                      <span class="diff-line__text">{line || ' '}</span>
                    </span>
                  )}
                </For>
              </pre>
            </Show>
          </div>
        )}
      </For>
    </TimelineCollapsibleCard>
  );
}

function TimelineDiffSummaryRow(props: TimelineDiffSummaryRowProps) {
  return (
    <div class="timeline-info timeline-info--diff">
      <span class="tag mode-tag">diff</span>
      <span class="diff-card__summary">
        {props.summary.fileCount}{' '}
        {props.summary.fileCount === 1 ? 'file' : 'files'}
      </span>
      <span class="diff-card__stat diff-card__stat--add">
        +{props.summary.additions}
      </span>
      <span class="diff-card__stat diff-card__stat--del">
        -{props.summary.deletions}
      </span>
    </div>
  );
}

type TimelineToolCardProps = {
  tool: Extract<TimelineItem, { type: 'tool' }>['tool'];
};

function toolStatusLabel(
  status: TimelineToolCardProps['tool']['status'],
): string {
  switch (status) {
    case 'pending':
      return 'wants to use';
    case 'running':
      return 'using';
    case 'completed':
      return 'used';
    case 'error':
      return 'failed';
  }
}

function stringifyToolValue(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function getToolInputValue(
  tool: TimelineToolCardProps['tool'],
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = stringifyToolValue(tool.input[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function toolDisplayName(tool: TimelineToolCardProps['tool']): string {
  const raw = tool.tool.split('.').at(-1) ?? tool.tool;

  return raw.length > 0 ? raw[0].toUpperCase() + raw.slice(1) : tool.tool;
}

function shortenToolTarget(value: string): string {
  const workspaceMarker = '/dm-bot-main/';
  const markerIndex = value.indexOf(workspaceMarker);

  if (markerIndex >= 0) {
    return value.slice(markerIndex + workspaceMarker.length);
  }

  return value;
}

function compactToolSummary(tool: TimelineToolCardProps['tool']): string {
  const name = toolDisplayName(tool);

  const path = getToolInputValue(tool, [
    'filePath',
    'filepath',
    'path',
    'file',
  ]);

  const command = getToolInputValue(tool, ['command', 'cmd']);
  const pattern = getToolInputValue(tool, ['pattern', 'query']);
  const url = getToolInputValue(tool, ['url']);
  const extras: string[] = [];

  for (const key of ['offset', 'limit', 'timeout']) {
    const value = stringifyToolValue(tool.input[key]);

    if (value) {
      extras.push(`${key}=${value}`);
    }
  }

  const target = path ?? command ?? pattern ?? url ?? tool.title;
  const suffix = extras.length > 0 ? ` [${extras.join(', ')}]` : '';

  return target ? `${name} ${shortenToolTarget(target)}${suffix}` : name;
}

function compactToolArrow(tool: TimelineToolCardProps['tool']): string {
  if (tool.status === 'error') {
    return '×';
  }

  if (
    tool.status === 'completed' &&
    /patch|edit|write/i.test(`${tool.tool} ${tool.title ?? ''}`)
  ) {
    return '←';
  }

  return '→';
}

export function TimelineToolCard(props: TimelineToolCardProps) {
  return (
    <div class={`card tool-card tool-card--${props.tool.status}`}>
      <div class="tool-card__line" title={toolStatusLabel(props.tool.status)}>
        <span class="tool-card__arrow">{compactToolArrow(props.tool)}</span>
        <span>{compactToolSummary(props.tool)}</span>
      </div>
    </div>
  );
}
