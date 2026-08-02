import { createMemo, createSignal, For, Show, useContext } from 'solid-js';

import type { WebAction, WebElementNode } from '@src/web/ui-schema';

import { TreeTimeFilterStateContext } from './contexts';
import { elementClass, elementStyle, elementUi } from './element-helpers';

function rangeLabel(since: number, until: number): string {
  const start = new Date(since * 1000);
  const end = new Date(until * 1000);

  const date = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return `${date}, ${start.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}–${end.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

type WebTreeTimeFilterStatusElementProps = {
  element: WebElementNode;
  runAction: (action: WebAction | undefined) => void;
};

export function WebTreeTimeFilterStatusElement(
  props: WebTreeTimeFilterStatusElementProps,
) {
  const state = useContext(TreeTimeFilterStateContext);
  const [managing, setManaging] = createSignal(false);
  const group = () => props.element.props?.timeFilterGroup ?? '';
  const ranges = () => (group() ? (state?.ranges(group()) ?? []) : []);

  const visibleKeys = createMemo(
    () => new Set(props.element.props?.timeFilterVisibleRangeKeys ?? []),
  );

  const outsideCount = () =>
    ranges().filter((range) => !visibleKeys().has(range.key)).length;

  const unitLabel = () => props.element.props?.timeFilterUnitLabel ?? 'ranges';

  const outsideLabel = () => {
    const count = outsideCount();

    if (count === 0) {
      return '';
    }

    return count === ranges().length
      ? ' · all outside current bar'
      : ` · ${count} outside current bar`;
  };

  return (
    <Show when={ranges().length > 0}>
      <div
        class={elementClass(props.element)}
        data-ui={elementUi(props.element)}
        style={elementStyle(props.element)}
      >
        <div class="web-tree-time-filter-status__summary">
          <span>
            TIME FILTER · {ranges().length} {unitLabel()}
            {outsideLabel()}
          </span>
          <button type="button" onClick={() => setManaging((value) => !value)}>
            {managing() ? 'Hide' : 'Manage'}
          </button>
          <button
            type="button"
            onClick={() => {
              const action = props.element.props?.action;

              if (action) {
                props.runAction(action);
              } else {
                state?.clear(group());
              }
            }}
          >
            Clear
          </button>
        </div>
        <Show when={managing()}>
          <div class="web-tree-time-filter-status__ranges">
            <For each={ranges()}>
              {(range) => (
                <button
                  type="button"
                  onClick={() => {
                    if (range.removeAction) {
                      props.runAction(range.removeAction);
                    } else {
                      state?.remove(group(), range.key);
                    }
                  }}
                >
                  ✓ {rangeLabel(range.since, range.until)} ×
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
