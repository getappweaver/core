import { createMemo, createSignal, onCleanup, onMount } from 'solid-js';

import type { WebElementNode } from '@src/web/ui-schema';

import { elementClass, elementStyle, elementUi } from './element-helpers';

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function durationPart(value: number, unit: string): string | null {
  if (value === 0) {
    return null;
  }

  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function countdownLabel(
  targetTimestamp: number | undefined,
  now: number | null,
): string {
  if (targetTimestamp === undefined || now === null) {
    return '';
  }

  const remainingMs = targetTimestamp * 1000 - now;

  if (remainingMs <= 0) {
    return 'Due now';
  }

  const totalMinutes = Math.ceil(remainingMs / MINUTE_MS);
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);

  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);

  const minutes = totalMinutes % MINUTES_PER_HOUR;

  const parts = [
    durationPart(days, 'day'),
    durationPart(hours, 'hour'),
    durationPart(minutes, 'minute'),
  ].filter((part): part is string => part !== null);

  return `${parts.join(', ')} left`;
}

export function WebCountdownElement(props: { element: WebElementNode }) {
  const [now, setNow] = createSignal<number | null>(null);

  const label = createMemo(() =>
    countdownLabel(props.element.props?.targetTimestamp, now()),
  );

  let intervalId: number | undefined;

  onMount(() => {
    setNow(Date.now());
    intervalId = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
  });

  onCleanup(() => {
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
    }
  });

  return (
    <span
      class={elementClass(props.element)}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      {label()}
    </span>
  );
}
