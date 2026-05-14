import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import type { LayoutPrefs } from '../../layout/desktopLayoutPrefs';
import type { TimelineItem } from '../../types';

export type TimelineViewProps = {
  activeFormId: string | null;
  timeline: TimelineItem[];
  showBottomFade: boolean;
  isTimelineItemHidden?: (
    item: Extract<TimelineItem, { type: 'command_result' }>,
  ) => boolean;
  setTimelineRef: (el: HTMLDivElement) => void;
  onOpenCommand: (command: string) => void;
  onRepeatSubcommand: (
    item: Extract<TimelineItem, { type: 'command_result' | 'command_form' }>,
  ) => void;
  onDeleteTimelineItem: (itemId: string) => void;
  onReplaceCommandWeb: (itemId: string, web: WebNodeRoot) => void;
  onAppendSystem: (text: string) => void;
  currentUserPubkey: string | null;
  isWebUiBusy: (sourceId: string) => boolean;
  onRunWebAction: (
    action: WebAction,
    params?: {
      onReplaceRoot?: (root: WebNodeRoot) => void;
      promptRequestId?: string;
      promptInTimeline?: boolean;
      webCommandSourceId?: string;
    },
  ) => void;
  onRunJsonCommand: (props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }) => Promise<string>;
  onUpdateFormValue: (
    itemId: string,
    source: 'arguments' | 'options',
    name: string,
    value: unknown,
  ) => void;
  onSubmitForm: (itemId: string) => void;
  layoutPrefs?: LayoutPrefs;
  onUpdateLayoutPrefs?: (updater: (prefs: LayoutPrefs) => LayoutPrefs) => void;
};
