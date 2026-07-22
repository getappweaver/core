# Nostr Event Resolution, References, Relays, and Caching

Status: active implementation; shared cache and NR adoption complete

Implementation plan:
[NOSTR_EVENT_RESOLUTION_IMPLEMENTATION_PLAN.md](./NOSTR_EVENT_RESOLUTION_IMPLEMENTATION_PLAN.md)

This document captures the design direction for consistently resolving Nostr
events and their relationships across AppWeaver. The cache, relay selection,
event resolution, reference parsing, graph traversal, shared service, bounded
web API, first browser consumer, and NR/WoT cache adoption are implemented;
remaining interaction migrations are described in the implementation plan.

## Implementation Status

As of 2026-07-16, Phases 1 through 7 of the implementation plan are complete:

- A dedicated bounded `nostr-cache.sqlite` database stores immutable and
  replaceable events separately.
- Cache reads and writes validate event shape, ID, signature, requested ID, and
  replaceable address.
- Relay candidates are returned as ordered groups with source provenance,
  blocked-relay filtering, input caps, request concurrency limits, and one
  absolute deadline.
- Kind 10002 NIP-65 discovery uses the replaceable cache and coalesces concurrent
  refreshes.
- `resolveEventById()` and `resolveReplaceableEvent()` provide cache-first exact
  ID and replaceable-address resolution.
- Replaceable freshness supports stale-while-revalidate, require-fresh,
  throttled/coalesced checks, bounded NIP-45 COUNT when injected, and latest-event
  fallback.
- Equal-timestamp replaceable events follow NIP-01 ordering: the lower event ID
  wins.
- Generic reference parsing covers NIP-10, NIP-22, NIP-21 event and address
  references, quote tags, reposts, and reactions while preserving semantic
  edge roles.
- Bounded breadth-first graph traversal resolves event IDs and replaceable
  addresses through their separate resolver methods, preserves cycles and
  missing branches, and enforces depth, event, reference, and deadline limits.
- One `NostrResolutionService` instance exposes event, address, graph, author,
  and seeding operations to plugins and authenticated web routes.
- `POST /api/nostr/profile-posts` validates strict bounded transport schemas and
  applies fixed relay, post-count, graph, body-size, and deadline limits.
- Service shutdown aborts and awaits bounded in-flight work before closing the
  cache database; application shutdown then destroys the shared relay pool.
- Profile Latest Posts uses the authenticated server endpoint for primary posts,
  thread context, and NIP-21 references while retaining separate browser profile
  metadata lookup during the transition.
- Resolved `note`, `nevent`, and `naddr` references are rendered from typed graph
  edges; missing event references remain visible as safe raw content.
- WoT kind 0, 3, and 10002 complete event JSON is lazily moved into the shared
  replaceable cache while parsed profile, follow, relay, ID, and timestamp state
  remains durable in the core database.
- NR profile and fetch-latest resolution use the shared service; all writes store
  compact context IDs, and list rendering resolves only those IDs with a short
  cache-oriented deadline.
- A backup-first one-time migration seeds complete context into the shared cache,
  then compacts existing NR context without altering classification, read,
  archive, interaction, or interest state.
- NR list rendering returns cached profile metadata immediately and refreshes
  missing profiles in the background; Profile Latest Posts waits for its
  foreground author refresh rather than returning a partial stale subset.
- NR feed relay routing is assembled from compact WoT state and fresh shared
  kind 10002 cache entries without network waits. Stale or missing relay lists
  refresh after feed processing in sequential batches of up to 50 authors.
- Fetched feed events are seeded before classification graph traversal. Remaining
  graph-time NIP-65 misses are serialized, transient relay overloads cool down
  for one minute, and individual AI classifications abort after two minutes.

Reply-modal and interaction consumer migrations remain later phases.

Single-profile WoT lookups use the shared replaceable resolver's cache, relay
filtering, freshness throttling, and in-flight coalescing. Feed-wide relay-list
lookups use a separate bounded batch operation so different authors do not
produce simultaneous per-author kind 10002 REQs.

## Motivation

Several surfaces independently fetch and render related Nostr events:

- Regular NR timeline
- For You
- Archive
- NR profile mode
- Shared profile panel latest posts
- Reply modal
- Repost, reaction, and reply actions

The relationships involved are different even when they all ultimately point
to another event:

- NIP-10 thread roots and parents
- NIP-22 comment roots and parents
- NIP-21 content embeds (`nostr:note`, `nostr:nevent`, and `nostr:naddr`)
- Quote tags
- Reply targets
- Reaction targets
- Repost targets

