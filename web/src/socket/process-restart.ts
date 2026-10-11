import type { ClientViewRoot } from '@src/web/ui-schema';

import {
  parseProcessRestartPayload,
  registerProcessRestart,
} from '../processRestartStatus';
import type { TimelineItem } from '../types';

import type { SocketAppAdapters } from './types';

const BROADCAST_CARD_PREFIX = 'process-restart-notice:';

function restartKey(view: ClientViewRoot | null): string | null {
  if (view?.view !== 'process-restart') {
    return null;
  }

  const payload = parseProcessRestartPayload(view.payload);

  return payload ? `${payload.instanceId}:${payload.requestedAt}` : null;
}

/** Prefer the persisted command result when it arrives after a live notice. */
export function deduplicateProcessRestartCards(
  items: TimelineItem[],
): TimelineItem[] {
  const commandKeys = new Set(
    items.flatMap((item) => {
      const key =
        item.type === 'command_result' &&
        !item.id.startsWith(BROADCAST_CARD_PREFIX)
          ? restartKey(item.clientView)
          : null;

      return key ? [key] : [];
    }),
  );

  return items.filter((item) => {
    if (
      item.type !== 'command_result' ||
      !item.id.startsWith(BROADCAST_CARD_PREFIX)
    ) {
      return true;
    }

    const key = restartKey(item.clientView);

    return key === null || !commandKeys.has(key);
  });
}

type ShowProcessRestartNoticeProps = {
  view: ClientViewRoot;
  setTimeline: SocketAppAdapters['setTimeline'];
};

export function showProcessRestartNotice({
  view,
  setTimeline,
}: ShowProcessRestartNoticeProps): void {
  const key = restartKey(view);

  if (key === null) {
    return;
  }

  // Register before mounting the card so disconnect errors are suppressed immediately.
  registerProcessRestart(view);

  setTimeline((items) => {
    if (
      items.some(
        (item) =>
          item.type === 'command_result' && restartKey(item.clientView) === key,
      )
    ) {
      return items;
    }

    return [
      ...items,
      {
        id: `${BROADCAST_CARD_PREFIX}${key}`,
        type: 'command_result',
        command: 'bot',
        subcommand: 'restart',
        subcommandTag: 'restart',
        values: null,
        text: null,
        web: null,
        clientView: view,
      },
    ];
  });
}
