# Nostr Event Resolution Implementation Plan

Status: in progress; Phases 1-7 complete

Related design: [NOSTR_EVENT_RESOLUTION.md](./NOSTR_EVENT_RESOLUTION.md)

## Goal

Introduce one cache-first, relay-aware Nostr event resolution service for core,
web, and plugins. Migrate consumers incrementally, beginning with the shared
Profile Latest Posts panel, without requiring an immediate rewrite of NR.

The service must:

- Check a bounded local cache before making network requests.
- Resolve relay candidates from explicit hints, cached data, NIP-65, context,
  and fallbacks.
- Preserve semantic relationships such as thread parent, embed, reaction
  target, and repost target.
- Enforce strict network and graph traversal budgets.
- Keep temporary cache data separate from durable application state.
- Avoid importing plugin code from `src/` or `web/`.
- Consolidate complete WoT, profile, contact-list, NIP-65, and addressable event
  JSON into the shared cache over time.

## Implementation Progress

Completed on 2026-07-16:

- Phase 1: dedicated bounded cache, schema, validation, store operations,
  maintenance, lifecycle wiring, and in-memory tests.
- Phase 2: ordered relay groups, provenance, blocked/invalid relay filtering,
  cached NIP-65 bootstrap, deadlines, concurrency limits, coalescing, and tests.
- Phase 3: cache-first immutable and replaceable resolvers, injected cache and
  network adapters, bounded subscriptions and COUNT, freshness modes,
  coalescing/throttling, diagnostics, and tests.
- Phase 4: generic NIP-10, NIP-22, NIP-21, quote, repost, and reaction parsing;
  typed event/address targets; and bounded breadth-first in-memory graphs.
- Phase 5: shared service construction and lifecycle, plugin/web context
  exposure, bounded author queries and seeding, transport schemas, and an
  authenticated profile-posts endpoint.
- Phase 6: Profile Latest Posts endpoint adoption, typed thread/embed rendering,
  referenced-author metadata lookup, relay-hint preservation, and regressions.
- Phase 7: WoT replaceable-cache migration, resolver-backed profile/contact/relay
  state, NR profile/fetch-latest graph adoption, lazy seeding, and compact
  context hydration. The runtime follow-up also made relay-author map assembly
  cache-only and moved stale or missing kind 10002 refreshes after feed work in
  sequential multi-author batches.

Current implementation files:

```text
src/nostr/cache/db.ts
src/nostr/cache/schema.ts
src/nostr/cache/store.ts
src/nostr/cache/maintenance.ts
src/nostr/event-resolution-types.ts
src/nostr/event-references.ts
src/nostr/event-resolver.ts
src/nostr/event-graph.ts
src/nostr/relay-resolver.ts
src/nostr/resolution-service.ts
src/nostr/wot-service.ts
src/nostr/wot.ts
src/web/nostr-resolution-schema.ts
src/web/routes.ts
web/src/nostr/profileAction.ts
plugins/nr/nostr-resolution.ts
plugins/nr/commands/list/profile-events.ts
plugins/nr/commands/fetch-latest/adapter.ts
```

Tests are colocated beside the implementation files. After the Phase 7 relay and
classification hardening follow-up, all 105 repository tests passed; the
standalone NR repository's eight tests also passed. Repository-wide ESLint and
both patch checks were clean.

Important implementation decisions:

- Relay groups are ordered `explicit`, `cached`, `nip65-write`, `context`, then
  `fallback`. Duplicate relays remain in their earliest group while accumulating
  provenance.
- Resolution is capped at five groups, eight relays per group, 24 unique relays,
  four concurrent requests, and one absolute eight-second deadline.
- NIP-01 equal-timestamp replaceable ordering keeps the lower event ID.
- The installed `SimplePool` has no safe bounded pool-level COUNT API. COUNT is
  therefore an injected bounded capability; when unavailable or failed, the
  resolver fetches and compares latest events.
- COUNT and fallback fetching share the same 24-attempt budget. Groups are
  counted and, when needed, fetched immediately in priority order. Freshness is
  recorded only when every selected group is covered within the budget.