Fetching and rendering these independently has produced inconsistent behavior.
For example, NR can fetch NIP-21 references for its profile feed, while the
shared profile panel currently leaves the same `nostr:nevent` references as raw
text.

Complex combinations also become ambiguous if all related events are flattened
into one array. A repost target can itself be a reply with an embedded note. We
need to preserve those relationships rather than treating every fetched event
as generic context.

## Architectural Boundary

Generic Nostr resolution should live under `src/nostr/`, not under
`plugins/nr/`. Core and web code must remain plugin-agnostic, while NR should be
able to consume the same resolver through a core service.

Candidate modules:

```text
src/nostr/event-cache.ts
src/nostr/relay-resolver.ts
src/nostr/event-references.ts
src/nostr/event-resolver.ts
src/nostr/event-graph.ts
```

The service should be available to plugins through `PluginContext`. Web actions
should call a server API or WebSocket operation instead of implementing their
own browser-side `SimplePool` resolution when they need access to the local
cache.

## Separate Responsibilities

### Reference Parsing

Reference parsing should be pure and identify the semantic role of every edge.

```ts
type EventReferenceRole =
  | 'thread-root'
  | 'thread-parent'
  | 'embed'
  | 'reply-target'
  | 'reaction-target'
  | 'repost-target';
```

The parser should understand:

- NIP-10 `e` tags and root/reply markers
- NIP-22 uppercase and lowercase root/parent tags
- NIP-21 `note`, `nevent`, and `naddr` references
- `q` quote tags
- Kind 6 and kind 16 repost targets
- Kind 7 reaction targets

### Event Resolution

The event resolver should resolve IDs without making presentation decisions:

1. Deduplicate requested IDs.
2. Check the local event cache first.
3. Resolve relay candidates for cache misses.
4. Fetch with strict concurrency, timeout, depth, and event-count limits.
5. Validate fetched events before caching them.
6. Return both resolved and missing references with diagnostics.

### Event Graph

Resolved relationships should be represented as typed edges, not duplicated
full events inside parent JSON fields.

```ts
type ResolvedEventGraph = {
  eventsById: Map<string, NostrEvent>;
  edges: EventReferenceEdge[];
  missing: MissingEventReference[];
};
```

For example:

```text
repost
  -> repost-target
      -> thread-parent
      -> embed
```

This lets renderers consistently decide that the repost target is the primary
post, the thread parent is reply context, and the NIP-21 reference is an embed.

## Surface Policies

All surfaces should use the same resolver with explicit traversal policies.

```ts
type EventResolutionPolicy = {
  includeThread: boolean;
  includeEmbeds: boolean;
  includeInteractions: boolean;
  includeReplies: boolean;
  maxDepth: number;
  maxEvents: number;
};
```

Suggested policies:

| Surface | Resolution behavior |
| --- | --- |
| Timeline | Shallow thread context and content embeds |
| Reply modal | Parent/root chain and embeds for visible events |
| Profile latest posts | Reply context and content embeds |
| For You | Resolve during ingestion and reuse cached graph data |
| Archive | Prefer cache-only resolution; optionally fetch missing context |
| Repost | Resolve target, then apply thread/embed policy to that target |
| Reaction | Resolve target without treating it as thread context |

Replies are reverse references and require a `#e` or NIP-22 query. The graph
model should support `reply-target` edges, but recursive reply discovery can
remain disabled for now. A future reply modal can explicitly request one level
of direct replies with `includeReplies: true` and a separate reply-depth limit.

## Relay Resolution

A central relay resolver is required because relay hints and NIP-65 knowledge
must travel with resolved events.

For fetching an authored event, the author's NIP-65 write relays are relevant.
The author's read relays are primarily useful when publishing something they
should receive, such as a reply.

Relay candidates should retain their provenance and priority:

```ts
type ResolvedRelay = {
  url: string;
  sources: Array<
    | 'nevent-hint'
    | 'tag-hint'
    | 'cached-event'
    | 'cached-nip65'
    | 'fetched-nip65'
    | 'context'
    | 'fallback'
  >;
  priority: number;
};
```

Suggested lookup order:

1. Explicit hints from `nevent`, `nprofile`, `naddr`, `e`, `q`, or `a` tags.
2. Relays previously associated with the cached event.
3. Cached NIP-65 write relays for the author.
4. Fetch kind 10002 when the NIP-65 cache is missing or stale.
5. Context relays from the containing feed or profile.
6. Global fallback and discovery relays.

