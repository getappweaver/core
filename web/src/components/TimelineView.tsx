import { For, Index, Match, Show, Switch } from 'solid-js';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import type { TimelineItem } from '../types';
import {
  isChatItem,
  isCommandFormItem,
  isCommandResultItem,
  isPromptItem,
  isSystemItem,
} from '../types';
import { ChatMarkdown } from './ChatMarkdown';
import { WebNodeShadowRoot } from './WebNodeShadowRoot';
import { formatFieldLabel, formatWebFormOptionHint } from '../utils';

type TimelineViewProps = {
  timeline: TimelineItem[];
  setTimelineRef: (el: HTMLDivElement) => void;
  onOpenCommand: (command: string) => void;
  onRepeatSubcommand: (
    item: Extract<TimelineItem, { type: 'command_result' | 'command_form' }>,
  ) => void;
  onDeleteTimelineItem: (itemId: string) => void;
  onReplaceCommandWeb: (itemId: string, web: WebNodeRoot) => void;
  onAppendSystem: (text: string) => void;
  onRunWebAction: (
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
    },
  ) => void;
  onUpdateFormValue: (
    itemId: string,
    source: 'arguments' | 'options',
    name: string,
    value: unknown,
  ) => void;
  onSubmitForm: (itemId: string) => void;
};

