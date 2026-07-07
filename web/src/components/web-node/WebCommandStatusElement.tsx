import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

import type { WebElementNode } from '@src/web/ui-schema';

import { backgroundCommandStatus } from '../../commands/backgroundStatus';

import { elementClass, elementStyle, elementUi } from './element-helpers';

type WebCommandStatusElementProps = {
  element: WebElementNode;
};

export function WebCommandStatusElement(
  props: WebCommandStatusElementProps,
): JSX.Element {
  const status = () => backgroundCommandStatus(props.element.props?.id);
  const progressPercent = () => Math.round((status()?.progress ?? 0) * 100);

  return (
    <div
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      data-state={status()?.state ?? 'idle'}
      style={elementStyle(props.element)}
    >
      <Show
        when={status()}
        fallback={
          <div class="web-commandStatus__empty">
            Background fetch progress will appear here.
          </div>
        }
      >
        {(current) => (
          <div class="web-commandStatus__body">
            <div class="web-commandStatus__header">
              <span class="web-commandStatus__dot" aria-hidden="true" />
              <span class="web-commandStatus__message">
                {current().message ?? current().state}
              </span>
            </div>
            <Show when={current().state === 'pending'}>
              <div class="web-commandStatus__bar" aria-hidden="true">
                <span
                  style={
                    current().progress === null
                      ? undefined
                      : { width: `${progressPercent()}%` }
                  }
                  classList={{ 'is-determinate': current().progress !== null }}
                />
              </div>
            </Show>
            <Show when={current().output}>
              {(output) => (
                <pre class="web-commandStatus__output">{output()}</pre>
              )}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