The resolver should normalize and deduplicate URLs, filter blocked read relays,
and try higher-confidence groups before broad fallbacks. It should not broadcast
every lookup to every known relay.

NIP-65 kind 10002 events use the same replaceable-event cache strategy as kinds
0, 3, and parameterized replaceable events. Relay hints should remain attached
to cached rows and graph nodes so subsequent reply, repost, reaction, and
profile actions do not restart discovery.

## Cache-First Resolution

The core `seen_events` table is not an event cache; it only tracks processed DM
events. NR has a plugin-local event cache, and WoT already has a relay-list
cache, but browser actions and the generic NIP-65 helpers currently bypass parts
of that cached data.

A future core resolution service should provide two cache-aside lookup
strategies.

Regular event lookup by immutable ID:

1. Look up the event ID locally.
2. Return immediately when found.
3. Resolve relay candidates on a miss.
4. Fetch and validate the event.
5. Insert it into the regular-event cache and return it.

Replaceable lookup by `(kind, pubkey, identifier)`:

1. Normalize an absent identifier to an empty string.
2. Look up the replaceable row locally.
3. On a hit, update access time and return immediately.
4. When the refresh interval has elapsed, schedule a coalesced background
   freshness check.
5. On a miss, resolve relays, fetch the latest matching event, insert it, and
   return it.

The background freshness check should use NIP-45 COUNT with
`since: cached.created_at + 1` when supported. If COUNT is unsupported or fails,
fetch one latest matching event and compare it with the cached event. A newer
valid event replaces the row and its metadata. If COUNT reports one or more
newer events, fetch the latest matching event, compare it, and then replace the
row.

Replaceable fetches must collect bounded responses through EOSE or the request
deadline and choose the newest matching event using NIP-01 ordering. They cannot
stop at the first valid response because different relays may hold different
versions.

### Separate Resolver APIs

The two strategies should have separate TypeScript methods and props types. A
single union API would permit invalid combinations such as an immutable event ID
with refresh settings or a replaceable address without an author.

```ts
type ResolveEventByIdProps = {
  eventId: string;
  authorPubkey: string | null;
  relayHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  deadlineAtMs: number;
};

type ResolveReplaceableEventProps = {
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
```

The public replaceable API uses `identifier: null` when no `d` tag applies. The
cache store normalizes that value to `''`.

```ts
type ResolvedEvent = {
  event: NostrEvent | null;
  source: 'cache' | 'network' | 'missing';
  relayHints: string[];
};

type ResolvedReplaceableEvent = ResolvedEvent & {
  refresh:
    | 'not-due'
    | 'scheduled'
    | 'coalesced'
    | 'completed'
    | 'failed';
};
```

`resolveEventById()` returns `ResolvedEvent`.
`resolveReplaceableEvent()` returns `ResolvedReplaceableEvent`. Graph traversal
dispatches event-ID targets to the first method and address targets to the
second method.

`stale-while-revalidate` returns a cache hit immediately and refreshes in the
background when due. `require-fresh` waits for the due freshness check within
the supplied deadline, while retaining the cached event as a fallback if relays
fail.

NR has existing persisted data, so migration must preserve it. NR can lazily
seed existing events into the cache while moving consumers to the shared fetch
strategy incrementally.

## Storage Model

The shared resolver cache must be bounded and safe to miss. Relays remain the
source of truth; a cache miss triggers relay resolution and network fetching.

### Measured Baseline

At the time this proposal was written, the local NR database contained 925
events:

- Average raw event JSON: 853 bytes
- Average thread-context JSON: 1,024 bytes
- Average referenced-events JSON: 343 bytes
- Largest raw event JSON: 6.5 KiB
- Total SQLite database size: approximately 7.3 MiB

This is roughly 8 KiB per event across events, repeated context, indexes,
classifications, and supporting tables. At that shape, 100,000 events could
approach 800 MiB. The largest avoidable cost is repeatedly embedding complete
events in `thread_context_json` and `referenced_events_json`.

### Two Cache Tables

Regular events are keyed by immutable event ID:

```text
nostr_events
  event_id TEXT PRIMARY KEY
  event_json TEXT NOT NULL
  pubkey TEXT NOT NULL
  kind INTEGER NOT NULL
  created_at INTEGER NOT NULL
  relay_hints_json TEXT NOT NULL
  size_bytes INTEGER NOT NULL
  cached_at INTEGER NOT NULL
  last_accessed_at INTEGER NOT NULL
```

