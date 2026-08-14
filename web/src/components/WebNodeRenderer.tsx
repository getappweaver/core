import type { JSX } from 'solid-js';
import { For, Match, Show, Switch, useContext } from 'solid-js';

import type {
  WebAction,
  WebElementNode,
  WebNode,
  WebNostrPostElement as NostrPostElement,
} from '@src/web/ui-schema';

import { backgroundCommandStatus } from '../commands/backgroundStatus';
import type { RunWebActionParams } from '../commands/types';
import { registerStoryDomTarget } from '../story/dom-targets';
import {
  emitStoryTargetClicked,
  emitStoryTargetHovered,
} from '../story/events';

import type { WebNodeRendererProps } from './web-node/contexts';
import {
  TreeExpandRequestSetterContext,
  TreeDirectChildCountContext,
  TreeRootItemCountContext,
  TreeFilterStateContext,
  TreeTimeFilterStateContext,
  isTreeTimeRangeActionActive,
  TreeItemExpandedStateContext,
  useWebEntityKey,
  useWebCurrentUserPubkey,
  WebEntityKeyContext,
  WebPendingEntityContext,
  WebRevealContext,
  WebToggleContext,
} from './web-node/contexts';
import {
  elementClass,
  elementStyle,
  elementUi,
} from './web-node/element-helpers';
import { WebOverflowMenuElement } from './web-node/overflow-menu';
import {
  HljsHighlightedSpan,
  setupWebElementRef,
  SpeechHighlightBox,
} from './web-node/speech';
import { runLocalWebAction } from './web-node/tree-state';
import { WebCheckboxControl } from './web-node/WebCheckboxControl';
import { WebCommandStatusElement } from './web-node/WebCommandStatusElement';
import { WebCountdownElement } from './web-node/WebCountdownElement';
import {
  WebChoiceFieldNode,
  WebFormElement,
  WebSelectNode,
  WebTextAreaNode,
  WebTextFieldNode,
} from './web-node/WebFormElement';
import { WebNostrPostElement } from './web-node/WebNostrPostElement';
import { WebTabsElement } from './web-node/WebTabsElement';
import { WebTreeElement, WebTreeItemElement } from './web-node/WebTreeElement';
import { WebTreeTimeFilterStatusElement } from './web-node/WebTreeTimeFilterStatusElement';
import { WebShadowUiBusyContext } from './web-shadow-ui-busy-context';
import { WebButton } from './WebButton';
import { WebEditableText } from './WebEditableText';

export type { WebNodeRendererProps } from './web-node/contexts';
export * from './web-node/contexts';
export * from './web-node/tree-state';

function hljsLanguageFromUi(ui: string): string | null {
  const langPart = ui.includes(':') ? ui.split(':')[1] : null;

  return langPart !== null && langPart.length > 0 ? langPart : null;
}

type RenderElementProps = {
  element: WebElementNode;
  props: WebNodeRendererProps;
  runAction: (
    action: WebAction | undefined,
    sourceEntityKey?: string | null,
    params?: RunWebActionParams,
  ) => void;
  renderChild: (child: WebNode) => JSX.Element;
};

function isTreeFilterActionActive(
  action: WebAction,
  currentFilterValue: string,
): boolean {
  if (action.type !== 'clientAction') {
    return false;
  }

  if (action.action !== 'web.toggleTreeFilter') {
    return false;
  }

  const value = action.payload?.value;

  return (
    typeof value === 'string' &&
    currentFilterValue.trim().toLowerCase() === value.trim().toLowerCase()
  );
}

function isNostrPostElement(
  element: WebElementNode,
): element is NostrPostElement {
  return element.tag === 'nostrPost';
}

function isBackgroundCommandTargetActive(element: WebElementNode): boolean {
  const action = element.props?.action;

  if (action?.type !== 'command' || !element.props?.id) {
    return false;
  }

  const status = backgroundCommandStatus(action.clientStatus?.statusTargetId);

  return (
    status?.state === 'pending' && status.activeTargetId === element.props.id
  );
}

function isBackgroundCommandGroupPending(element: WebElementNode): boolean {
  const action = element.props?.action;

  if (action?.type !== 'command' || !action.clientStatus?.activeTargetId) {
    return false;
  }

  return (
    backgroundCommandStatus(action.clientStatus.statusTargetId)?.state ===
    'pending'
  );
}

