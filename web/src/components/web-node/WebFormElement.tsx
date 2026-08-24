import type { JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  Show,
  useContext,
} from 'solid-js';

import type {
  WebAction,
  WebElementNode,
  WebNode,
  WebNodeRoot,
} from '@src/web/ui-schema';

import { isEmbeddedWebDemoMode } from '../../demo/runtime';
import { registerStoryDomTarget } from '../../story/dom-targets';
import { onStoryFillForm } from '../../story/events';

import { WebShadowUiBusyContext } from '../web-shadow-ui-busy-context';
import { WebButton } from '../WebButton';

import {
  TreeExpandRequestSetterContext,
  TreeItemExpandedStateContext,
} from './contexts';
import { elementClass, elementStyle, elementUi } from './element-helpers';
import { expandTreeItemsForAction } from './tree-state';

type WebRunAction = (
  action: WebAction,
  params?: {
    onReplaceRoot?: (root: WebNodeRoot) => void;
    promptRequestId?: string;
    uiExecutionPolicy?: {
      recordInTimeline?: boolean;
      suppressSystemMessage?: boolean;
    };
  },
) => void;

type WebFormElementProps = {
  element: WebElementNode;
  onRunAction: WebRunAction | undefined;
  onReplaceRoot: ((root: WebNodeRoot) => void) | undefined;
  onError: ((message: string) => void) | undefined;
  promptRequestId: string | undefined;
  renderChild: (child: WebNode) => JSX.Element;
};

