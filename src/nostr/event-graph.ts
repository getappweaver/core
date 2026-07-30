import type { Event as NostrEvent } from 'nostr-tools';

import { parseEventReferences } from './event-references';
import type {
  EventReferenceEdge,
  EventReferenceRole,
  EventReferenceTarget,
  MissingEventReference,
  ResolutionDiagnostic,
  ResolvedEventGraph,
  ResolveEventGraphProps,
} from './event-resolution-types';
import {
  DEFAULT_REPLACEABLE_REFRESH_INTERVAL_MS,
  type EventResolver,
} from './event-resolver';

export const MAX_GRAPH_DEPTH = 8;
export const MAX_GRAPH_EVENTS = 100;
export const MAX_GRAPH_REFERENCES_PER_EVENT = 32;
export const MAX_GRAPH_TIMEOUT_MS = 8_000;

type CreateEventGraphResolverProps = {
  eventResolver: EventResolver;
  nowMs: () => number;
};

type QueueEntry = {
  edges: EventReferenceEdge[];
  depth: number;
};

type BoundedPolicy = {
  includeThread: boolean;
  includeEmbeds: boolean;
  includeInteractions: boolean;
  includeReplies: boolean;
  maxDepth: number;
  maxEvents: number;
  maxReferencesPerEvent: number;
  timeoutMs: number;
};

type TargetOutcome = {
  event: NostrEvent | null;
  missing: Omit<MissingEventReference, 'edge'> | null;
};

export type EventGraphResolver = {
  resolveGraph: (props: ResolveEventGraphProps) => Promise<ResolvedEventGraph>;
};

function boundedInteger(value: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return maximum;
  }

  return Math.max(0, Math.min(Math.trunc(value), maximum));
}

function targetKey(target: EventReferenceTarget): string {
  return target.type === 'event'
    ? `event:${target.eventId}`
    : `address:${target.kind}:${target.pubkey}:${target.identifier}`;
}

function edgeKey(edge: EventReferenceEdge): string {
  return `${edge.sourceEventId}:${edge.role}:${targetKey(edge.target)}`;
}

function roleEnabled(role: EventReferenceRole, policy: BoundedPolicy): boolean {
  if (role === 'thread-root' || role === 'thread-parent') {
    return policy.includeThread;
  }

  if (role === 'embed') {
    return policy.includeEmbeds;
  }

  if (role === 'reply-target') {
    return policy.includeReplies;
  }

  return policy.includeInteractions;
}

function missingReason(
  diagnostic: ResolutionDiagnostic,
): MissingEventReference['reason'] {
  if (diagnostic.code === 'deadline') {
    return 'deadline';
  }

  if (diagnostic.code === 'network-failed') {
    return 'network-failed';
  }

  return 'missing';
}