function renderElement({
  element,
  props,
  runAction,
  renderChild,
}: RenderElementProps): JSX.Element {
  const getBusy = useContext(WebShadowUiBusyContext);
  const entityKey = useWebEntityKey();
  const getEntityPending = useContext(WebPendingEntityContext);

  const entityPending = () => {
    const key = entityKey();

    return key ? getEntityPending(key).pending : false;
  };

  const filterState = useContext(TreeFilterStateContext);
  const timeFilterState = useContext(TreeTimeFilterStateContext);
  const directTreeItemCount = useContext(TreeDirectChildCountContext);
  const rootTreeItemCount = useContext(TreeRootItemCountContext);

  return (
    <Switch>
      <Match when={element.tag === 'divider'}>
        <hr class={elementClass(element)} data-ui={elementUi(element)} />
      </Match>

      <Match when={element.tag === 'spacer'}>
        <div
          class={elementClass(element)}
          data-ui={elementUi(element)}
          style={elementStyle(element)}
          aria-hidden="true"
        />
      </Match>

      <Match when={element.tag === 'button'}>
        {(() => {
          const htmlType = () => element.props?.htmlType ?? 'button';
          const submitAction = () => element.props?.submitAction;

          const disabledUntilFormFieldPositiveInteger = () =>
            element.props?.disabledUntilFormFieldPositiveInteger;

          const disabledUntilFormFieldChanged = () =>
            element.props?.disabledUntilFormFieldChanged;

          const disabled = () =>
            element.props?.disabled === true ||
            getBusy() === true ||
            entityPending() ||
            isBackgroundCommandGroupPending(element);

          if (htmlType() === 'submit') {
            return (
              <WebButton
                type="submit"
                class={elementClass(element)}
                data-ui={elementUi(element)}
                data-story-target={element.props?.storyTargetId}
                ref={(el) =>
                  element.props?.storyTargetId
                    ? registerStoryDomTarget(element.props.storyTargetId, el)
                    : undefined
                }
                style={elementStyle(element)}
                disabled={disabled()}
                aria-label={element.props?.ariaLabel}
                title={element.props?.title}
                data-web-submit-action={
                  submitAction() ? JSON.stringify(submitAction()) : undefined
                }
                data-web-disable-until-positive-integer={disabledUntilFormFieldPositiveInteger()}
                data-web-disable-until-field-changed={disabledUntilFormFieldChanged()}
                onClick={() => {
                  if (element.props?.storyTargetId) {
                    emitStoryTargetClicked(element.props.storyTargetId);
                  }
                }}
              >
                <Show
                  when={(element.children ?? []).length > 0}
                  fallback={element.props?.label ?? ''}
                >
                  <For each={element.children ?? []}>{renderChild}</For>
                </Show>
              </WebButton>
            );
          }

          return (
            <WebButton
              type="button"
              class={elementClass(element)}
              classList={{
                'is-background-command-active':
                  isBackgroundCommandTargetActive(element),
                'is-tree-time-filter-active': isTreeTimeRangeActionActive(
                  element.props?.action,
                  timeFilterState,
                ),
              }}
              data-ui={elementUi(element)}
              data-story-target={element.props?.storyTargetId}
              ref={(el) =>
                element.props?.storyTargetId
                  ? registerStoryDomTarget(element.props.storyTargetId, el)
                  : undefined
              }
              style={elementStyle(element)}
              disabled={disabled()}
              aria-label={element.props?.ariaLabel}
              title={element.props?.title}
              aria-pressed={
                element.props?.action?.type === 'clientAction' &&
                element.props.action.action === 'web.toggleTreeTimeRange'
                  ? isTreeTimeRangeActionActive(
                      element.props.action,
                      timeFilterState,
                    )
                  : undefined
              }
              data-web-submit-action={
                submitAction() ? JSON.stringify(submitAction()) : undefined
              }
              data-web-disable-until-positive-integer={disabledUntilFormFieldPositiveInteger()}
              data-web-disable-until-field-changed={disabledUntilFormFieldChanged()}
              onClick={(e) => {
                if (element.props?.stopPropagation) {
                  e.stopPropagation();
                }

                if (element.props?.storyTargetId) {
                  emitStoryTargetClicked(element.props.storyTargetId);
                }

                runAction(element.props?.action);
              }}
            >
              <Show
                when={(element.children ?? []).length > 0}
                fallback={element.props?.label ?? ''}
              >
                <For each={element.children ?? []}>{renderChild}</For>
              </Show>
            </WebButton>
          );
        })()}
      </Match>

      <Match when={element.tag === 'treeFilterStatus'}>
        <span
          class={elementClass(element)}
          data-ui={elementUi(element)}
          style={elementStyle(element)}
        >
          <Show
            when={(filterState?.query() ?? '').trim()}
            fallback={element.props?.label ?? ''}
          >
            {(query) => (
              <>
                Filtering by: &quot;{query()}&quot;{' '}
                <button
                  type="button"
                  class="web-tree-filter-clear"
                  onClick={() => filterState?.setValue('')}
                >
                  Clear
                </button>
              </>
            )}
          </Show>
        </span>
      </Match>

      <Match when={element.tag === 'countdown'}>
        <WebCountdownElement element={element} />
      </Match>

      <Match when={element.tag === 'countLabel'}>
        <span
          class={elementClass(element)}
          data-ui={elementUi(element)}
          style={elementStyle(element)}
        >
          {element.props?.label ?? ''} ({directTreeItemCount?.() ?? 0})
        </span>
      </Match>

      <Match when={element.tag === 'treeEmpty'}>
        <Show when={(rootTreeItemCount?.() ?? 0) === 0}>
          <div
            class={elementClass(element)}
            data-ui={elementUi(element)}
            style={elementStyle(element)}
          >
            <For each={element.children ?? []}>{renderChild}</For>
          </div>
        </Show>
      </Match>

      <Match when={element.tag === 'treeTimeFilterStatus'}>
        <WebTreeTimeFilterStatusElement
          element={element}
          runAction={runAction}
        />
      </Match>

      <Match when={element.tag === 'link'}>
        <a
          class={elementClass(element)}
          data-ui={elementUi(element)}
          data-story-target={element.props?.storyTargetId}
          ref={(el) =>
            element.props?.storyTargetId
              ? registerStoryDomTarget(element.props.storyTargetId, el)
              : undefined
          }
          style={elementStyle(element)}
          contentEditable={element.props?.contentEditable}
          href={element.props?.href ?? '#'}
          target={element.props?.external ? '_blank' : undefined}
          rel={element.props?.external ? 'noopener noreferrer' : undefined}
          onClick={(e) => {
            if (element.props?.action) {
              e.preventDefault();
            }

            e.stopPropagation();

            if (element.props?.storyTargetId) {
              emitStoryTargetClicked(element.props.storyTargetId);
            }

            runAction(element.props?.action);
          }}
        >
          <For each={element.children ?? []}>{renderChild}</For>
        </a>
      </Match>

      <Match when={element.tag === 'checkbox'}>
        <Show
          when={element.props?.formFieldName}
          fallback={
            <WebCheckboxControl
              className={elementClass(element)}
              style={elementStyle(element)}
              checked={Boolean(element.props?.checked)}
              indeterminate={element.props?.indeterminate === true}
              disabled={
                element.props?.disabled ??
                (element.props?.action ? false : true)
              }
              onChange={() => runAction(element.props?.action)}
            />
          }
        >
          {(name) => (
            <input
              class={elementClass(element)}
              data-ui={elementUi(element)}
              style={elementStyle(element)}
              type="checkbox"
              name={name()}
              value={element.props?.value ?? 'true'}
              checked={element.props?.checked === true}
              disabled={element.props?.disabled === true}
            />
          )}
        </Show>
      </Match>

      <Match when={element.tag === 'overflowMenu'}>
        <WebOverflowMenuElement
          element={element}
          runAction={runAction}
          renderChild={renderChild}
        />
      </Match>

      <Match when={element.tag === 'tree'}>
        <WebTreeElement
          element={element}
          onReplaceRoot={props.onReplaceRoot}
          onError={props.onError}
          promptRequestId={props.promptRequestId}
          onRunAction={props.onRunAction}
          renderChild={renderChild}
        />
      </Match>

      <Match when={element.tag === 'tabs'}>
        <WebTabsElement
          element={element}
          onReplaceRoot={props.onReplaceRoot}
          onError={props.onError}
          promptRequestId={props.promptRequestId}
          onRunAction={props.onRunAction}
          renderChild={renderChild}
        />
      </Match>

      <Match when={element.tag === 'treeItem'}>
        <WebTreeItemElement
          element={element}
          onReplaceRoot={props.onReplaceRoot}
          onError={props.onError}
          promptRequestId={props.promptRequestId}
          onRunAction={props.onRunAction}
          renderChild={renderChild}
        />
      </Match>

      <Match when={element.tag === 'menuItem'}>
        <WebButton
          type="button"
          role="menuitem"
          class={`${elementClass(element)} web-button`}
          data-ui={elementUi(element)}
          data-story-target={element.props?.storyTargetId}
          ref={(el) =>
            element.props?.storyTargetId
              ? registerStoryDomTarget(element.props.storyTargetId, el)
              : undefined
          }
          style={elementStyle(element)}
          disabled={
            element.props?.disabled === true ||
            getBusy() === true ||
            entityPending()
          }
          onClick={(e) => {
            if (element.props?.stopPropagation) {
              e.stopPropagation();
            }

            if (element.props?.storyTargetId) {
              emitStoryTargetClicked(element.props.storyTargetId);
            }

            runAction(element.props?.action);
          }}
        >
          <Show
            when={(element.children ?? []).length > 0}
            fallback={element.props?.label ?? ''}
          >
            <For each={element.children ?? []}>{renderChild}</For>
          </Show>
        </WebButton>
      </Match>

      <Match when={element.tag === 'form'}>
        <WebFormElement
          element={element}
          onRunAction={props.onRunAction}
          onReplaceRoot={props.onReplaceRoot}
          onError={props.onError}
          promptRequestId={props.promptRequestId}
          renderChild={renderChild}
        />
      </Match>

      <Match when={element.tag === 'textField'}>
        <WebTextFieldNode element={element} />
      </Match>

      <Match when={element.tag === 'select'}>
        <WebSelectNode element={element} />
      </Match>

      <Match when={element.tag === 'choiceField'}>
        <WebChoiceFieldNode element={element} />
      </Match>

      <Match when={element.tag === 'textArea'}>
        <WebTextAreaNode element={element} />
      </Match>

      <Match when={element.tag === 'editableText'}>
        <WebEditableText element={element} />
      </Match>

      <Match when={element.tag === 'badge'}>
        <Show
          when={element.props?.action}
          fallback={
            <span
              class={elementClass(element)}
              data-ui={elementUi(element)}
              style={elementStyle(element)}
            >
              {element.props?.label ?? ''}
            </span>
          }
        >
          {(action) => (
            <button
              type="button"
              class={`${elementClass(element)}${isTreeFilterActionActive(action(), filterState?.query() ?? '') ? ' is-active' : ''}`}
              data-ui={elementUi(element)}
              style={elementStyle(element)}
              onClick={(e) => {
                if (element.props?.stopPropagation) {
                  e.stopPropagation();
                }

                runAction(action());
              }}
            >
              {element.props?.label ?? ''}
            </button>
          )}
        </Show>
      </Match>

      <Match when={element.tag === 'image'}>
        <img
          class={elementClass(element)}
          data-ui={elementUi(element)}
          style={elementStyle(element)}
          src={element.props?.src ?? ''}
          alt={element.props?.alt ?? ''}
          aria-hidden={element.props?.alt ? undefined : 'true'}
        />
      </Match>

      <Match when={element.tag === 'nostrPost'}>
        {isNostrPostElement(element) ? (
          <WebNostrPostElement element={element} runAction={runAction} />
        ) : null}
      </Match>

      <Match when={element.tag === 'commandStatus'}>
        <WebCommandStatusElement element={element} />
      </Match>

      <Match when={element.tag === 'text'}>
        {(() => {
          const ui = element.props?.ui ?? '';

          if (ui.startsWith('hljs-code')) {
            return (
              <HljsHighlightedSpan
                element={element}
                language={hljsLanguageFromUi(ui)}
              />
            );
          }

          return (
            <span
              class={elementClass(element)}
              data-ui={elementUi(element)}
              style={elementStyle(element)}
              contentEditable={element.props?.contentEditable}
            >
              <For each={element.children ?? []}>{renderChild}</For>
            </span>
          );
        })()}
      </Match>

      <Match when={true}>
        {(() => {
          if (element.props?.ttsText != null) {
            return (
              <SpeechHighlightBox
                element={element}
                onReplaceRoot={props.onReplaceRoot}
                onError={props.onError}
                promptRequestId={props.promptRequestId}
                speechSentences={props.speechSentences}
                activeSpeechSentenceIndex={props.activeSpeechSentenceIndex}
                onSpeechSentenceClick={props.onSpeechSentenceClick}
                onRunAction={props.onRunAction}
                renderChild={renderChild}
              />
            );
          }

          return (
            <div
              class={elementClass(element)}
              data-ui={elementUi(element)}
              data-story-target={element.props?.storyTargetId}
              ref={(el) => {
                setupWebElementRef({ element, el });
              }}
              style={elementStyle(element)}
              contentEditable={element.props?.contentEditable}
              role={element.props?.action ? 'button' : undefined}
              tabIndex={
                element.props?.action || element.props?.autoFocus === true
                  ? 0
                  : undefined
              }
              onMouseEnter={() => {
                if (element.props?.storyTargetId) {
                  emitStoryTargetHovered(element.props.storyTargetId);
                }
              }}
              onClick={() => {
                if (element.props?.storyTargetId) {
                  emitStoryTargetClicked(element.props.storyTargetId);
                }

                runAction(element.props?.action);
              }}
              onKeyDown={(e) => {
                if (!element.props?.action) {
                  return;
                }

                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  runAction(element.props.action);
                }
              }}
            >
              <For each={element.children ?? []}>{renderChild}</For>
            </div>
          );
        })()}
      </Match>
    </Switch>
  );
}