export function WebFormElement(props: WebFormElementProps): JSX.Element {
  const expandedById = useContext(TreeItemExpandedStateContext);
  const requestTreeItemExpansion = useContext(TreeExpandRequestSetterContext);
  let formEl: HTMLFormElement | undefined;

  function updatePositiveIntegerSubmitButtons(): void {
    if (!formEl) {
      return;
    }

    const buttons = formEl.querySelectorAll<HTMLButtonElement>(
      'button[data-web-disable-until-positive-integer]',
    );

    for (const button of buttons) {
      const fieldName = button.getAttribute(
        'data-web-disable-until-positive-integer',
      );

      const field = fieldName
        ? formEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `[name="${CSS.escape(fieldName)}"]`,
          )
        : null;

      const value = Number.parseInt(field?.value ?? '', 10);

      button.disabled = Number.isNaN(value) || value <= 0;
    }
  }

  function updateChangedFieldSubmitButtons(): void {
    if (!formEl) {
      return;
    }

    const buttons = formEl.querySelectorAll<HTMLButtonElement>(
      'button[data-web-disable-until-field-changed]',
    );

    for (const button of buttons) {
      const fieldName = button.getAttribute(
        'data-web-disable-until-field-changed',
      );

      const field = fieldName
        ? formEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `[name="${CSS.escape(fieldName)}"]`,
          )
        : null;

      button.disabled = !field || field.value === field.defaultValue;
    }
  }

  createEffect(() => {
    if (isEmbeddedWebDemoMode()) {
      return;
    }

    if (props.element.props?.hiddenUntilRevealed !== true || !formEl) {
      return;
    }

    requestAnimationFrame(() => {
      formEl?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });
  });

  createEffect(() => {
    if (!formEl) {
      return;
    }

    updatePositiveIntegerSubmitButtons();
    updateChangedFieldSubmitButtons();

    const onInput = () => {
      updatePositiveIntegerSubmitButtons();
      updateChangedFieldSubmitButtons();
    };

    formEl.addEventListener('input', onInput);
    formEl.addEventListener('change', onInput);

    onCleanup(() => {
      formEl?.removeEventListener('input', onInput);
      formEl?.removeEventListener('change', onInput);
    });
  });

  const onSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault();
    const submitter = event.submitter;

    const submitterAction =
      submitter instanceof HTMLElement
        ? submitter.getAttribute('data-web-submit-action')
        : null;

    let action = props.element.props?.action;

    if (submitterAction) {
      try {
        const parsed = JSON.parse(submitterAction) as WebAction;

        action = parsed;
      } catch {
        props.onError?.('Form submit action is invalid.');

        return;
      }
    }

    if (action == null) {
      props.onError?.('Form has no action.');

      return;
    }

    const formEl = event.currentTarget;
    const fd = new FormData(formEl);

    if (action.type === 'prompt_answer') {
      if (action.valuesFromFields) {
        const values = action.valuesFromFields.map((fieldName, index) => {
          const customFieldName = action.customValuesFromFields?.[index];

          const customValue = customFieldName ? fd.get(customFieldName) : null;

          const customAnswer =
            typeof customValue === 'string' ? customValue.trim() : '';

          if (customAnswer.length > 0) {
            return [customAnswer];
          }

          return fd
            .getAll(fieldName)
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
        });

        props.onRunAction?.(
          {
            ...action,
            type: 'prompt_answer',
            value: JSON.stringify(values),
          },
          {
            onReplaceRoot: props.onReplaceRoot,
            promptRequestId: props.promptRequestId,
          },
        );

        return;
      }

      const fieldName = action.valueFromField;

      const fieldValue =
        typeof fieldName === 'string' ? fd.get(fieldName) : null;

      const suffix = typeof fieldValue === 'string' ? fieldValue.trim() : '';

      props.onRunAction?.(
        {
          ...action,
          type: 'prompt_answer',
          value:
            suffix.length > 0
              ? `${action.value} ${suffix}`.trim()
              : action.value,
        },
        {
          onReplaceRoot: props.onReplaceRoot,
          promptRequestId: props.promptRequestId,
        },
      );

      return;
    }

    if (action.type === 'clientAction') {
      const mergedPayload: Record<string, unknown> = {
        ...(action.payload ?? {}),
      };

      for (const [key, value] of fd.entries()) {
        if (typeof value !== 'string') {
          continue;
        }

        const existing = mergedPayload[key];

        if (existing === undefined) {
          mergedPayload[key] = value;
        } else if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          mergedPayload[key] = [existing, value];
        }
      }

      props.onRunAction?.(
        {
          ...action,
          payload: mergedPayload,
        },
        {
          onReplaceRoot: props.onReplaceRoot,
          promptRequestId: props.promptRequestId,
        },
      );

      return;
    }

    if (action.type !== 'command') {
      props.onError?.(
        'Form action must be a command, clientAction, or prompt_answer WebAction.',
      );

      return;
    }

    const mergedArgs: Record<string, unknown> = Object.fromEntries(
      Object.entries(action.arguments ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value] : value,
      ]),
    );

    const mergedOptions: Record<string, unknown> = Object.fromEntries(
      Object.entries(action.options ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value] : value,
      ]),
    );

    const optionFieldNames = new Set(
      props.element.props?.formOptionFieldNames ?? [],
    );

    for (const [key, value] of fd.entries()) {
      if (typeof value === 'string') {
        const target = optionFieldNames.has(key) ? mergedOptions : mergedArgs;
        const existing = target[key];

        if (existing === undefined || existing === '') {
          target[key] = value;
        } else if (Array.isArray(existing)) {
          target[key] = [...existing.filter((item) => item !== ''), value];
        } else {
          target[key] = [existing, value];
        }
      }
    }

    const merged: WebAction = {
      ...action,
      type: 'command',
      arguments: mergedArgs,
      options: mergedOptions,
    };

    expandTreeItemsForAction(merged, expandedById, requestTreeItemExpansion);

    props.onRunAction?.(merged, {
      onReplaceRoot: props.onReplaceRoot,
      promptRequestId: props.promptRequestId,
    });
  };

  return (
    <form
      ref={(el) => {
        formEl = el;
      }}
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
      onSubmit={onSubmit}
      novalidate
    >
      <For each={props.element.children ?? []}>
        {(child) => props.renderChild(child)}
      </For>
    </form>
  );
}

type WebTextFieldNodeProps = {
  element: WebElementNode;
};