export function createEventGraphResolver({
  eventResolver,
  nowMs,
}: CreateEventGraphResolverProps): EventGraphResolver {
  async function resolveGraph({
    rootEvents,
    contextRelays,
    fallbackRelays,
    policy: inputPolicy,
    deadlineAtMs,
  }: ResolveEventGraphProps): Promise<ResolvedEventGraph> {
    const policy: BoundedPolicy = {
      ...inputPolicy,
      maxDepth: boundedInteger(inputPolicy.maxDepth, MAX_GRAPH_DEPTH),
      maxEvents: boundedInteger(inputPolicy.maxEvents, MAX_GRAPH_EVENTS),
      maxReferencesPerEvent: boundedInteger(
        inputPolicy.maxReferencesPerEvent,
        MAX_GRAPH_REFERENCES_PER_EVENT,
      ),
      timeoutMs: boundedInteger(inputPolicy.timeoutMs, MAX_GRAPH_TIMEOUT_MS),
    };

    const effectiveDeadlineAtMs = Math.min(
      deadlineAtMs,
      nowMs() + policy.timeoutMs,
    );

    const eventsById = new Map<string, NostrEvent>();
    const edgesByKey = new Map<string, EventReferenceEdge>();
    const missing: MissingEventReference[] = [];
    const missingKeys = new Set<string>();
    const expandedEventIds = new Set<string>();
    const queuedTargets = new Map<string, QueueEntry>();
    const outcomes = new Map<string, TargetOutcome>();
    const queue: QueueEntry[] = [];

    for (const event of rootEvents) {
      if (eventsById.size >= policy.maxEvents) {
        break;
      }

      eventsById.set(event.id, event);
    }

    function addMissing(
      edge: EventReferenceEdge,
      outcome: Omit<MissingEventReference, 'edge'>,
    ): void {
      const key = edgeKey(edge);

      if (missingKeys.has(key)) {
        return;
      }

      missingKeys.add(key);
      missing.push({ edge, ...outcome });
    }

    function enqueueReferences(event: NostrEvent, depth: number): void {
      if (expandedEventIds.has(event.id)) {
        return;
      }

      expandedEventIds.add(event.id);

      const parsedReferences = parseEventReferences(event);

      const references = [
        ...parsedReferences.filter((edge) => roleEnabled(edge.role, policy)),
        ...parsedReferences.filter((edge) => !roleEnabled(edge.role, policy)),
      ].slice(0, policy.maxReferencesPerEvent);

      for (const edge of references) {
        edgesByKey.set(edgeKey(edge), edge);

        if (!roleEnabled(edge.role, policy) || depth >= policy.maxDepth) {
          continue;
        }

        if (
          edge.target.type === 'event' &&
          eventsById.has(edge.target.eventId)
        ) {
          continue;
        }

        const key = targetKey(edge.target);
        const outcome = outcomes.get(key);

        if (outcome) {
          if (outcome.missing) {
            addMissing(edge, outcome.missing);
          }

          continue;
        }

        const queued = queuedTargets.get(key);

        if (queued) {
          queued.edges.push(edge);
          continue;
        }

        const entry = { edges: [edge], depth: depth + 1 };

        queuedTargets.set(key, entry);
        queue.push(entry);
      }
    }

    for (const event of eventsById.values()) {
      enqueueReferences(event, 0);
    }

    while (
      queue.length > 0 &&
      eventsById.size < policy.maxEvents &&
      nowMs() < effectiveDeadlineAtMs
    ) {
      const entry = queue.shift()!;
      const firstEdge = entry.edges[0]!;
      const key = targetKey(firstEdge.target);

      queuedTargets.delete(key);

      const relayHints = [
        ...new Set(entry.edges.flatMap((edge) => edge.relayHints)),
      ];

      const authorPubkey = entry.edges.find(
        (edge) =>
          edge.target.type === 'event' && edge.target.authorPubkey !== null,
      )?.target;

      const result =
        firstEdge.target.type === 'event'
          ? await eventResolver.resolveEventById({
              eventId: firstEdge.target.eventId,
              authorPubkey:
                authorPubkey?.type === 'event'
                  ? authorPubkey.authorPubkey
                  : firstEdge.target.authorPubkey,
              relayHints,
              contextRelays,
              fallbackRelays,
              deadlineAtMs: effectiveDeadlineAtMs,
            })
          : await eventResolver.resolveReplaceableEvent({
              kind: firstEdge.target.kind,
              pubkey: firstEdge.target.pubkey,
              identifier: firstEdge.target.identifier,
              relayHints,
              contextRelays,
              fallbackRelays,
              refreshMode: 'stale-while-revalidate',
              refreshIntervalMs: DEFAULT_REPLACEABLE_REFRESH_INTERVAL_MS,
              deadlineAtMs: effectiveDeadlineAtMs,
            });

      if (!result.event) {
        const missingOutcome = {
          reason: missingReason(result.diagnostic),
          diagnostic: result.diagnostic,
        };

        outcomes.set(key, { event: null, missing: missingOutcome });

        for (const edge of entry.edges) {
          addMissing(edge, missingOutcome);
        }

        continue;
      }

      outcomes.set(key, { event: result.event, missing: null });

      if (!eventsById.has(result.event.id)) {
        eventsById.set(result.event.id, result.event);
      }

      enqueueReferences(result.event, entry.depth);
    }

    if (nowMs() >= effectiveDeadlineAtMs) {
      const deadlineOutcome = {
        reason: 'deadline' as const,
        diagnostic: {
          code: 'deadline' as const,
          attemptedGroups: 0,
        },
      };

      for (const entry of queue) {
        for (const edge of entry.edges) {
          addMissing(edge, deadlineOutcome);
        }
      }
    }

    return {
      events: [...eventsById.values()],
      edges: [...edgesByKey.values()],
      missing,
    };
  }

  return { resolveGraph };
}