Replaceable events are keyed directly by replaceable address and store their
current event JSON independently from `nostr_events`:

```text
nostr_replaceable_events
  kind INTEGER NOT NULL
  pubkey TEXT NOT NULL
  identifier TEXT NOT NULL DEFAULT ''
  event_id TEXT NOT NULL
  event_json TEXT NOT NULL
  created_at INTEGER NOT NULL
  relay_hints_json TEXT NOT NULL
  size_bytes INTEGER NOT NULL
  cached_at INTEGER NOT NULL
  last_accessed_at INTEGER NOT NULL
  last_checked_at INTEGER NOT NULL
  PRIMARY KEY (kind, pubkey, identifier)
```

Conceptually the identifier is optional. SQLite storage normalizes a missing
identifier to `''` because nullable columns in composite uniqueness constraints
can permit duplicate null-address rows.

Address examples:

- Kind 0: `(0, pubkey, '')`
- Kind 3: `(3, pubkey, '')`
- Kind 10002: `(10002, pubkey, '')`
- Parameterized replaceable event: `(kind, pubkey, d-tag)`

The replaceable table covers kinds 0 and 3, regular replaceable kinds
10000-19999, and parameterized replaceable kinds 30000-39999. Ephemeral kinds
20000-29999 should not be persisted in either cache table.

Cache placement follows the requested lookup strategy. Replaceable events are
expected to be requested by address, not immutable ID. If a replaceable event
is exceptionally fetched through the ID strategy, return the validated network
result without inserting it into `nostr_events`; this avoids duplicating the
replaceable row across both tables.

Reference graph edges remain an in-memory resolution result initially. They do
not require another cache table.

### Consumer State

WoT, profiles, NIP-65, NR, and addressable-event consumers may retain compact
application-specific state such as IDs, timestamps, parsed profile fields,
relay sets, classifications, read/archive status, content, and relationship
IDs. Complete fetched event JSON is retrieved through the shared cache layer.

Consumers must tolerate eviction: when a row is absent, the resolver fetches it
again. Data that must remain usable without relays is a separate offline-storage
feature and is not part of the initial cache design.

### Initial Limits

Reasonable initial defaults:

- Maximum combined cache size: 250 MiB
- Maximum combined event count: 100,000
- Prune to 80 percent when either limit is exceeded
- Evict globally least-recently-used rows across both tables
- Update `last_accessed_at` whenever an event is returned to a consumer
- Expire untouched rows after 30 days
- Reject or skip event payloads larger than 64 or 128 KiB
- Retain at most eight normalized relay hints per row
- Never cache media bodies, only their URLs

The byte limit is more important than event count because long-form and unusual
events can be significantly larger than ordinary notes.

Replaceable rows should use explicit refresh intervals and coalesce concurrent
background checks for the same address. A cache hit returns immediately; the
freshness check does not block rendering.

An initial 15-minute refresh interval is reasonable. It can become
kind-specific later if profiles, contact lists, relay lists, and addressable
content need different freshness policies.

### SQLite Maintenance

Deleting rows makes pages reusable but does not necessarily shrink the visible
database file. A dedicated cache database would keep cache maintenance isolated
from sessions, settings, and other critical state.

Maintenance should include:

- WAL checkpoints at appropriate maintenance points
- Periodic `PRAGMA optimize`
- Incremental auto-vacuum for a newly created cache database
- Infrequent or user-initiated full `VACUUM`
- User-visible cache size, event count, configured limit, and clear-cache action

## Deferred Migration Plan

1. Add the two bounded cache tables and shared LRU maintenance.
2. Add a cached NIP-65 relay resolver.
3. Add cache-first regular and replaceable fetch strategies.
4. Move generic reference parsing from NR into `src/nostr/`.
5. Add typed event-graph edges and traversal policies.
6. Expose the resolver to plugins and web consumers.
7. Fix shared Profile Latest Posts using the service.
8. Migrate the reply modal.
9. Migrate NR profile fetching and `fetch-latest` incrementally.
10. Replace duplicated full-event context in NR with IDs and typed edges where
    consumers can tolerate cache misses and refetching.
11. Update Timeline, For You, and Archive renderers to consume the graph.

The first implementation slice does not need to solve every graph combination.
A bounded two-table cache, relay resolver, both fetch strategies, and Profile
Latest Posts migration would provide immediate value while establishing the
correct shared boundary.
