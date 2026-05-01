import { createEffect, For, Show } from 'solid-js';

import { OpenCodeModelField } from '../components/OpenCodeModelField';
import { TimelineCollapsibleCard } from '../components/timeline/TimelineCollapsibleCard';
import type { TimelineViewProps } from '../components/timeline/types';
import { WebButton } from '../components/WebButton';
import type { CommandField, TimelineItem } from '../types';
import { formatFieldLabel, formatWebFormOptionHint } from '../utils';

type CommandFormCardProps = {
  active: boolean;
  formItem: Extract<TimelineItem, { type: 'command_form' }>;
  onOpenCommand: TimelineViewProps['onOpenCommand'];
  onRepeatSubcommand: TimelineViewProps['onRepeatSubcommand'];
  onDeleteTimelineItem: TimelineViewProps['onDeleteTimelineItem'];
  onUpdateFormValue: TimelineViewProps['onUpdateFormValue'];
  onSubmitForm: TimelineViewProps['onSubmitForm'];
};

function OptionHintLine(props: {
  formItem: Extract<TimelineItem, { type: 'command_form' }>;
  field: CommandField;
}) {
  const raw = props.formItem.optionHints?.[props.field.name];

  if (raw == null) {
    return null;
  }

  const line = formatWebFormOptionHint({
    field: props.field,
    currentValue: props.formItem.values.options[props.field.name],
    hint: raw,
  });

  return <small class="field-option-hint muted">{line}</small>;
}

