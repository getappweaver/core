import type { WebElementNode } from '@src/web/ui-schema';

import { elementClass, elementStyle, elementUi } from './element-helpers';

export function formatLocalTimestamp(timestampMs: number | undefined): string {
  if (
    timestampMs === undefined ||
    !Number.isFinite(new Date(timestampMs).getTime())
  ) {
    return '(unknown)';
  }

  return new Date(timestampMs).toLocaleString(undefined, {
    timeZoneName: 'short',
  });
}

export function WebTimestampElement(props: { element: WebElementNode }) {
  const iso = () => {
    const timestamp = props.element.props?.timestampMs;

    return timestamp === undefined ||
      !Number.isFinite(new Date(timestamp).getTime())
      ? undefined
      : new Date(timestamp).toISOString();
  };

  return (
    <time
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
      datetime={iso()}
      title={props.element.props?.title ?? iso()}
    >
      {props.element.props?.label ? `${props.element.props.label} ` : ''}
      {formatLocalTimestamp(props.element.props?.timestampMs)}
    </time>
  );
}
