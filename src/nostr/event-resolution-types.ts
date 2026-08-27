import type { Event as NostrEvent, Filter } from 'nostr-tools';

import type {
  CachedEvent,
  CachedReplaceableEvent,
  CachePutResult,
} from './cache/store';
import type { ResolvedRelayGroup } from './relay-resolver';

export type ResolutionDiagnostic = {
  code:
    | 'cache-hit'
    | 'network-hit'
    | 'missing'
    | 'invalid-request'
    | 'deadline'
    | 'network-failed'
    | 'refresh-scheduled'
    | 'refresh-coalesced'
    | 'refresh-completed'
    | 'refresh-failed';
  attemptedGroups: number;
};

export type ResolveEventByIdProps = {
  eventId: string;
  authorPubkey: string | null;
  relayHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  deadlineAtMs: number;
};

export type ResolveReplaceableEventProps = {
  kind: number;
  pubkey: string;
  identifier: string | null;
  relayHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  refreshMode: 'stale-while-revalidate' | 'require-fresh';
  refreshIntervalMs: number;
  deadlineAtMs: number;
};

export type ResolvedEvent = {
  event: NostrEvent | null;
  source: 'cache' | 'network' | 'missing';
  relayHints: string[];
  diagnostic: ResolutionDiagnostic;
};

export type ResolvedReplaceableEvent = ResolvedEvent & {
  refresh: 'not-due' | 'scheduled' | 'coalesced' | 'completed' | 'failed';
};

export type EventReferenceRole =
  | 'thread-root'
  | 'thread-parent'
  | 'embed'
  | 'reply-target'
  | 'reaction-target'
  | 'repost-target';

export type EventReferenceTarget =
  | {
      type: 'event';
      eventId: string;
      authorPubkey: string | null;
    }
  | {
      type: 'address';
      kind: number;
      pubkey: string;
      identifier: string;
    };

export type EventReferenceEdge = {
  sourceEventId: string;
  role: EventReferenceRole;
  target: EventReferenceTarget;
  relayHints: string[];
};

export type EventResolutionPolicy = {
  includeThread: boolean;
  includeEmbeds: boolean;
  includeInteractions: boolean;
  includeReplies: boolean;
  maxDepth: number;
  maxEvents: number;
  maxReferencesPerEvent: number;
  timeoutMs: number;
};

export type MissingEventReference = {
  edge: EventReferenceEdge;
  reason: 'missing' | 'deadline' | 'network-failed';
  diagnostic: ResolutionDiagnostic;
};

export type ResolvedEventGraph = {
  events: NostrEvent[];
  edges: EventReferenceEdge[];
  missing: MissingEventReference[];
};

export type ResolveEventGraphProps = {
  rootEvents: NostrEvent[];
  contextRelays: string[];
  fallbackRelays: string[];
  policy: EventResolutionPolicy;
  deadlineAtMs: number;
};

export type QueryAuthorEventsProps = {
  pubkey: string;
  kind: number;
  relayHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  limit: number;
  refreshMode: 'stale-while-revalidate' | 'require-fresh';
  refreshIntervalMs: number;
  deadlineAtMs: number;
};

export type QueryDirectRepliesProps = {
  eventId: string;
  address: string | null;
  authorPubkey: string;
  relayHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  limit: number;
  deadlineAtMs: number;
};

export type ResolveAuthorRelaySetProps = {
  pubkey: string;
  relayHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  deadlineAtMs: number;
};

export type ResolvedAuthorRelaySet = {
  readRelays: string[];
  writeRelays: string[];
};

export type GetCachedReplaceableEventsProps = {
  kind: number;
  pubkeys: string[];
  identifier: string | null;
};

export type RefreshReplaceableEventsBatchProps = {
  kind: number;
  pubkeys: string[];
  identifier: string | null;
  contextRelays: string[];
  fallbackRelays: string[];
  refreshIntervalMs: number;
  deadlineAtMs: number;
};

export type SeedEventInput = {
  event: unknown;
  relayHints: string[];
  lastCheckedAtMs: number | null;
};

export type SeedEventsProps = {
  entries: SeedEventInput[];
};

export type SeedEventResult = {
  eventId: string | null;
  status: 'seeded' | 'skipped' | 'invalid';
};

export type SeedEventsResult = {
  seeded: number;
  skipped: number;
  invalid: number;
  results: SeedEventResult[];
};

export type EventQueryCompletion = 'eose' | 'closed' | 'deadline' | 'failed';

export type EventQueryResult = {
  events: unknown[];
  completion: EventQueryCompletion;
};

export type CountNewerResult =
  'zero' | 'positive' | 'unsupported' | 'failed' | 'deadline';

export type QueryFirstValidEventProps = {
  relays: string[];
  filter: Filter;
  deadlineAtMs: number;
  validate: (event: unknown) => NostrEvent | null;
};

export type QueryEventsUntilEoseProps = {
  relays: string[];
  filter: Filter;
  deadlineAtMs: number;
};

export type CountNewerEventsProps = {
  relays: string[];
  filter: Filter;
  deadlineAtMs: number;
};

export type EventResolutionNetwork = {
  queryFirstValid: (
    props: QueryFirstValidEventProps,
  ) => Promise<EventQueryResult>;
  queryUntilEose: (
    props: QueryEventsUntilEoseProps,
  ) => Promise<EventQueryResult>;
  countNewer: (props: CountNewerEventsProps) => Promise<CountNewerResult>;
};

export type PutEventByIdCacheProps = {
  event: unknown;
  requestedEventId: string;
  relayHints: string[];
  nowMs: number;
};

export type EventCacheAddressProps = {
  kind: number;
  pubkey: string;
  identifier: string | null;
};

export type UpdateEventCacheAccessProps = {
  eventId: string;
  relayHints: string[];
  nowMs: number;
};

export type UpdateReplaceableCacheAccessProps = EventCacheAddressProps & {
  relayHints: string[];
  nowMs: number;
};

export type UpsertReplaceableCacheProps = EventCacheAddressProps & {
  event: unknown;
  relayHints: string[];
  nowMs: number;
  lastCheckedAt: number;
};

export type MarkReplaceableCacheCheckedProps = EventCacheAddressProps & {
  checkedAtMs: number;
};

export type EventResolutionCache = {
  getEventById: (eventId: string) => CachedEvent | null;
  putEventById: (props: PutEventByIdCacheProps) => CachePutResult;
  updateEventAccess: (props: UpdateEventCacheAccessProps) => boolean;
  getReplaceable: (
    props: EventCacheAddressProps,
  ) => CachedReplaceableEvent | null;
  upsertReplaceable: (props: UpsertReplaceableCacheProps) => CachePutResult;
  updateReplaceableAccess: (
    props: UpdateReplaceableCacheAccessProps,
  ) => boolean;
  markReplaceableChecked: (props: MarkReplaceableCacheCheckedProps) => boolean;
};

export type FetchLatestReplaceableProps = {
  groups: ResolvedRelayGroup[];
  kind: number;
  pubkey: string;
  identifier: string;
  deadlineAtMs: number;
  maxRelayAttempts: number;
};