- Shared-pool relay connections are never closed by one resolution operation;
  only its subscriptions are closed.
- Profile Latest Posts, WoT, and NR profile/fetch-latest paths use the shared
  resolver. Reply-modal and interaction migrations remain later phases.
- Graph traversal is breadth-first and deduplicates resolution work by typed
  target while retaining distinct semantic roles and branch-local missing
  diagnostics.
- Author queries use bounded in-memory stale-while-revalidate freshness and
  coalesce concurrent refreshes while persisting complete events in the shared
  cache.
- Setup-only mode exposes a nullable web context service and returns a controlled
  unavailable response without opening the Nostr cache.
- Browser graph conversion matches exact NIP-21 tokens to typed edges, uses
  semantic thread roles for reply context, and leaves unresolved event tokens
  untouched for safe fallback rendering.
- WoT legacy payloads seed before conditional clearing, preserve their prior
  freshness timestamps, and keep monotonic derived state using NIP-01 ordering.
- NR rows persist compact context IDs after a backup-first one-time migration;
  list views resolve only those IDs with a short shared-cache deadline.
- Missing NR profile metadata refreshes in the background, and Profile Latest
  Posts requires a foreground author refresh before returning results.
- WoT relay-author maps project kind 10002 events already present in the shared
  cache without starting network work. NR starts post fetching from that cached
  map and defers stale or missing relay-list refresh until feed processing ends.
- Deferred replaceable refreshes use one shared deadline and sequential chunks
  of at most 50 authors per REQ. Only complete EOSE responses advance freshness.
- NR pre-seeds every fetched event and its observed relay hints before resolving
  classification graphs, so references already present in the feed batch never
  restart author or NIP-65 discovery.
- Graph-time NIP-65 discovery is globally serialized and requests one latest
  relay-list candidate per author. Relay overload notices apply a one-minute
  cooldown instead of permanently suppressing a transiently busy relay.
- Each fetch-latest AI classification has an abortable two-minute deadline, so a
  stalled backend records a failed event and cannot stop the remaining feed.

## Non-Goals For The First Release

- Recursive reply discovery.
- Displaying complete reply trees.
- Migrating every NR table in one release.
- Persisting every parsed graph edge immediately.
- Removing NR's existing context JSON columns immediately.
- Caching media bodies.
- Building a general-purpose relay crawler.
- Persistently caching replaceable events requested through an immutable-ID
  lookup. Replaceable consumers are expected to use address resolution.

## Decisions

### Dedicated Cache Database

Use a separate `nostr-cache.sqlite` database in the AppWeaver root. Do not add
ephemeral event data to the core state database.

Reasons:

- Cache cleanup cannot damage sessions, settings, timelines, or credentials.
- Cache-specific WAL checkpoints and vacuum behavior remain isolated.
- The file can be cleared and rebuilt from relays without damaging
  application-specific IDs, timestamps, classifications, or user state.
- Size accounting is straightforward.

### Server-Side Resolution

The resolver runs in the bot process, borrows the application-wide
`SimplePool`, and owns the cache database. Browser actions call a web API
instead of directly implementing cache-aware resolution.

One resolver instance is created in `src/index.ts` and passed to:

- `PluginContext` for plugins.
- `WebRouteContext` for HTTP consumers.
- Future WebSocket handlers if streaming resolution becomes necessary.

### Two Fetch Strategies

Regular events are cached by immutable event ID. A hit returns immediately and
updates access time. A miss resolves relays, fetches and validates the event,
inserts it, and returns it.

Replaceable events are cached separately by `(kind, pubkey, identifier)`, with
their complete current event JSON in that row. A hit returns immediately,
updates access time, and schedules a throttled background freshness check. A
miss fetches the latest matching event, inserts it, and returns it.

Kinds 0, 3, and 10002 use an empty identifier. Parameterized replaceable events
use the `d` tag. Existing WoT tables may retain parsed values, IDs, and
timestamps, but complete signed event JSON should move to the replaceable cache.

