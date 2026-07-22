import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import type { RunWebActionParams } from '../../commands/types';
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
  getWebEntityPending: (
    sourceId: string,
    entityKey: string,
  ) => import('../../commands/types').WebEntityPendingState;
  onRunWebAction: (action: WebAction, params?: RunWebActionParams) => void;
  onRunJsonCommand: (props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }) => Promise<string>;
  onRunJsonCommandOutput: (props: {
    command: string;
    subcommand: string;
    payload: unknown;
  }) => Promise<import('../../commands/types').SplitCommandOutput>;
  onReplaceTimelineItem: (item: TimelineItem) => void;
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