export function WebTextFieldNode(props: WebTextFieldNodeProps): JSX.Element {
  const getBusy = useContext(WebShadowUiBusyContext);
  const name = () => props.element.props?.formFieldName;
  const listId = `web-text-field-${createUniqueId()}`;
  const choices = () => props.element.props?.choices ?? [];
  let inputEl: HTMLInputElement | undefined;

  createEffect(() => {
    const targetId = props.element.props?.storyTargetId;

    if (!targetId || !inputEl) {
      return;
    }

    registerStoryDomTarget(targetId, inputEl);
    onCleanup(() => registerStoryDomTarget(targetId, null));
  });

  createEffect(() => {
    const stop = onStoryFillForm((values) => {
      const fieldName = name();

      if (!inputEl || !fieldName) {
        return;
      }

      const value = values.arguments[fieldName] ?? values.options[fieldName];

      if (typeof value === 'string' || typeof value === 'number') {
        inputEl.value = String(value);
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    });

    onCleanup(stop);
  });

  createEffect(() => {
    if (isEmbeddedWebDemoMode()) {
      return;
    }

    if (props.element.props?.autoFocus !== true || inputEl == null) {
      return;
    }

    queueMicrotask(() => {
      inputEl?.focus({ preventScroll: true });
    });
  });

  return (
    <Show when={name()}>
      {(fieldName) => (
        <div
          class={elementClass(props.element)}
          data-ui={elementUi(props.element)}
          style={elementStyle(props.element)}
        >
          <input
            ref={(el) => {
              inputEl = el;
            }}
            class="web-textField__input"
            type="text"
            name={fieldName()}
            value={props.element.props?.value ?? ''}
            placeholder={props.element.props?.inputPlaceholder}
            list={choices().length > 0 ? listId : undefined}
            disabled={
              props.element.props?.disabled === true || getBusy() === true
            }
            autocomplete="off"
          />
          <Show when={choices().length > 0}>
            <datalist id={listId}>
              <For each={choices()}>
                {(choice) => (
                  <option value={choice}>
                    {props.element.props?.choiceLabels?.[choice] ?? choice}
                  </option>
                )}
              </For>
            </datalist>
          </Show>
        </div>
      )}
    </Show>
  );
}

export function resizeAutoGrowTextArea(
  el: HTMLTextAreaElement,
  maxRows: number,
): void {
  el.style.height = 'auto';

  const computed = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
  const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;

  const maxHeight =
    lineHeight * maxRows +
    borderTop +
    borderBottom +
    paddingTop +
    paddingBottom;

  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

export function WebTextAreaNode(props: WebTextFieldNodeProps): JSX.Element {
  const getBusy = useContext(WebShadowUiBusyContext);
  const name = () => props.element.props?.formFieldName;
  const maxRows = () => props.element.props?.maxRows ?? 4;
  let textareaEl: HTMLTextAreaElement | undefined;
  let manuallyResized = false;
  let stopResizeGesture: (() => void) | null = null;

  const resize = () => {
    if (!textareaEl || manuallyResized) {
      return;
    }

    resizeAutoGrowTextArea(textareaEl, maxRows());
  };

  const watchManualResize = (event: PointerEvent) => {
    if (!textareaEl || window.getComputedStyle(textareaEl).resize === 'none') {
      return;
    }

    const rect = textareaEl.getBoundingClientRect();
    const handleSize = 20;

    if (
      event.clientX < rect.right - handleSize ||
      event.clientY < rect.bottom - handleSize
    ) {
      return;
    }

    const initialHeight = rect.height;

    stopResizeGesture?.();

    const finish = () => {
      if (
        textareaEl &&
        Math.abs(textareaEl.getBoundingClientRect().height - initialHeight) > 1
      ) {
        manuallyResized = true;
      }

      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      stopResizeGesture = null;
    };

    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });

    stopResizeGesture = finish;
  };

  onCleanup(() => stopResizeGesture?.());

  createEffect(() => {
    const targetId = props.element.props?.storyTargetId;

    if (!targetId || !textareaEl) {
      return;
    }

    registerStoryDomTarget(targetId, textareaEl);
    onCleanup(() => registerStoryDomTarget(targetId, null));
  });

  createEffect(() => {
    const stop = onStoryFillForm((values) => {
      const fieldName = name();

      if (!textareaEl || !fieldName) {
        return;
      }

      const value = values.arguments[fieldName] ?? values.options[fieldName];

      if (typeof value === 'string' || typeof value === 'number') {
        textareaEl.value = String(value);
        textareaEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
        queueMicrotask(resize);
      }
    });

    onCleanup(stop);
  });

  createEffect(() => {
    const value = props.element.props?.value ?? '';

    if (!textareaEl || textareaEl.value === value) {
      return;
    }

    textareaEl.value = value;
    queueMicrotask(resize);
  });

  createEffect(() => {
    if (props.element.props?.autoFocus !== true || textareaEl == null) {
      return;
    }

    queueMicrotask(() => {
      textareaEl?.focus({ preventScroll: true });
      resize();
    });
  });

  const isReadOnlyTextArea = () => !name();

  return (
    <Show when={name() || props.element.props?.disabled === true}>
      <div
        class={elementClass(props.element)}
        data-ui={elementUi(props.element)}
        style={elementStyle(props.element)}
      >
        <textarea
          ref={(el) => {
            textareaEl = el;
            queueMicrotask(resize);
          }}
          class="web-textArea__input"
          name={name()}
          rows={1}
          value={props.element.props?.value ?? ''}
          placeholder={props.element.props?.inputPlaceholder}
          disabled={
            props.element.props?.disabled === true || getBusy() === true
          }
          readOnly={isReadOnlyTextArea()}
          autocomplete="off"
          onPointerDown={watchManualResize}
          onInput={resize}
        />
      </div>
    </Show>
  );
}

