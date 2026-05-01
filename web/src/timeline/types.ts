import type { Accessor, Setter } from 'solid-js';

import type { WebNodeRoot } from '@src/web/ui-schema';

import type { PendingRequest } from '../socket/types';
import type {
  CommandDetail,
  CommandPayload,
  CommandSubcommand,
  TimelineItem,
} from '../types';

export type TimelineAdapters = {
  timeline: Accessor<TimelineItem[]>;
  timelineId: Accessor<string>;
  setTimeline: Setter<TimelineItem[]>;
  setActiveFormId: Setter<string | null>;
  createId: () => string;
  pendingRequests: Map<string, PendingRequest>;
  sendSocketMessage: (message: unknown) => void;
  runCommand: (
    command: string,
    subcommand: CommandSubcommand,
    values: CommandPayload,
  ) => Promise<void>;
  defaultPayload: (subcommand: CommandSubcommand) => CommandPayload;
  resolveCommandDetail: (name: string) => CommandDetail | null;
};

export type TimelineHook = {
  appendSystemMessage: (text: string) => void;
  deleteTimelineItem: (itemId: string) => void;
  repeatTimelineSubcommand: (
    item: Extract<TimelineItem, { type: 'command_result' | 'command_form' }>,
  ) => Promise<void>;
  replaceCommandResultWeb: (itemId: string, web: WebNodeRoot) => void;
  saveTimelineForm: (
    item: Extract<TimelineItem, { type: 'command_form' }>,
  ) => void;
  submitForm: (itemId: string) => Promise<void>;
  updateFormValue: (
    itemId: string,
    source: 'arguments' | 'options',
    name: string,
    value: unknown,
  ) => void;
};