The replaceable table covers kinds 0 and 3, kinds 10000-19999, and
parameterized replaceable kinds 30000-39999. Ephemeral kinds 20000-29999 are
returned from network resolution without being persisted in either table.

### In-Memory Graph First

The graph implementation computes typed edges from cached events and returns
them in memory. The initial cache schema remains limited to the two event
tables; graph persistence is not part of this plan.

This avoids committing to a large graph schema before the consumers agree on
the relationship model.

## Proposed File Layout

```text
src/nostr/cache/db.ts
src/nostr/cache/schema.ts
src/nostr/cache/store.ts
src/nostr/cache/maintenance.ts
src/nostr/event-references.ts
src/nostr/event-resolver.ts
src/nostr/event-resolution-types.ts
src/nostr/relay-resolver.ts
src/nostr/resolution-service.ts
src/web/nostr-resolution-schema.ts
src/web/routes.ts
web/src/nostr/profileAction.ts
plugins/nr/...
```

Tests should live beside the implementation files using `*.test.ts`.

## Core Types

All functions taking more than two parameters must use named object parameter
types, with explicit `null` where a value is absent.

```ts
type EventReferenceRole =
  | 'thread-root'
  | 'thread-parent'
  | 'embed'
  | 'reply-target'
  | 'reaction-target'
  | 'repost-target';

type EventReferenceEdge = {
  sourceEventId: string;
  role: EventReferenceRole;
  target:
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
  relayHints: string[];
};

type EventResolutionPolicy = {
  includeThread: boolean;
  includeEmbeds: boolean;
  includeInteractions: boolean;
  includeReplies: boolean;
  maxDepth: number;
  maxEvents: number;
  maxReferencesPerEvent: number;
  timeoutMs: number;
};

type ResolvedEventGraph = {
  events: NostrEvent[];
  edges: EventReferenceEdge[];
  missing: MissingEventReference[];
};

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

Use serializable arrays in transport schemas. Convert them to `Map` instances
only inside server or renderer code.

Address references are represented separately from event-ID references and are
resolved through `resolveReplaceableEvent()` using `(kind, pubkey, identifier)`.
They must not be forced through the event-ID resolver.

## Phase 1: Cache Foundation (Completed)

### Work

1. Add `NOSTR_CACHE_DB_PATH` to `src/paths.ts`.
2. Ignore the runtime database, WAL, and shared-memory files in `.gitignore`.
3. Define a canonical core Zod event schema and branded cache database type.
4. Add `openNostrCacheDb()` with WAL, foreign keys, and busy timeout.
5. Create the regular-event and replaceable-event cache tables.
6. Add validated regular get/put, replaceable get/upsert, touch, stats, and
   delete operations.
7. Add bounded maintenance and LRU pruning.
8. Add startup and shutdown lifecycle wiring in `src/index.ts`.

### Initial Schema

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

Do not persist full graph edges in this phase.

Add an index on `(pubkey, kind, created_at DESC)` so author queries can
merge cached and network results efficiently. Phase 1 store operations must
include bounded author/kind queries and pagination, not only ID lookups.

The identifier is conceptually optional but stored as `''` when absent. SQLite
composite uniqueness with nullable columns can otherwise permit duplicate rows
for the same non-parameterized address.

Replacing a row must compare `created_at` and the NIP-01 deterministic event-ID
tie-break. Older events never replace the current cached address.

### Limits

- Default maximum combined event payload: 250 MiB.
- Default maximum combined event count: 100,000.
- Prune to 80 percent of both limits.
- Maximum accepted serialized event size: 128 KiB.
- Maximum normalized relay hints retained per row: eight.
- Evict globally oldest `last_accessed_at` rows across both tables.

Run maintenance after bounded insertion batches and at startup when over limit,
not on every event read.

### Validation

- Parse the event shape.
- Verify event ID and signature before insertion.
- Confirm the requested ID matches the event ID.
- For replaceable inserts, confirm kind, pubkey, and normalized identifier match
  the requested address.
- Normalize pubkeys and IDs to lowercase hex.
- Reject oversized or invalid events without caching them.

### Tests

- Insert and retrieve a valid event.
- Reject invalid ID and signature combinations.
- Touch updates access time without rewriting JSON.
- LRU pruning orders candidates across both tables.
- Relay hints are normalized, merged, deduplicated, and capped.
- Cache statistics report bytes and rows per table and combined.
- Author/kind queries are indexed, sorted, paginated, and deduplicated.
- Replaceable kinds route only to `nostr_replaceable_events`.
- A replaceable event exceptionally fetched by ID is returned without persistent
  insertion, avoiding duplicate JSON across both tables.
- Ephemeral kinds return without persistent insertion.
- Older replaceable events never displace newer rows, regardless of insertion
  order.
- Missing identifiers normalize to one unique empty-string address.

### Acceptance Criteria

- Cache database can be deleted without affecting core state.
- Tests use in-memory SQLite and do not touch the real cache.
- Maintenance can evict rows from either table and prune to its target.
- No network behavior changes yet.

## Phase 2: Relay Resolver (Completed)

### Work

1. Add `src/nostr/relay-resolver.ts`.
2. Reuse `normalizeRelay`, `uniqueRelays`, and blocked-relay filtering.
3. Consult cached event hints before NIP-65 discovery.
4. Resolve kind 10002 through the replaceable-event cache.
5. Bootstrap missing kind 10002 events from explicit, context, and profile
   discovery relays without recursively requiring NIP-65.
6. Return ordered relay groups with provenance instead of one unexplained union.

The kind 10002 bootstrap uses a low-level bounded relay query plus Phase 1 cache
operations. It does not depend on the higher-level resolver introduced in Phase
3, avoiding a relay-resolver cycle.

### Relay Input

```ts
type ResolveEventRelaysProps = {
  eventId: string | null;
  replaceableAddress: {
    kind: number;
    pubkey: string;
    identifier: string;
  } | null;
  authorPubkey: string | null;
  explicitHints: string[];
  contextRelays: string[];
  fallbackRelays: string[];
  deadlineAtMs: number;
};
```

### Priority

1. Explicit NIP-19 and tag hints.
2. Cached hints associated with the event ID or replaceable address.
3. NIP-65 write relays parsed from cached kind 10002.
4. Context relays.
5. Global fallback relays.

Fetching an author's event uses the author's write relays. Publishing a reply
or interaction may separately use the recipient's read relays.

Do not claim a relay returned an event unless the underlying subscription API
provides that provenance. Store provided and attempted hints accurately.

Initial hard limits:

- At most eight explicit hints and eight caller fallbacks.
- At most five ordered relay groups.
- At most eight relays in one group and 24 unique relays total.
- At most four concurrent event requests.
- One absolute eight-second deadline for a single graph request.

### Tests

- Explicit hints win over fallback relays.
- Cached NIP-65 avoids a network lookup while fresh.
- Stale NIP-65 refreshes once.
- Missing author falls back without NIP-65 lookup.
- Blocked and invalid relay URLs are removed.
- Duplicate URLs from different sources retain combined provenance.
- Relay discovery respects the same absolute deadline as event fetching.

### Acceptance Criteria

- The resolver never returns invalid or blocked read relays.
- NIP-65 freshness checks are throttled and deduplicated for concurrent requests
  by pubkey.
- A failed NIP-65 lookup still returns bounded fallback candidates.

## Phase 3: Regular And Replaceable Event Resolver (Completed)

### Work

1. Add cache-first `resolveEventById()` for regular events.
2. Add cache-first `resolveReplaceableEvent()` for replaceable addresses.
3. Add bounded relay-group attempts for misses.
4. Add throttled, coalesced replaceable freshness checks.
5. Validate and cache successful network results.
6. Return diagnostics indicating cache hit, network hit, refreshed, or missing.

### Fetch Behavior

- Return cache hits without opening relay connections.
- Update `last_accessed_at` whenever either strategy returns a cached row.
- Return replaceable cache hits immediately before background revalidation.
- `stale-while-revalidate` returns the cached row and schedules a due refresh.
- `require-fresh` waits for a due freshness check within the same deadline and
  falls back to the cached row with `refresh: 'failed'` if relays fail.
- Merge newly supplied normalized relay hints into a cache row on access.
- Use an initial 15-minute refresh interval, configurable by kind later.
- Use NIP-45 COUNT with `since: created_at + 1` when available.
- When COUNT is positive, fetch the latest matching event and compare it before
  replacing the row.
- Fall back to fetching one latest event when COUNT is unsupported or fails.
- Update `last_checked_at` after a completed freshness check.
- Try high-confidence relay groups before broad fallbacks.
- Exact-ID lookup stops after the first valid matching event.
- Replaceable lookup collects bounded responses through EOSE or the deadline
  and selects the newest matching event using NIP-01 ordering.
- Pass one absolute deadline through relay discovery, event fetching, and graph
  traversal.
- Cap explicit hints, relay groups, relays per group, concurrent requests, and
  total relay attempts.
- Never close shared-pool relay connections from one resolution operation.
  Application shutdown owns the pool lifecycle.

### Tests

- Cache hit performs zero pool requests.
- Cache miss fetches and stores the event.
- Wrong-ID relay response is rejected.
- Replaceable responses with the wrong kind, pubkey, or `d` tag are rejected.
- Replaceable hit returns before its background check completes.
- `require-fresh` waits while `stale-while-revalidate` does not.
- Refresh throttling prevents a network check on every access.
- Concurrent checks for one replaceable address share one in-flight operation.
- COUNT zero only updates `last_checked_at`.
- COUNT greater than zero fetches and compares the latest matching event.
- COUNT failure falls back to latest-event comparison.
- A newer event replaces JSON and metadata; an older event does not.
- Explicit relay hints from the two known Profile Latest Posts examples are
  included in the first relay group.

### Acceptance Criteria

- A repeated successful resolution is local-only.
- Missing events return structured diagnostics rather than throwing by default.
- Network and cache implementations are injected for deterministic tests.

## Phase 4: Reference Parser And In-Memory Graph (Completed)

### Completion

Phase 4 was completed on 2026-07-16 after reading this plan, the related design
document, and the completed cache, relay-resolver, event-resolver, and test
files listed above.

Implement only Phase 4:

- Add generic core reference parsing for NIP-10, NIP-22, NIP-21, quote tags,
  repost targets, and reaction targets.
- Preserve event-ID and replaceable-address targets as different typed targets.
- Build bounded breadth-first in-memory graph traversal on top of the Phase 3
  resolver interface.
- Preserve semantic edge roles, multiple roles between nodes, missing branches,
  cycles, depth limits, event limits, and per-event reference limits.
- Keep reverse reply discovery disabled unless an explicit policy requests it;
  recursive reply trees remain out of scope.
- Leave NR's current parsing and storage intact as a compatibility path.

Do not begin Phase 5 in the same change. In particular, do not instantiate the
service in `src/index.ts`, modify `PluginContext` or `WebRouteContext`, add web
routes, migrate Profile Latest Posts, or change NR/WoT consumers.

### Work

1. Implement generic NIP-21 parsing in core while leaving NR's implementation
   intact as a compatibility path.
2. Implement generic NIP-10/NIP-22 relationship parsing in core without
   requiring a simultaneous plugin release.
3. Parse quote, repost, and reaction targets into typed edges.
4. Add bounded breadth-first graph resolution.
5. Keep reply discovery disabled by default.

### Traversal Rules

- Deduplicate nodes by event ID.
- Preserve multiple edge roles between the same nodes.
- Detect cycles.
- Apply role-specific policy before scheduling a target.
- Resolve event targets by ID and address targets by replaceable address.
- Count cache hits and network results against `maxEvents` equally.
- Never let nested embeds or reposts bypass depth limits.

For a repost whose target is a reply containing an embed, preserve:

```text
repost -> repost-target -> thread-parent
                        -> embed