export function TimelineView(props: TimelineViewProps) {
  return (
    <div class="timeline panel" ref={(el) => props.setTimelineRef(el)}>
      <For each={props.timeline}>
        {(item) => (
          <Switch>
            <Match when={isSystemItem(item)}>
              <div class="card system-card">
                {(item as Extract<TimelineItem, { type: 'system' }>).text}
              </div>
            </Match>

            <Match when={isChatItem(item)}>
              <div
                class={`card chat-card ${(item as Extract<TimelineItem, { type: 'chat' }>).role === 'user' ? 'user' : 'assistant'}`}
              >
                <ChatMarkdown
                  text={(item as Extract<TimelineItem, { type: 'chat' }>).text}
                  role={(item as Extract<TimelineItem, { type: 'chat' }>).role}
                />
              </div>
            </Match>

            <Match when={isPromptItem(item)}>
              <div class="card result-card prompt-card">
                <div class="card-head">
                  <span class="tag">prompt</span>
                </div>
                <Show
                  when={(item as Extract<TimelineItem, { type: 'prompt' }>).web}
                  fallback={
                    <pre>
                      {(item as Extract<TimelineItem, { type: 'prompt' }>)
                        .text ?? ''}
                    </pre>
                  }
                >
                  <div class="web-result">
                    <WebNodeShadowRoot
                      root={
                        (item as Extract<TimelineItem, { type: 'prompt' }>).web!
                      }
                      promptRequestId={
                        (item as Extract<TimelineItem, { type: 'prompt' }>)
                          .requestId
                      }
                      onRunAction={props.onRunWebAction}
                      onError={(message) => props.onAppendSystem(message)}
                    />
                  </div>
                </Show>
              </div>
            </Match>

            <Match when={isCommandResultItem(item)}>
              <div class="card result-card">
                <div class="card-head">
                  <button
                    type="button"
                    class="tag tag-button"
                    onClick={() =>
                      props.onOpenCommand(
                        (
                          item as Extract<
                            TimelineItem,
                            { type: 'command_result' }
                          >
                        ).command,
                      )
                    }
                  >
                    /
                    {
                      (
                        item as Extract<
                          TimelineItem,
                          { type: 'command_result' }
                        >
                      ).command
                    }
                  </button>
                  <button
                    type="button"
                    class="tag tag-button"
                    onClick={() =>
                      props.onRepeatSubcommand(
                        item as Extract<
                          TimelineItem,
                          { type: 'command_result' }
                        >,
                      )
                    }
                  >
                    {
                      (
                        item as Extract<
                          TimelineItem,
                          { type: 'command_result' }
                        >
                      ).subcommandTag
                    }
                  </button>
                  <button
                    type="button"
                    class="tag tag-button"
                    onClick={() => props.onDeleteTimelineItem(item.id)}
                  >
                    [x]
                  </button>
                </div>
                <Show
                  when={
                    (item as Extract<TimelineItem, { type: 'command_result' }>)
                      .web
                  }
                  fallback={
                    <pre>
                      {(
                        item as Extract<
                          TimelineItem,
                          { type: 'command_result' }
                        >
                      ).text ?? ''}
                    </pre>
                  }
                >
                  <div class="web-result">
                    <WebNodeShadowRoot
                      root={
                        (
                          item as Extract<
                            TimelineItem,
                            { type: 'command_result' }
                          >
                        ).web!
                      }
                      onReplaceRoot={(root) =>
                        props.onReplaceCommandWeb(item.id, root)
                      }
                      onRunAction={props.onRunWebAction}
                      onError={(message) => props.onAppendSystem(message)}
                    />
                  </div>
                </Show>
              </div>
            </Match>

            <Match when={isCommandFormItem(item)}>
              <div class="card form-card" data-form-id={item.id}>
                <div class="card-head">
                  <button
                    type="button"
                    class="tag tag-button"
                    onClick={() =>
                      props.onOpenCommand(
                        (
                          item as Extract<
                            TimelineItem,
                            { type: 'command_form' }
                          >
                        ).command,
                      )
                    }
                  >
                    /
                    {
                      (item as Extract<TimelineItem, { type: 'command_form' }>)
                        .command
                    }
                  </button>
                  <button
                    type="button"
                    class="tag tag-button"
                    onClick={() =>
                      props.onRepeatSubcommand(
                        item as Extract<TimelineItem, { type: 'command_form' }>,
                      )
                    }
                  >
                    {
                      (item as Extract<TimelineItem, { type: 'command_form' }>)
                        .subcommand.name
                    }
                  </button>
                  <Show
                    when={
                      (item as Extract<TimelineItem, { type: 'command_form' }>)
                        .subcommand.inferredWeb?.executionMode
                    }
                  >
                    <span class="tag mode-tag">
                      {
                        (
                          item as Extract<
                            TimelineItem,
                            { type: 'command_form' }
                          >
                        ).subcommand.inferredWeb?.executionMode
                      }
                    </span>
                  </Show>
                  <button
                    type="button"
                    class="tag tag-button"
                    onClick={() => props.onDeleteTimelineItem(item.id)}
                  >
                    [x]
                  </button>
                </div>

                <div class="form-summary">
                  {
                    (item as Extract<TimelineItem, { type: 'command_form' }>)
                      .subcommand.summary
                  }
                </div>
                <code class="usage-line">
                  /
                  {
                    (item as Extract<TimelineItem, { type: 'command_form' }>)
                      .command
                  }{' '}
                  {
                    (item as Extract<TimelineItem, { type: 'command_form' }>)
                      .subcommand.usage
                  }
                </code>

                <div class="field-list">
                  <Index
                    each={
                      (item as Extract<TimelineItem, { type: 'command_form' }>)
                        .subcommand.arguments
                    }
                  >
                    {(field) => (
                      <label class="field-row">
                        <span>{field().name}</span>
                        <input
                          type={field().kind === 'integer' ? 'number' : 'text'}
                          value={String(
                            (
                              item as Extract<
                                TimelineItem,
                                { type: 'command_form' }
                              >
                            ).values.arguments[field().name] ?? '',
                          )}
                          onInput={(event) =>
                            props.onUpdateFormValue(
                              item.id,
                              'arguments',
                              field().name,
                              field().kind === 'integer'
                                ? Number.parseInt(event.currentTarget.value, 10)
                                : event.currentTarget.value,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              props.onSubmitForm(item.id);
                            }
                          }}
                        />
                        <small>{field().summary}</small>
                      </label>
                    )}
                  </Index>

                  <Index
                    each={
                      (item as Extract<TimelineItem, { type: 'command_form' }>)
                        .subcommand.options
                    }
                  >
                    {(field) => (
                      <label class="field-row">
                        <span>{formatFieldLabel(field())}</span>
                        <Show
                          when={field().kind === 'boolean'}
                          fallback={
                            <Show
                              when={
                                field().kind === 'string' &&
                                (field().choices?.length ?? 0) > 0
                              }
                              fallback={
                                <input
                                  type={
                                    field().kind === 'integer'
                                      ? 'number'
                                      : 'text'
                                  }
                                  value={String(
                                    (
                                      item as Extract<
                                        TimelineItem,
                                        { type: 'command_form' }
                                      >
                                    ).values.options[field().name] ?? '',
                                  )}
                                  onInput={(event) =>
                                    props.onUpdateFormValue(
                                      item.id,
                                      'options',
                                      field().name,
                                      field().kind === 'integer'
                                        ? Number.parseInt(
                                            event.currentTarget.value,
                                            10,
                                          )
                                        : event.currentTarget.value,
                                    )
                                  }
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === 'Enter' &&
                                      !event.shiftKey
                                    ) {
                                      event.preventDefault();
                                      props.onSubmitForm(item.id);
                                    }
                                  }}
                                />
                              }
                            >
                              <select
                                value={String(
                                  (
                                    item as Extract<
                                      TimelineItem,
                                      { type: 'command_form' }
                                    >
                                  ).values.options[field().name] ??
                                    field().webDefaultValue ??
                                    '',
                                )}
                                onChange={(event) =>
                                  props.onUpdateFormValue(
                                    item.id,
                                    'options',
                                    field().name,
                                    event.currentTarget.value,
                                  )
                                }
                              >
                                <option value="">
                                  {field().webDefaultValue !== undefined
                                    ? `Use default (${String(field().webDefaultValue)})`
                                    : 'No filter'}
                                </option>
                                <For each={field().choices ?? []}>
                                  {(opt) => <option value={opt}>{opt}</option>}
                                </For>
                              </select>
                            </Show>
                          }
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(
                              (
                                item as Extract<
                                  TimelineItem,
                                  { type: 'command_form' }
                                >
                              ).values.options[field().name],
                            )}
                            onChange={(event) =>
                              props.onUpdateFormValue(
                                item.id,
                                'options',
                                field().name,
                                event.currentTarget.checked,
                              )
                            }
                          />
                        </Show>
                        {(() => {
                          const formItem = item as Extract<
                            TimelineItem,
                            { type: 'command_form' }
                          >;
                          const raw = formItem.optionHints?.[field().name];

                          if (raw == null) {
                            return null;
                          }

                          const line = formatWebFormOptionHint({
                            field: field(),
                            currentValue: formItem.values.options[field().name],
                            hint: raw,
                          });

                          return (
                            <small class="field-option-hint muted">
                              {line}
                            </small>
                          );
                        })()}
                        <small>{field().summary}</small>
                      </label>
                    )}
                  </Index>
                </div>

                <div class="actions-row">
                  <button
                    type="button"
                    onClick={() => props.onSubmitForm(item.id)}
                  >
                    Run
                  </button>
                </div>
              </div>
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
}
