import type { JSX } from 'solid-js';
import { createMemo, createSignal, createEffect, Show, For } from 'solid-js';

import type {
  WebElementNode,
  WebAction,
  WebNodeRoot,
} from '@src/web/ui-schema';

import { WebButton } from '../WebButton';

import { elementClass, elementStyle, elementUi } from './element-helpers';

export function tabPanels(element: WebElementNode): WebElementNode[] {
  return (element.children ?? []).filter(
    (child): child is WebElementNode =>
      child.type === 'element' && child.tag === 'tabPanel',
  );
}

type WebTabsElementProps = {
  element: WebElementNode;
  onReplaceRoot?: (root: WebNodeRoot) => void;
  onError?: (message: string) => void;
  promptRequestId?: string;
  onRunAction?: (
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
  renderChild: (child: import('@src/web/ui-schema').WebNode) => JSX.Element;
};

export function WebTabsElement(props: WebTabsElementProps): JSX.Element {
  const panels = createMemo(() => tabPanels(props.element));

  const firstPanelId = createMemo(() => panels()[0]?.props?.id ?? null);

  const initialPanelId = () =>
    props.element.props?.defaultActiveTabId ?? firstPanelId() ?? '';

  const [activeTabId, setActiveTabId] = createSignal(initialPanelId());

  createEffect(() => {
    const ids = new Set(
      panels()
        .map((panel) => panel.props?.id)
        .filter((id): id is string => typeof id === 'string'),
    );

    if (!ids.has(activeTabId())) {
      setActiveTabId(initialPanelId());
    }
  });

  const activePanel = createMemo(
    () =>
      panels().find((panel) => panel.props?.id === activeTabId()) ??
      panels()[0] ??
      null,
  );

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <div class="widget-tabs" role="tablist">
        <For each={panels()}>
          {(panel) => {
            const panelId = panel.props?.id ?? '';

            return (
              <WebButton
                type="button"
                class="web-button widget-tab"
                classList={{ active: activeTabId() === panelId }}
                role="tab"
                aria-selected={activeTabId() === panelId}
                aria-controls={
                  panelId.length > 0 ? `${panelId}-panel` : undefined
                }
                onClick={() => setActiveTabId(panelId)}
              >
                {panel.props?.label ?? panelId}
              </WebButton>
            );
          }}
        </For>
      </div>
      <Show when={activePanel()} keyed>
        {(panelNode) => {
          const panelId = panelNode.props?.id;

          return (
            <div
              class={elementClass(panelNode)}
              data-ui={elementUi(panelNode)}
              id={panelId != null ? `${panelId}-panel` : undefined}
              role="tabpanel"
              style={elementStyle(panelNode)}
            >
              <For each={panelNode.children ?? []}>
                {(child) => props.renderChild(child)}
              </For>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