export function WebSelectNode(props: WebTextFieldNodeProps): JSX.Element {
  const getBusy = useContext(WebShadowUiBusyContext);
  const name = () => props.element.props?.formFieldName;
  let selectEl: HTMLSelectElement | undefined;

  createEffect(() => {
    const targetId = props.element.props?.storyTargetId;

    if (!targetId || !selectEl) {
      return;
    }

    registerStoryDomTarget(targetId, selectEl);
    onCleanup(() => registerStoryDomTarget(targetId, null));
  });

  createEffect(() => {
    if (props.element.props?.autoFocus !== true || selectEl == null) {
      return;
    }

    queueMicrotask(() => {
      selectEl?.focus({ preventScroll: true });
    });
  });

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <select
        ref={(el) => {
          selectEl = el;
        }}
        class="web-select__input"
        name={name()}
        disabled={props.element.props?.disabled === true || getBusy() === true}
        value={
          props.element.props?.value ?? props.element.props?.choices?.[0] ?? ''
        }
      >
        <For each={props.element.props?.choices ?? []}>
          {(choice) => (
            <option value={choice}>
              {props.element.props?.choiceLabels?.[choice] ?? choice}
            </option>
          )}
        </For>
      </select>
    </div>
  );
}

export function WebChoiceFieldNode(props: WebTextFieldNodeProps): JSX.Element {
  const choices = () => props.element.props?.choices ?? [];
  const customChoice = () => props.element.props?.customChoice ?? 'custom';
  const multiple = () => props.element.props?.multiple === true;

  const [selected, setSelected] = createSignal(
    props.element.props?.value ?? choices()[0] ?? '',
  );

  const [selectedValues, setSelectedValues] = createSignal<Set<string>>(
    new Set(props.element.props?.values ?? []),
  );

  const name = () => props.element.props?.formFieldName;
  let customInputEl: HTMLInputElement | undefined;

  const selectedValueList = createMemo(() => Array.from(selectedValues()));

  const choiceSelected = (choice: string) =>
    multiple() ? selectedValues().has(choice) : selected() === choice;

  createEffect(() => {
    const available = new Set(choices());

    if (multiple()) {
      setSelectedValues((current) => {
        const retained = new Set(
          [...current].filter((choice) => available.has(choice)),
        );

        return retained.size > 0
          ? retained
          : choices()[0]
            ? new Set<string>([choices()[0]!])
            : new Set<string>();
      });

      return;
    }

    if (!available.has(selected())) {
      setSelected(props.element.props?.value ?? choices()[0] ?? '');
    }
  });

  const toggleChoice = (choice: string) => {
    if (!multiple()) {
      setSelected(choice);

      return;
    }

    setSelectedValues((current) => {
      const next = new Set(current);

      if (next.has(choice)) {
        next.delete(choice);
      } else {
        next.add(choice);
      }

      return next.size === 0 ? current : next;
    });
  };

  createEffect(() => {
    if (selected() !== customChoice() || customInputEl == null) {
      return;
    }

    queueMicrotask(() => customInputEl?.focus({ preventScroll: true }));
  });

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <Show
        when={multiple()}
        fallback={
          <Show when={selected() !== customChoice()}>
            <input type="hidden" name={name()} value={selected()} />
          </Show>
        }
      >
        <For each={selectedValueList()}>
          {(choice) => <input type="hidden" name={name()} value={choice} />}
        </For>
      </Show>
      <div class="web-choiceField__choices">
        <For each={choices()}>
          {(choice) => (
            <WebButton
              type="button"
              class="web-choiceField__choice"
              classList={{ 'is-selected': choiceSelected(choice) }}
              data-choice={choice}
              onClick={() => toggleChoice(choice)}
            >
              {props.element.props?.choiceLabels?.[choice] ?? choice}
            </WebButton>
          )}
        </For>
      </div>
      <Show when={selected() === customChoice()}>
        <input
          ref={(el) => {
            customInputEl = el;
          }}
          class="web-choiceField__custom-input"
          name={name()}
          type="number"
          min="1"
          inputMode="numeric"
          placeholder={props.element.props?.inputPlaceholder ?? 'Amount'}
          autocomplete="off"
        />
      </Show>
    </div>
  );
}