```

### Tests

- NIP-10 root and parent markers.
- NIP-22 root and parent tags.
- Content `note`, `nevent`, and `naddr` references.
- Address targets remain typed separately from event-ID targets.
- Parameterized replaceable targets resolve through the replaceable cache.
- Quote tags.
- Kind 6 and 16 repost targets.
- Kind 7 reaction targets.
- Repost target with thread context and embed.
- Cycles, duplicate edges, missing targets, depth limit, and event limit.

### Acceptance Criteria

- Graph semantics are independent of renderer behavior.
- `includeReplies: false` performs no reverse-reference query.
- One missing branch does not fail the rest of the graph.

## Phase 5: Service Integration And Web API (Completed)

### Completion

Phase 5 was completed on 2026-07-16. The shared service is constructed once in
normal mode, exposed through plugin and web contexts, and used by the bounded
authenticated profile-posts endpoint. Phase 6 consumer code remains unchanged.

### Work

1. Add a `NostrResolutionService` interface and implementation.
2. Instantiate it once in `src/index.ts`.
3. Add it to `PluginContext`.
4. Add it to `WebRouteContext`.
5. Add shared Zod request and response schemas.
6. Add a bounded authenticated web endpoint.

The initial service should expose:

```ts
type NostrResolutionService = {
  resolveEventById: (props: ResolveEventByIdProps) => Promise<ResolvedEvent>;
  resolveReplaceableEvent: (
    props: ResolveReplaceableEventProps,
  ) => Promise<ResolvedReplaceableEvent>;
  resolveGraph: (props: ResolveGraphProps) => Promise<ResolvedEventGraph>;
  queryAuthorEvents: (
    props: QueryAuthorEventsProps,
  ) => Promise<NostrEvent[]>;
  seedEvents: (props: SeedEventsProps) => Promise<SeedEventsResult>;
};
```

`seedEvents()` lets existing consumers place already validated persisted events
into the appropriate cache table during migration. It does not grant retention
protection; seeded rows participate in normal LRU eviction.

`queryAuthorEvents()` is needed because Profile Latest Posts starts with an
author query rather than known event IDs. It should resolve the author's NIP-65
write relays, merge cached and network results by ID, and return a bounded,
sorted list.

Profile Latest Posts should use `stale-while-revalidate`. Operations that must
publish using current replaceable metadata may use `require-fresh`.

### Web Endpoint

Prefer a purpose-bounded endpoint for the first consumer, such as:

```text
POST /api/nostr/profile-posts
```

Request fields:

- Profile pubkey.
- Existing relay hints and fallbacks.
- Maximum post count, capped server-side at ten.

Response fields:

- Primary events.
- Resolved graph events and typed edges.
- Missing-reference diagnostics safe for the UI.

Do not expose arbitrary relay counts, graph depths, or unconstrained filters to
the browser.

Use the authenticated `postJson()` helper in `web/src/utils.ts`. Cap request
body size, relay count, relay string length, normalized protocols, per-group
attempts, and the total network budget server-side.

Initial route limits should be a 32 KiB request body, eight hints, eight
fallbacks, 2,048 characters per relay URL, ten primary posts, and the resolver's
eight-second deadline.

### Tests

- Request validation and limits.
- Route uses the shared service rather than constructing `SimplePool`.
- Response is serializable and schema-valid.
- Service is available to a test plugin through `PluginContext`.
- Shutdown closes the cache DB cleanly.
- Setup mode keeps `WebRouteContext.nostrResolution` nullable and returns a
  controlled unavailable response rather than constructing a live resolver.

### Acceptance Criteria

- Browser profile fetching can use the server cache.
- Adding the service does not introduce plugin-specific types into core/web.
- Existing plugins continue to initialize.

The resolver owns an abort controller for maintenance and in-flight requests,
but does not own the shared pool. Normal shutdown must abort work, await bounded
cleanup, checkpoint and close the cache DB, and then let the application close
the shared pool before exiting. Setup-only mode must not require the service.

## Phase 6: Profile Latest Posts Migration (Completed)

### Completion

Phase 6 was completed on 2026-07-16. Profile Latest Posts now obtains primary
events and reference graphs from the authenticated server endpoint. Existing
kind-0 profile metadata and kind-3 follow-state browser lookups remain intact for
the later shared-cache migration.

### Work

1. Replace browser-side profile post and reference queries in
   `web/src/nostr/profileAction.ts` with the new endpoint.
2. Build reply context from thread edges.
3. Build NIP-21 embeds from embed edges.
4. Include referenced-event authors in profile metadata resolution.
5. Preserve relay hints on posts and embedded references for actions.

The profile metadata fetch can remain separate initially, but it should use the
server cache in a later cleanup.

### Regression Fixtures

Include posts whose content contains the two previously failing `nevent`
references. Their explicit hints include `nos.lol`, `nostr.wine`, and
`relay.ditto.pub`. Tests should verify that they become event embeds rather than
raw unresolved references when the target event is available.

### Acceptance Criteria

- NIP-21 `note` and `nevent` references render as fetched embeds.
- `naddr` references use replaceable-address resolution while preserving their
  external-link presentation where appropriate.
- Reply context is fetched beyond only the viewed author's write relays.
- A missing target still renders a safe unresolved reference.
- The second visit uses cached events and avoids target-event network fetches.

This is the first user-visible release point.

## Phase 7: Existing Cache And NR Adoption (Completed)

### Completion

Phase 7 was completed on 2026-07-16 across the root and standalone NR
repositories. Core never imports or opens NR storage: the plugin owns seeding
through `PluginContext.nostrResolution`. WoT retains compact derived state, and
NR retains all durable user state while context columns store only event IDs.

### Work

1. Move WoT kind 10002 event JSON to the replaceable cache while retaining
   parsed relay sets, event ID, and timestamp in WoT state.
2. Move kind 0 profile and kind 3 contact-list event JSON to the replaceable
   cache while retaining parsed application fields.
3. Update NR's declared minimum core API version when it starts using the
   resolver service.
4. Use the service in `commands/list/profile-events.ts`.
5. Use the service in `commands/fetch-latest/adapter.ts` for thread and content
   references.
6. Seed newly ingested NR events into the shared cache.
7. Normalize existing `thread_context_json` and `referenced_events_json` rows to
   compact IDs with a backup-first one-time migration.
8. Lazily seed `nr_profile_events.event_json` and
   `referenced_events_json` rows when read.
9. Resolve compact list context IDs with one short cache-oriented deadline.
10. Build feed relay-author groups from cached derived/shared state only, then
    refresh stale or missing kind 10002 events after feed work with bounded
    multi-author requests.
11. Seed the complete fetched batch before graph resolution, serialize remaining
    graph-time NIP-65 misses, and bound each AI classification call.

Do not make core import NR or open the NR database. NR owns seeding of its
persisted events through the public service. Seeded rows remain ordinary LRU
cache entries.

### Compatibility Migration

Existing `thread_context_json` and `referenced_events_json` were normalized by a
one-time transactional script. The script validates every entry, creates a
consistent SQLite backup, seeds complete events into the shared cache, and then
rewrites only the two context columns. Classification, read, archive,
interaction, and interest state remain untouched.

Apply the same compatibility treatment to `nr_profile_events`. Remove duplicate
full-event JSON only after the relevant consumer retains enough IDs, timestamps,
display fields, and relay hints to refetch an evicted cache row safely.

### Tests

- Existing NR rows render before seeding.
- Lazy seeding is idempotent.
- Classifications, read state, archive state, and interactions remain intact.
- Profile, Timeline, For You, and Archive output remain equivalent.
- An evicted event triggers normal relay fetching without losing NR user state.
- WoT/profile derived state works after its complete event JSON moves to the
  shared replaceable cache.

### Acceptance Criteria

- NR and the shared profile panel resolve the same references consistently.
- No destructive migration of existing NR data occurs.
- New NR ingestion does not duplicate complete context event JSON indefinitely.
- Starting an NR fetch with cached relay lists does not launch one kind 10002 REQ
  per author or delay the feed query behind relay-list revalidation.

## Phase 8: Reply Modal And Interaction Consumers

### Work

1. Migrate reply-modal root/parent lookup to the resolver.
2. Migrate repost and reaction target lookup.
3. Reuse relay resolution for reply/repost/reaction publishing.
4. Keep direct-reply discovery as an explicit separate query.

Reply discovery remains one level and on demand:

```ts
type QueryDirectRepliesProps = {
  eventId: string;
  address: string | null;
  relayHints: string[];
  fallbackRelays: string[];
  limit: number;
};
```

Recursive replies remain out of scope.

### Acceptance Criteria

- Opening Reply does not recursively fetch reply trees.
- Existing direct-reply behavior remains available.
- Thread context and embedded notes use the same graph semantics as other
  surfaces.
- Publishing uses recipient read relays and signer write relays correctly.

## Phase 9: Operations And User Controls

### Work

1. Add cache statistics to bot status or a dedicated settings surface.
2. Add configurable byte and event limits.
3. Add a clear-cache operation for both cache tables.
4. Add maintenance logging for prune counts and reclaimed logical bytes.
5. Add periodic `PRAGMA optimize` and bounded WAL checkpoint behavior.
6. Consider incremental auto-vacuum only for a newly created cache database.

Clearing the cache deletes rows from both tables. Application-specific state
remains elsewhere, and subsequent access refetches missing events from relays.
Do not run full `VACUUM` automatically during normal interactive use.

### Acceptance Criteria

- Users can see cache size and event count.
- Clearing both cache tables does not remove application-specific NR or WoT
  state.
- Cache growth stabilizes under repeated feed use.

## Rollout Sequence

Recommended pull-request boundaries:

1. Cache schema, store, maintenance, and tests.
2. Relay resolver plus regular and replaceable fetch strategies.
3. Reference parser and in-memory graph.
4. Service wiring and profile-posts API.
5. Profile Latest Posts migration.
6. WoT/profile cache adoption and NR profile/fetch-latest adoption.
7. NR context deduplication and compatibility cleanup.
8. Reply/repost/reaction migration.
9. Cache settings and maintenance UI.

Each boundary should be deployable and testable without requiring the next
phase.

## Verification Strategy

### Unit Tests

- Event validation and cache behavior.
- Relay ordering and NIP-65 freshness.
- Replaceable COUNT refresh, fallback comparison, and throttling.
- Reference parsing for each supported NIP and event kind.
- Graph traversal limits and cycle handling.
- NR seeding and compatibility parsing.

### Integration Tests

- In-memory SQLite plus a fake pool.
- Cache miss followed by cache hit.
- Profile latest posts with fetched content embeds.
- Repost target containing thread context and an embed.
- Missing relays and partial graph resolution.
- Shared LRU pruning across regular and replaceable rows.

### Manual Checks

- Open the known profile and confirm its raw `nevent` lines become embeds.
- Open Profile Latest Posts twice and confirm the second load is cache-backed.
- Check Timeline, For You, Archive, profile mode, and Reply surfaces.
- Restart the bot and confirm cached events remain usable.
- Inspect cache statistics before and after pruning.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Unbounded graph expansion | Hard depth, event, reference, relay, and timeout budgets |
| SQLite growth | Dedicated bounded cache, size accounting, and shared LRU pruning |
| Relay storms | Ordered relay groups, refresh throttling, deduplication, and concurrency limits |
| Incorrect thread/embed presentation | Typed semantic edges separated from rendering |
| Lost NR history | Lazy non-destructive seeding, retained app state, and compatibility reads |
| Browser/server divergence | Browser consumes server resolution schemas |
| Stale NIP-65 data | Freshness interval and newest-event comparison |
| Core becoming NR-specific | Generic service types; NR remains an external consumer |

## First Implementation Milestone

The first milestone is complete when:

- A dedicated bounded cache exists.
- Regular and replaceable resolution are cache-first.
- NIP-21 and thread references produce a typed in-memory graph.
- The service is exposed through core and a bounded profile-posts API.
- Profile Latest Posts renders the known `nevent` references as embeds.
- A second view resolves target events from local cache.
- NR behavior and storage remain unchanged.

This milestone fixes the immediate bug and establishes the shared boundary
without coupling it to the larger NR migration.
