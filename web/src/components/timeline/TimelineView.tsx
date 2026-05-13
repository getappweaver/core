import { For, Match, Show, Switch, createSignal } from 'solid-js';

import type { TimelineFileDiff } from '@src/timeline/types';

import { CommandFormCard } from '../../commands/CommandFormCard';
import type { TimelineItem } from '../../types';
import {
  isChatItem,
  isCommandFormItem,
  isCommandResultItem,
  isDiffItem,
  isDiffSummaryItem,
  isAgentSummaryItem,
  isPromptItem,
  isReasoningItem,
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

            <Match when={isReasoningItem(item)}>
              <TimelineReasoningCard
                text={
                  (item as Extract<TimelineItem, { type: 'reasoning' }>).text
                }
              />
            </Match>

            <Match when={isAgentSummaryItem(item)}>
              <TimelineAgentSummaryCard
                text={
                  (item as Extract<TimelineItem, { type: 'agent_summary' }>)
                    .text
                }
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
                item={item as Extract<TimelineItem, { type: 'tool' }>}
                onDeleteTimelineItem={props.onDeleteTimelineItem}
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

type TimelineReasoningCardProps = {
  text: string;
};

function TimelineReasoningCard(props: TimelineReasoningCardProps) {
  return (
    <div class="card agent-muted-card reasoning-card">
      <i>Thinking:</i> {props.text}
    </div>
  );
}

type TimelineAgentSummaryCardProps = {
  text: string;
};

function TimelineAgentSummaryCard(props: TimelineAgentSummaryCardProps) {
  return <div class="card agent-muted-card">{props.text}</div>;
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

  const [copied, setCopied] = createSignal(false);

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

  const copyText = () =>
    props.role === 'assistant' && parts().thinking !== null
      ? parts().output.trim()
      : props.text.trim();

  const speechHighlightActive = () =>
    props.role === 'assistant' && speechState().active;

  const scrollCardToTop = () => {
    cardEl?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const copyReply = async () => {
    const text = copyText();

    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
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
          <button
            type="button"
            class={`tag tag-button card-head__control card-head-tree-toolbar-btn card-head-chrome-btn chat-copy-btn${copied() ? ' chat-copy-btn--show-text' : ''}`}
            title={copied() ? 'Copied reply' : 'Copy reply'}
            aria-label={copied() ? 'Copied reply' : 'Copy reply'}
            onClick={copyReply}
          >
            <svg
              class="chat-copy-btn__icon"
              fill="currentColor"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M14 12V2H4V0h12v12h-2zM0 4h12v12H0V4zm2 2v8h8V6H2z"
                fill-rule="evenodd"
              />
            </svg>
            {copied() && <span>copied</span>}
          </button>
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
  if (
    line.startsWith('+++') ||
    line.startsWith('---') ||
    line.startsWith('diff --git ') ||
    line.startsWith('index ') ||
    line.startsWith('⋮')
  ) {
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

type RenderedDiffLine = {
  text: string;
  className: string;
  oldLine: number | null;
  newLine: number | null;
};

function parseDiffHunkStart(
  line: string,
): { oldLine: number; newLine: number } | null {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

  if (!match) {
    return null;
  }

  return {
    oldLine: Number(match[1]),
    newLine: Number(match[2]),
  };
}

function parseDiffElision(
  line: string,
): { oldLine: number; newLine: number } | null {
  const match = /^⋮ @@ -(\d+) \+(\d+) @@$/.exec(line);

  if (!match) {
    return null;
  }

  return {
    oldLine: Number(match[1]),
    newLine: Number(match[2]),
  };
}

function renderDiffPatchLines(patch: string): RenderedDiffLine[] {
  const rendered: RenderedDiffLine[] = [];
  let oldLine: number | null = null;
  let newLine: number | null = null;

  for (const line of patch.split('\n')) {
    const hunkStart = parseDiffHunkStart(line);

    if (hunkStart) {
      oldLine = hunkStart.oldLine;
      newLine = hunkStart.newLine;

      rendered.push({
        text: line,
        className: diffLineClass(line),
        oldLine: null,
        newLine: null,
      });

      continue;
    }

    const elision = parseDiffElision(line);

    if (elision) {
      oldLine = elision.oldLine;
      newLine = elision.newLine;

      rendered.push({
        text: '⋮',
        className: diffLineClass(line),
        oldLine: null,
        newLine: null,
      });

      continue;
    }

    if (
      oldLine === null ||
      newLine === null ||
      line.startsWith('diff --git ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++')
    ) {
      rendered.push({
        text: line,
        className: diffLineClass(line),
        oldLine: null,
        newLine: null,
      });

      continue;
    }

    if (line.startsWith('+')) {
      rendered.push({
        text: line,
        className: diffLineClass(line),
        oldLine: null,
        newLine,
      });

      newLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      rendered.push({
        text: line,
        className: diffLineClass(line),
        oldLine,
        newLine: null,
      });

      oldLine += 1;
      continue;
    }

    rendered.push({
      text: line,
      className: diffLineClass(line),
      oldLine,
      newLine,
    });

    oldLine += 1;
    newLine += 1;
  }

  return rendered;
}

export function TimelineDiffCard(props: TimelineDiffCardProps) {
  let cardEl: HTMLDivElement | undefined;

  const additions = () =>
    props.item.files.reduce((sum, file) => sum + file.additions, 0);

  const deletions = () =>
    props.item.files.reduce((sum, file) => sum + file.deletions, 0);

  const [openFiles, setOpenFiles] = createSignal(new Set<number>());

  const label = () => {
    switch (props.item.meta?.origin) {
      case 'agent_patch':
        return 'diff';
      case 'git_commit':
        return 'commit diff';
      case 'workspace_diff':
      case null:
      case undefined:
        return 'diff';
    }
  };

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
      <span class="tag mode-tag">{label()}</span>
      <Show when={props.item.meta}>
        {(meta) => (
          <>
            <Show when={meta().title}>
              {(title) => <span class="diff-card__summary">{title()}</span>}
            </Show>
            <Show when={meta().subtitle}>
              {(subtitle) => (
                <span class="diff-card__summary">{subtitle()}</span>
              )}
            </Show>
          </>
        )}
      </Show>
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
                <For each={renderDiffPatchLines(file.patch)}>
                  {(line) => (
                    <span class={line.className}>
                      <span class="diff-line__number">
                        {line.oldLine ?? ''}
                      </span>
                      <span class="diff-line__number">
                        {line.newLine ?? ''}
                      </span>
                      <span class="diff-line__text">{line.text || ' '}</span>
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
  item: Extract<TimelineItem, { type: 'tool' }>;
  onDeleteTimelineItem: TimelineViewProps['onDeleteTimelineItem'];
};

type TimelineTool = TimelineToolCardProps['item']['tool'];

function toolStatusLabel(status: TimelineTool['status']): string {
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

function getToolInputValue(tool: TimelineTool, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringifyToolValue(tool.input[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function toolDisplayName(tool: TimelineTool): string {
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

function compactToolSummary(tool: TimelineTool): string {
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

function compactToolArrow(tool: TimelineTool): string {
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

function isApplyPatchTool(tool: TimelineTool): boolean {
  return tool.tool === 'apply_patch' || tool.tool.endsWith('.apply_patch');
}

function applyPatchStatus(header: string): TimelineFileDiff['status'] {
  if (header === 'Add') {
    return 'added';
  }

  if (header === 'Delete') {
    return 'deleted';
  }

  return 'modified';
}

function countPatchAdditions(lines: string[]): number {
  return lines.filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .length;
}

function countPatchDeletions(lines: string[]): number {
  return lines.filter((line) => line.startsWith('-') && !line.startsWith('---'))
    .length;
}

function getApplyPatchText(tool: TimelineTool): string | null {
  return getToolInputValue(tool, ['patchText', 'patch', 'diff']);
}

function parseApplyPatchFiles(tool: TimelineTool): TimelineFileDiff[] {
  const patchText = getApplyPatchText(tool);

  if (!patchText) {
    return [];
  }

  const files: TimelineFileDiff[] = [];
  let current: {
    file: string;
    status: TimelineFileDiff['status'];
    lines: string[];
  } | null = null;

  function flushCurrent(): void {
    if (!current) {
      return;
    }

    files.push({
      file: current.file,
      patch: current.lines.join('\n'),
      additions: countPatchAdditions(current.lines),
      deletions: countPatchDeletions(current.lines),
      status: current.status,
    });
  }

  for (const line of patchText.split('\n')) {
    const fileHeader = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);

    if (fileHeader) {
      flushCurrent();

      current = {
        file: fileHeader[2] ?? '',
        status: applyPatchStatus(fileHeader[1] ?? 'Update'),
        lines: [],
      };

      continue;
    }

    if (
      line === '*** Begin Patch' ||
      line === '*** End Patch' ||
      line.startsWith('*** Move to:')
    ) {
      continue;
    }

    current?.lines.push(line);
  }

  flushCurrent();

  return files.filter((file) => file.file.length > 0);
}

function TimelinePreparingPatchToolCard(props: { tool: TimelineTool }) {
  return (
    <div class={`card tool-card tool-card--${props.tool.status}`}>
      <div class="tool-card__line" title={toolStatusLabel(props.tool.status)}>
        <span class="tool-card__arrow">~</span>
        <span>Preparing patch...</span>
      </div>
    </div>
  );
}

export function TimelineToolCard(props: TimelineToolCardProps) {
  const tool = () => props.item.tool;

  if (isApplyPatchTool(tool()) && tool().status !== 'completed') {
    return <TimelinePreparingPatchToolCard tool={tool()} />;
  }

  const patchFiles = () =>
    isApplyPatchTool(tool()) && tool().status === 'completed'
      ? parseApplyPatchFiles(tool())
      : [];

  if (patchFiles().length > 0) {
    return (
      <>
        <For each={patchFiles()}>
          {(file, index) => (
            <TimelineDiffCard
              item={{
                id: `${props.item.id}-patch-${index()}`,
                createdAt: props.item.createdAt,
                source: props.item.source,
                type: 'diff',
                files: [file],
                meta: {
                  title: 'Patch',
                  subtitle: null,
                  origin: 'agent_patch',
                },
              }}
              onDeleteTimelineItem={props.onDeleteTimelineItem}
            />
          )}
        </For>
      </>
    );
  }

  return (
    <div class={`card tool-card tool-card--${tool().status}`}>
      <div class="tool-card__line" title={toolStatusLabel(tool().status)}>
        <span class="tool-card__arrow">{compactToolArrow(tool())}</span>
        <span>{compactToolSummary(tool())}</span>
      </div>
    </div>
  );
}