export function WebNodeRenderer(props: WebNodeRendererProps) {
  const revealContext = useContext(WebRevealContext);
  const toggleContext = useContext(WebToggleContext);
  const filterState = useContext(TreeFilterStateContext);
  const timeFilterState = useContext(TreeTimeFilterStateContext);
  const currentUserPubkey = useWebCurrentUserPubkey();
  const expandedById = useContext(TreeItemExpandedStateContext);
  const requestTreeItemExpansion = useContext(TreeExpandRequestSetterContext);
  const parentEntityKey = useWebEntityKey();
  const getEntityPending = useContext(WebPendingEntityContext);
  const node = () => props.node ?? props.root?.tree;

  const effectiveEntityKey = () => {
    const current = node();

    return current?.type === 'element'
      ? (current.props?.entityKey ?? parentEntityKey())
      : parentEntityKey();
  };

  const runAction = (
    action: WebAction | undefined,
    sourceEntityKey = effectiveEntityKey(),
    params?: RunWebActionParams,
  ) => {
    if (!action) {
      return;
    }

    if (
      action.type === 'command' &&
      action.pendingUi?.presentation === 'entity' &&
      sourceEntityKey &&
      getEntityPending(sourceEntityKey).pending
    ) {
      return;
    }

    if (
      runLocalWebAction({
        action,
        expandedById,
        expandTreeItems: requestTreeItemExpansion,
        revealContext,
        toggleContext,
        filterState,
        timeFilterState,
      })
    ) {
      return;
    }

    props.onRunAction?.(action, {
      onReplaceRoot: props.onReplaceRoot,
      promptRequestId: props.promptRequestId,
      webCommandSourceEntityKey: sourceEntityKey ?? undefined,
      ...params,
    });
  };

  const renderChild = (child: WebNode): JSX.Element => (
    <WebNodeRenderer
      node={child}
      onReplaceRoot={props.onReplaceRoot}
      onError={props.onError}
      promptRequestId={props.promptRequestId}
      speechSentences={props.speechSentences}
      activeSpeechSentenceIndex={props.activeSpeechSentenceIndex}
      onSpeechSentenceClick={props.onSpeechSentenceClick}
      onRunAction={props.onRunAction}
    />
  );

  return (
    <Switch fallback={null}>
      <Match when={node()?.type === 'text'}>
        {(node() as Extract<WebNode, { type: 'text' }>).value}
      </Match>

      <Match when={node()?.type === 'element'}>
        {(() => {
          const element = node() as WebElementNode;

          const visible = () => {
            const revealId = element.props?.revealId;
            const visibleForPubkeys = element.props?.visibleForPubkeys;
            const hiddenWhenToggleKey = element.props?.hiddenWhenToggleKey;
            const visibleWhenToggleKey = element.props?.visibleWhenToggleKey;

            return !(
              (visibleForPubkeys !== undefined &&
                !visibleForPubkeys.includes(currentUserPubkey() ?? '')) ||
              (element.props?.hiddenUntilRevealed === true &&
                (!revealId || revealContext?.isRevealed(revealId) !== true)) ||
              (hiddenWhenToggleKey !== undefined &&
                toggleContext?.isActive(hiddenWhenToggleKey) === true) ||
              (visibleWhenToggleKey !== undefined &&
                toggleContext?.isActive(visibleWhenToggleKey) !== true)
            );
          };

          return (
            <WebEntityKeyContext.Provider value={effectiveEntityKey}>
              <Show when={visible()}>
                {renderElement({ element, props, runAction, renderChild })}
              </Show>
            </WebEntityKeyContext.Provider>
          );
        })()}
      </Match>
    </Switch>
  );
}
