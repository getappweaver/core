import type { ChromeModalState } from '../chrome/types';
import type { TimelineItem } from '../types';

export type SessionWidgetItem = Extract<
  TimelineItem,
  { type: 'command_result' }
>;

export type SessionWidgetLayout = {
  version: 1;
  widgets: Array<{
    key: string;
    item: SessionWidgetItem;
    visible: boolean;
    expanded: boolean;
  }>;
  modal: ChromeModalState | null;
};

const STORAGE_PREFIX = 'appweaver.session-widgets:';

export function readSessionWidgetLayout(
  sessionId: string,
): SessionWidgetLayout | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);

    if (!raw) {
      return null;
    }

    const value = JSON.parse(raw) as unknown;

    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Partial<SessionWidgetLayout>;

    if (record.version !== 1 || !Array.isArray(record.widgets)) {
      return null;
    }

    const widgets = record.widgets.filter(
      (widget): widget is SessionWidgetLayout['widgets'][number] =>
        widget !== null &&
        typeof widget === 'object' &&
        typeof widget.key === 'string' &&
        typeof widget.visible === 'boolean' &&
        typeof widget.expanded === 'boolean' &&
        widget.item?.type === 'command_result' &&
        widget.item.timelineSingletonKey === widget.key,
    );

    const modal = record.modal;

    return {
      version: 1,
      widgets,
      modal:
        modal &&
        typeof modal.command === 'string' &&
        typeof modal.subcommand === 'string' &&
        typeof modal.title === 'string'
          ? modal
          : null,
    };
  } catch {
    return null;
  }
}

export function writeSessionWidgetLayout(
  sessionId: string,
  layout: SessionWidgetLayout,
): void {
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${sessionId}`,
      JSON.stringify(layout),
    );
  } catch {
    // The layout is a convenience snapshot; a full storage quota must not block the UI.
  }
}