export function CommandFormCard(props: CommandFormCardProps) {
  const optionArgFields = props.formItem.subcommand.options.filter(
    (o) => o.kind !== 'boolean',
  );

  const optionFlagFields = props.formItem.subcommand.options.filter(
    (o) => o.kind === 'boolean',
  );

  let rootEl: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.active) {
      return;
    }

    queueMicrotask(() => {
      const firstInput = rootEl?.querySelector<HTMLElement>(
        '.field-list input:not([type="checkbox"]):not([type="hidden"]), .field-list textarea, .field-list select',
      );

      firstInput?.focus();
    });
  });

  const formHeadTags = () => (
    <>
      <WebButton
        type="button"
        class="tag tag-button"
        onClick={() => props.onOpenCommand(props.formItem.command)}
      >
        /{props.formItem.command}
      </WebButton>
      <WebButton
        type="button"
        class="tag tag-button"
        onClick={() => props.onRepeatSubcommand(props.formItem)}
      >
        {props.formItem.subcommand.name}
      </WebButton>
      <Show when={props.formItem.subcommand.inferredWeb?.executionMode}>
        <span class="tag mode-tag">
          {props.formItem.subcommand.inferredWeb?.executionMode}
        </span>
      </Show>
    </>
  );

  return (
    <TimelineCollapsibleCard
      class="card form-card"
      dataFormId={props.formItem.id}
      ref={(el) => {
        rootEl = el;
      }}
      expandedHead={formHeadTags()}
      collapsedHeadSummary={formHeadTags()}
      onDismiss={() => props.onDeleteTimelineItem(props.formItem.id)}
    >
      <div class="form-summary">{props.formItem.subcommand.summary}</div>
      <code class="usage-line">
        /{props.formItem.command} {props.formItem.subcommand.usage}
      </code>

      <div class="field-list">
        <Show when={props.formItem.subcommand.arguments.length > 0}>
          <div class="form-field-section">
            <div class="form-field-section-title">Required</div>
            <For each={props.formItem.subcommand.arguments}>
              {(field, argIndex) => (
                <label
                  class={`field-block field-block--arg field-block--stripe-${argIndex() % 2 === 0 ? 'a' : 'b'}`}
                >
                  <span class="field-label">{field.name}</span>
                  <Show
                    when={
                      field.kind === 'string' &&
                      (props.formItem.argumentChoices?.[field.name]?.length ??
                        0) > 0
                    }
                    fallback={
                      <input
                        type={field.kind === 'integer' ? 'number' : 'text'}
                        value={String(
                          props.formItem.values.arguments[field.name] ?? '',
                        )}
                        onInput={(event) =>
                          props.onUpdateFormValue(
                            props.formItem.id,
                            'arguments',
                            field.name,
                            field.kind === 'integer'
                              ? Number.parseInt(event.currentTarget.value, 10)
                              : event.currentTarget.value,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            props.onSubmitForm(props.formItem.id);
                          }
                        }}
                      />
                    }
                  >
                    <OpenCodeModelField
                      fieldId={`${props.formItem.id}-${field.name}`}
                      value={String(
                        props.formItem.values.arguments[field.name] ?? '',
                      )}
                      choices={
                        props.formItem.argumentChoices?.[field.name] ?? []
                      }
                      onChange={(v) =>
                        props.onUpdateFormValue(
                          props.formItem.id,
                          'arguments',
                          field.name,
                          v,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          props.onSubmitForm(props.formItem.id);
                        }
                      }}
                    />
                  </Show>
                  <small class="field-summary">{field.summary}</small>
                </label>
              )}
            </For>
          </div>
        </Show>

        <Show when={optionArgFields.length > 0}>
          <div class="form-field-section">
            <div class="form-field-section-title">Arguments</div>
            <For each={optionArgFields}>
              {(field, optIndex) => (
                <label
                  class={`field-block field-block--opt field-block--stripe-${optIndex() % 2 === 0 ? 'a' : 'b'}`}
                >
                  <div class="field-block-innards">
                    <div class="field-flag-line field-flag-line--text-opt">
                      <span class="field-label">{formatFieldLabel(field)}</span>
                      <Show when={field.summary.trim().length > 0}>
                        <span class="field-inline-hint muted">
                          {field.summary}
                        </span>
                      </Show>
                    </div>
                    <Show
                      when={
                        field.kind === 'string' &&
                        (field.choices?.length ?? 0) > 0
                      }
                      fallback={
                        <input
                          type={field.kind === 'integer' ? 'number' : 'text'}
                          value={String(
                            props.formItem.values.options[field.name] ?? '',
                          )}
                          onInput={(event) =>
                            props.onUpdateFormValue(
                              props.formItem.id,
                              'options',
                              field.name,
                              field.kind === 'integer'
                                ? Number.parseInt(event.currentTarget.value, 10)
                                : event.currentTarget.value,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              props.onSubmitForm(props.formItem.id);
                            }
                          }}
                        />
                      }
                    >
                      <select
                        value={String(
                          props.formItem.values.options[field.name] ??
                            field.webDefaultValue ??
                            '',
                        )}
                        onChange={(event) =>
                          props.onUpdateFormValue(
                            props.formItem.id,
                            'options',
                            field.name,
                            event.currentTarget.value,
                          )
                        }
                      >
                        <option value="">
                          {field.webDefaultValue !== undefined
                            ? `Use default (${String(field.webDefaultValue)})`
                            : 'No filter'}
                        </option>
                        <For each={field.choices ?? []}>
                          {(opt) => <option value={opt}>{opt}</option>}
                        </For>
                      </select>
                    </Show>
                  </div>
                  <OptionHintLine formItem={props.formItem} field={field} />
                </label>
              )}
            </For>
          </div>
        </Show>

        <Show when={optionFlagFields.length > 0}>
          <div class="form-field-section">
            <div class="form-field-section-title">Flags</div>
            <For each={optionFlagFields}>
              {(field, optIndex) => (
                <label
                  class={`field-block field-block--opt field-block--stripe-${optIndex() % 2 === 0 ? 'a' : 'b'}`}
                >
                  <div class="field-flag-line">
                    <span class="field-label">{formatFieldLabel(field)}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(
                        props.formItem.values.options[field.name],
                      )}
                      onChange={(event) =>
                        props.onUpdateFormValue(
                          props.formItem.id,
                          'options',
                          field.name,
                          event.currentTarget.checked,
                        )
                      }
                    />
                  </div>
                  <OptionHintLine formItem={props.formItem} field={field} />
                  <small class="field-summary">{field.summary}</small>
                </label>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="actions-row actions-row--form-run">
        <WebButton
          type="button"
          class="web-button"
          onClick={() => props.onSubmitForm(props.formItem.id)}
        >
          Run
        </WebButton>
      </div>
    </TimelineCollapsibleCard>
  );
}
