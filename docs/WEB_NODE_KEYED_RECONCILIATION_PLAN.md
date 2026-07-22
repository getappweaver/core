# WebNode Keyed Reconciliation and Scoped Pending UI Plan

Status: implemented through Phase 5; Phase 6 measurement remains follow-up

Primary use case: Nostr Radar (`plugins/nr`) Read, Archive/Unarchive, and local
preference actions.

Related architecture:

- [WEB_RENDERER.md](./WEB_RENDERER.md)
- `src/web/ui-schema.ts`
- `web/src/components/WebNodeShadowRoot.tsx`
- `web/src/components/WebNodeRenderer.tsx`
- `web/src/components/web-node/WebTreeElement.tsx`
- `web/src/components/web-node/WebNostrPostElement.tsx`
- `web/src/commands/useCommands.ts`
- `plugins/nr/commands/list/renderers/web.ts`

## Summary

Command-backed WebNode widgets currently refresh by replacing their complete
`WebNodeRoot`. The replacement returns correct server state, but nested Solid
components can be recreated because the new JSON contains new object identities.
That resets local UI state such as open thread context and expanded post content.

NR temporarily avoided successful refreshes for Read by removing matching mounted
DOM elements before the command completed. That made the clicked copy disappear
quickly, but it introduced correctness problems:

- Copies inside collapsed topic or mood branches are not mounted and cannot be
  found through DOM traversal.
- The same event can remain visible in another branch.
- Topic, mood, and section counts remain stale.
- Empty topic or mood groups remain visible.
- Imperative DOM removal bypasses Solid's rendered WebNode state.

The proposed architecture keeps server-rendered WebNodes and normal command
refreshes, but changes how refreshed roots are applied:

1. NR renders a complete authoritative list after a mutation.
2. Every stateful or repeated WebNode has a stable `renderKey`.
3. Every representation of one logical entity can share an `entityKey`.
4. Core stores the rendered root in a keyed reactive Solid store.
5. A refreshed root is reconciled into that store instead of replacing all node
   identities.
6. Retained components receive reactive prop updates without remounting.
7. Removed nodes unmount, new nodes mount, and unchanged stateful components keep
   their local signals.
8. Core can display a scoped `Updating...` overlay for every mounted copy of the
   source entity while the command and its refresh run.

This is a complete server data refresh without a complete client component
remount. It does not require a plugin-specific mutation DSL or executable
client-side plugin code.

## Goals

- Preserve local component state across authoritative WebNode refreshes.
- Reconcile complete refreshed trees by stable identity.
- Keep counts, group membership, and action state server-authoritative.
- Remove events from every topic and mood representation after Read.
- Remove empty topic and mood groups automatically.
- Update Archive/Unarchive and preference controls without recreating posts.
- Replace widget-wide Working overlays with optional entity-scoped pending UI.
- Keep `src/` and `web/` plugin-agnostic.
- Let NR own its grouping, counts, rendering, and command semantics.
- Make reconciliation reusable by all WebNode plugins.
- Preserve existing behavior for roots that do not provide stable render keys.

## Non-Goals

- Loading executable JavaScript bundles from plugins.
- Adding an NR-specific action handler to core.
- Letting plugins manipulate DOM nodes directly.
- Defining a general client-side mutation or patch DSL.
- Making the browser calculate NR topic or mood counts.
- Sharing every local UI signal between duplicate event representations in the
  first implementation.
- Optimistically changing persistent state before the command succeeds.

The first version is a targeted pending experience followed by a fast,
authoritative keyed reconciliation. True pre-success optimistic state can be
added later if measured latency requires it.

## Current Behavior and Failure Mode

### Root replacement

`WebNodeShadowRoot` currently stores the root in a signal:

```ts
const [currentRoot, setCurrentRoot] = createSignal<WebNodeRoot>(props.root);
```

It assigns each incoming root directly:

```ts
createEffect(() => {
  setCurrentRoot(props.root);
});
```

`WebNodeRenderer` recursively renders `element.children` with Solid `<For>`.
When a server refresh returns new JSON objects, child object references differ.
Repeated elements can therefore be disposed and recreated even if they represent
the same logical node.

### Local state that can be reset

`WebNostrPostElement` owns local signals for:

- Thread-context visibility.
- Expanded/collapsed content.
- The image lightbox.

`WebTreeItemElement` owns local expansion and lazy-loading state, with expansion
also mirrored into the existing state-scope map.

Replacing component instances resets instance-local signals. The tree expansion
map protects some tree state, but it does not protect Nostr post state.

### Current Read workaround

NR adds this command metadata:

```ts
optimistic: {
  hideTargetIds: [`nr-event-${eventId}`],
  refreshOnError: true,
}
```

`useCommands` finds mounted elements in the widget ShadowRoot and executes:

```ts
element.remove();
```

Collapsed tree branches are conditionally rendered. Their event copies do not
exist in the DOM at click time, so they are not removed. The underlying WebNode
root also remains unchanged. Opening a different group can therefore mount the
same event again.

## Design Principles

### The server remains authoritative

NR calculates:

- Which events are unread.
- Which events belong to each topic and mood.
- Topic, mood, and section counts.
- Whether a group should exist.
- Archive state.
- Local preference state.
- The complete WebNode representation.

The browser does not reproduce this business logic.

### Core reconciles generic UI descriptions

Core understands only generic WebNode identity and command presentation:

- Stable render identity.
- Shared entity identity.
- Reactive keyed reconciliation.
- Widget, entity, or no pending presentation.

Core does not know what an NR topic, mood, read marker, or preference means.

### Reconcile the model, not the DOM

The refreshed `WebNodeRoot` is reconciled into a reactive WebNode store. Solid
then applies DOM changes. Core must not use `querySelectorAll(...).remove()` as
the source of truth for persistent command results.

### Preserve stateful component identity

If a refreshed node has the same `renderKey`, node type, and element tag, its
existing render record and component instance are retained. Its props, summary,
and children update reactively.

If identity or element type changes, the old component is replaced.

## Proposed Wire Contract

### Stable render identity

Add optional `renderKey` to element nodes. It belongs to the wire node rather
than presentation props because it controls client reconciliation.

Conceptual schema:

```ts
export const WebElementNodeSchema = z.object({
  type: z.literal('element'),
  tag: WebElementTagSchema,
  renderKey: z.string().min(1).optional(),
  props: WebElementPropsSchema.optional(),
  summary: WebNodeSchema.optional(),
  children: z.array(WebNodeSchema).optional(),
});
```

Text nodes do not need keys initially. Stateful and repeated element nodes do.

Requirements:

- A `renderKey` must be stable across equivalent refreshes.
- A `renderKey` must not be reused for a different element tag.
- Keys should be unique among siblings.
- Stateful list items should include enough path context to remain unique and
  stable when the same entity appears in several branches.
- Reordering must not change the key.

NR examples:

```ts
renderKey: `nr-section-topic`
renderKey: `nr-topic-${normalizedTopic}`
renderKey: `nr-topic-${normalizedTopic}-event-${event.id}`
renderKey: `nr-mood-${normalizedMood}-event-${event.id}`
renderKey: `nr-for-you-event-${event.id}`
```

The existing `props.id` remains the identifier used by tree expansion, stories,
reveal actions, and DOM targeting. `renderKey` has one responsibility: keyed
render reconciliation.

### Shared entity identity

Add optional `entityKey` to `WebBasePropsSchema`:

```ts
entityKey: z.string().min(1).optional()
```

All representations of one event use:

```ts
entityKey: `nostr-event:${event.id}`
```

`entityKey` is intentionally not unique. It supports cross-representation client
state such as pending presentation. It is not used as a list reconciliation key.

NR should put the entity key on the outer event `treeItem`. Descendants inherit
the nearest entity context. This covers event overflow-menu actions and
`nostrPost` action-row actions without duplicating metadata on every button.

### Pending presentation

Add an optional generic command-action property:

```ts
pendingUi: {
  presentation: 'widget' | 'entity' | 'none';
  label?: string;
}
```

Compatibility behavior:

- Omitted: retain the existing widget-wide Working overlay behavior.
- `widget`: explicitly use the widget-wide overlay.
- `entity`: use the nearest source `entityKey`; no widget-wide overlay.
- `none`: run without either pending overlay.
- `entity` without an entity context: fall back to `widget` and emit a debug
  diagnostic rather than silently providing no feedback.

The overlay is entirely client-side. NR only chooses generic presentation on its
action. Core creates, renders, and clears pending state before and after command
execution.

NR mutations should initially use:

```ts
pendingUi: {
  presentation: 'entity',
  label: 'Updating...',
}
```

## Client Reconciliation Architecture

### Recommended Solid storage

Replace the root signal in `WebNodeShadowRoot` with a Solid store and apply
Solid's `reconcile` utility, keyed by `renderKey`.

Conceptual direction:

```ts
const [currentRoot, setCurrentRoot] = createStore<WebNodeRoot>(props.root);

createEffect(() => {
  setCurrentRoot(
    reconcile(props.root, {
      key: 'renderKey',
      merge: true,
    }),
  );
});
```

This must be validated with the actual recursive WebNode schema before adoption.
If Solid's stock reconciler cannot reliably handle optional keys, summaries, or
mixed text/element arrays, add a focused `reconcileWebNodeRoot` helper that:

- Matches keyed sibling elements by `renderKey`.
- Retains the existing store proxy for compatible matches.
- Reconciles props, summary, and children into that proxy.
- Reconciles unkeyed leaves positionally.
- Inserts new records and removes missing records.
- Replaces a record when type or tag is incompatible.

Do not build a separate generic patch language. The input to reconciliation is
always the next complete `WebNodeRoot`.

### Renderer reactivity

The retained WebNode object must be reactive. Components should read current
props through accessors or reactive Solid store proxies.

For `WebNostrPostElement`, this existing shape is favorable:

```ts
const elementProps = () => props.element.props;
```

If `props.element` is a retained reactive proxy, memos and DOM expressions that
read `elementProps()` can update while the component's local signals survive.

The renderer audit must identify eager one-time reads such as:

```ts
const disabled = element.props?.disabled === true;
```

Values that must change after reconciliation should become accessors or be read
inside reactive JSX expressions.

### Compatibility rules

The reconciler should apply these rules:

| Previous node | Next node | Result |
|---|---|---|
| Same `renderKey`, type, and tag | Updated props/children | Retain instance and merge reactive data |
| Same key, different type or tag | Incompatible | Replace instance |
| Previous keyed node absent | Removed | Unmount instance |
| New keyed node absent previously | Added | Mount instance |
| Both nodes unkeyed | Same array position and compatible shape | Reconcile positionally |
| Unkeyed order changes | Unknown identity | Replacement is allowed |

Stateful repeated plugin renderers must provide keys. Unkeyed fallback exists for
backward compatibility, not as the recommended path.

### Root metadata and stylesheets

Reconciliation must continue updating:

- `meta`
- `stylesheets`
- `shadowMountOverflow`
- `initialRevealedIds`
- root toolbar metadata

The existing effects in `WebNodeShadowRoot` should read the reactive store rather
than a root signal. Stylesheet replacement behavior remains unchanged.

## Scoped Pending Architecture

### Source entity propagation

Add a generic entity context to `web-node/contexts.ts`:

```ts
export const WebEntityKeyContext = createContext<Accessor<string | null>>(
  () => null,
);
```

Each element renderer computes its effective entity key:

```ts
const effectiveEntityKey =
  element.props?.entityKey ?? parentEntityKey();
```

It provides that key to descendants. When an action runs, `WebNodeRenderer`
passes the effective source key through `RunWebActionParams`:

```ts
webCommandSourceEntityKey: effectiveEntityKey
```

This source context is a core rendering concern. NR supplies only stable entity
metadata in its WebNode output.

### Pending state ownership

Pending state must be scoped by both widget source and entity:

```ts
Map<webCommandSourceId, Map<entityKey, number>>
```

Use reference counts rather than sets so concurrent operations cannot clear each
other's pending state.

The existing socket/application state currently tracks widget busy counts by
`webCommandSourceId`. Extend that state with:

```ts
beginWebEntityPending(sourceId, entityKey)
endWebEntityPending(sourceId, entityKey)
isWebEntityPendingFor(sourceId, entityKey)
```

The timeline card, modal, and dock pass an accessor into `WebNodeShadowRoot`.
`WebNodeShadowRoot` provides a `WebPendingEntityContext` to descendants.

### Nostr post presentation

`WebNostrPostElement` reads its effective entity key and pending state. While
pending, it should:

- Set `aria-busy="true"` on the post article.
- Show a compact local `Updating...` overlay.
- Prevent duplicate post actions for that entity.
- Keep the post content visible beneath a subtle overlay.
- Avoid layout shifts.

The overlay belongs to the generic `nostrPost` client primitive and uses shared
core CSS. NR does not provide markup or styles for it.

Other WebNode primitives may adopt entity pending presentation later. The first
implementation only needs `nostrPost` because it is the concrete use case.

### Pending lifecycle

For an action with entity presentation:

1. Resolve `webCommandSourceId` and source `entityKey`.
2. Increment entity pending before sending the socket request.
3. Do not call `beginWebUiBusy` for the widget.
4. Run the mutation command.
5. Run its configured refresh command after success.
6. Apply the refreshed root through normal host state.
7. Reconcile the root inside `WebNodeShadowRoot`.
8. Clear entity pending after the refresh result is accepted.
9. On mutation failure, clear pending and leave the current root unchanged.
10. On refresh failure after mutation success, clear pending, report the refresh
    error, and leave the current UI stale until retry/manual refresh.

The refresh must remain part of the pending lifecycle. Clearing pending when only
the mutation command finishes would expose old controls before authoritative UI
arrives.

## Ownership Boundaries

### NR owns

- Database mutations.
- Read/archive/preference semantics.
- Topic and mood grouping.
- Group and section counts.
- Omitting empty groups.
- Producing the complete refreshed WebNode root.
- Stable NR render keys.
- Shared event entity keys.
- Choosing entity-scoped pending presentation for its actions.
- Supplying mode-preserving refresh commands.

### Core schema owns

- Generic `renderKey` transport.
- Generic `entityKey` transport.
- Generic command pending-presentation metadata.

### Core client owns

- Keyed reactive reconciliation.
- Source entity context propagation.
- Pending reference counts.
- Scoped pending rendering.
- Widget-wide busy fallback.
- Ignoring stale refresh responses.
- Preserving retained component instances.

### `WebTreeElement` owns

- Rendering one generic tree/tree-item node.
- Expansion and collapse state.
- Lazy-load state.
- Filtering behavior.

It does not traverse the tree to apply NR business operations and does not
calculate counts.

### `WebNostrPostElement` owns

- Rendering generic Nostr post props.
- Local thread-context, content-expansion, and lightbox state.
- Reacting to reconciled prop changes.
- Displaying generic entity pending state.

It does not call NR code or calculate persistent NR state.

## NR Action Behavior After Migration

### Read

NR action:

```ts
{
  type: 'command',
  command: alias,
  subcommand: 'mark',
  arguments: { event_id: event.id },
  options: { read: true },
  recordInTimeline: false,
  pendingUi: { presentation: 'entity', label: 'Updating...' },
  refresh: {
    command: alias,
    subcommand: 'list',
    arguments: {},
    options: { mode },
    recordInTimeline: false,
  },
}
```

Expected refreshed-tree differences:

- Every occurrence of the event is absent.
- Every affected group count is lower.
- Topic and mood section totals are lower according to NR's existing counting
  semantics.
- Any zero-count group is absent.
- Unaffected event components retain their instances and local state.

Remove the current `optimistic.hideTargetIds` metadata and DOM removal path after
the reconciled flow is verified.

### Archive/Unarchive

The existing mutation and refresh shape remains. Add entity-scoped pending UI.

Expected refreshed-tree differences:

- The event remains in Timeline and For You according to existing NR behavior.
- `nostrArchived` changes on every representation.
- Archive labels and actions change to their opposite state.
- Counts and groups remain unchanged unless existing server behavior says
  otherwise.
- Open thread context and expanded content remain open on retained instances.

### Thumbs-up/Thumbs-down

The existing `interest-record` command and list refresh remain. Add entity-scoped
pending UI.

Expected refreshed-tree differences:

- Every event representation receives the new local preference state.
- Positive and negative controls remain mutually exclusive because NR renders
  them from authoritative state.
- A selected preference can be removed through the newly reconciled action.
- No group-count changes are calculated in the browser.

## Empty Group Handling

NR already renders groups from current list data. After Read, a group with no
remaining unread events should be omitted from the next root.

The reconciler sees that its group `renderKey` is absent and unmounts that
`treeItem`. Retained sibling groups keep their instances even if their array
positions change.

If an entire topic or mood section has no groups, retain the existing section
empty-state behavior unless product requirements explicitly choose to remove the
whole section. This is an NR renderer decision, not a reconciler rule.

## Stale and Concurrent Refresh Protection

Several commands can overlap. A slower earlier refresh must not overwrite a
newer root.

Add a monotonically increasing refresh generation per widget source:

```ts
Map<webCommandSourceId, number>
```

When dispatching a refresh:

1. Increment and capture the source generation.
2. Accept the refresh result only if its generation is still the latest started
   generation for that source.
3. Ignore a late result from an older generation.
4. Always clear only the pending reference owned by that request.

For the first NR release, disable repeated actions for a pending entity. This
avoids archive/unarchive or preference races while retaining support for
concurrent actions on different posts.

## Detailed Implementation Phases

### Phase 1: Reconciliation proof of concept

Files:

- `src/web/ui-schema.ts`
- `web/src/components/WebNodeShadowRoot.tsx`
- new `web/src/components/web-node/reconcile.ts` if stock Solid reconciliation
  is insufficient
- one small built-in/demo renderer fixture

Tasks:

- Add optional `renderKey` to element nodes.
- Convert `WebNodeShadowRoot` root storage from a plain signal to a reactive
  store.
- Prototype keyed reconciliation with `createStore` and Solid `reconcile`.
- Verify retained keyed components do not remount when props and siblings change.
- Verify removed keyed nodes unmount and reordered keyed nodes retain identity.
- Verify unkeyed roots continue rendering.
- Add development diagnostics for duplicate sibling keys and same-key tag
  changes.

Exit criteria:

- A keyed stateful fixture keeps a local signal while its server props update.
- Removing one sibling does not transfer local state to another sibling.

### Phase 2: Reactive renderer audit

Files:

- `web/src/components/WebNodeRenderer.tsx`
- `web/src/components/web-node/WebTreeElement.tsx`
- `web/src/components/web-node/WebNostrPostElement.tsx`
- other element renderers with eager prop reads

Tasks:

- Ensure retained element descriptors are reactive proxies/accessors.
- Convert eager values that must update into reactive accessors.
- Verify action objects update after reconciliation.
- Verify tree summaries and counts update without remounting the tree item.
- Verify stylesheets, metadata, overflow mode, and toolbar actions update.
- Verify forms and editable text do not receive unsafe value resets from
  unrelated reconciliation.

Exit criteria:

- Updating `nostrArchived`, action arrays, content, and labels updates DOM.
- Thread-context and content-expansion signals survive compatible updates.

### Phase 3: Generic entity identity and scoped pending state

Files:

- `src/web/ui-schema.ts`
- `web/src/commands/types.ts`
- `web/src/commands/useCommands.ts`
- `web/src/components/web-node/contexts.ts`
- `web/src/components/WebNodeRenderer.tsx`
- `web/src/components/WebNodeShadowRoot.tsx`
- `web/src/socket/useSocket.ts`
- `web/src/App.tsx`
- timeline, modal, and dock hosts
- `web/src/components/web-node/WebNostrPostElement.tsx`
- shared Web UI CSS

Tasks:

- Add `entityKey` and `pendingUi` schemas.
- Propagate nearest entity context through recursive rendering.
- Add `webCommandSourceEntityKey` to action execution parameters.
- Add per-widget, per-entity pending reference counts.
- Route widget/entity/none presentation in `useCommands`.
- Keep entity pending active through child refresh completion.
- Add the Nostr post Updating overlay and `aria-busy` state.
- Disable repeated actions for the pending entity.
- Add stale refresh generation protection.

Exit criteria:

- Starting a command marks every mounted copy of one entity pending.
- Other posts remain interactive.
- No widget-wide overlay appears for entity-scoped actions.
- Pending clears correctly on command error, refresh success, and refresh error.

### Phase 4: NR stable identity migration

Files:

- `plugins/nr/commands/list/renderers/web.ts`
- NR renderer helpers introduced during refactoring

Tasks:

- Assign stable `renderKey` values to sections, groups, event wrappers, merged
  activity wrappers, and other stateful repeated nodes.
- Add `entityKey` to each event wrapper.
- Ensure duplicate event representations have distinct render keys but the same
  entity key.
- Keep existing `props.id` behavior where required by tree state, stories, and
  targets.
- Confirm render keys remain stable across count changes and sorting.

Exit criteria:

- A duplicated event can be identified as separate render instances of one
  entity.
- Reordering events does not remount retained keyed posts.

### Phase 5: NR mutation migration

Files:

- `plugins/nr/commands/list/renderers/web.ts`
- `web/src/commands/useCommands.ts`
- `src/web/ui-schema.ts`

Tasks:

- Remove Read's DOM-hide optimistic metadata.
- Restore authoritative successful refresh for Read.
- Add entity-scoped pending UI to Read, Archive/Unarchive, and local preference
  actions.
- Keep each action's current mode in refresh options.
- Verify referenced-event actions use an appropriate entity key and refreshed
  representation.
- Remove `WebOptimisticCommandSchema` and its imperative DOM-removal client code
  if no remaining consumer needs it. If other consumers exist, deprecate it and
  migrate them separately.

Exit criteria:

- Read removes all copies and updates counts without resetting unrelated post
  state.
- Archive and preference actions update all copies without resetting the target
  post's local state.

### Phase 6: Hardening and broader adoption

Tasks:

- Measure NR mutation-to-refresh latency.
- Determine whether NR list refresh needs a cached/no-network render path for
  local mutations.
- Add diagnostics for missing keys in large repeated collections.
- Document stable-key guidance in `WEB_RENDERER.md`.
- Consider entity-scoped pending presentation for other generic primitives.
- Migrate other official plugin widgets only when they benefit.

## Verification Plan

No implementation phase is complete until the following behavior is verified.

### Reconciliation behavior

- Same keyed node and tag retains its Solid component instance.
- Updated reactive props change rendered output.
- Removing a keyed child unmounts only that child.
- Inserting or reordering keyed children does not transfer local state.
- Different tags with one key replace safely and report a diagnostic.
- Unkeyed legacy roots still render and refresh.

### Read scenario

Initial state:

```text
nostr (8)
  event A

personal (7)
  event A
```

Steps:

1. Open thread context on event B.
2. Click Read on event A under `nostr`.
3. Confirm every visible event A copy shows `Updating...` while pending.
4. Confirm there is no widget-wide Working overlay.
5. Wait for refresh reconciliation.

Expected:

- Event A is absent from `nostr` and `personal`.
- Both group counts are updated from server state.
- Topic and mood section totals are updated.
- Any group reduced to zero is removed.
- Event B's thread context remains open.
- Tree expansion and scroll position remain stable apart from natural layout
  movement caused by removed content.

### Archive scenario

Steps:

1. Open a post's thread context.
2. Archive it.

Expected:

- Every copy shows scoped pending state.
- The post remains visible in Timeline and For You according to current behavior.
- The archive presentation updates after reconciliation.
- The thread context remains open.
- The next action can unarchive the post.

### Preference scenario

Steps:

1. Select thumbs-up on an event represented in multiple groups.
2. Remove thumbs-up.
3. Select thumbs-down.

Expected:

- Every copy updates after each reconciliation.
- Positive and negative states remain mutually exclusive.
- The command cannot be triggered repeatedly while the entity is pending.
- Unrelated post state remains unchanged.

### Failure scenarios

- Mutation command failure clears scoped pending and leaves current UI unchanged.
- Refresh failure clears scoped pending and reports an error without remounting
  the widget.
- A late older refresh cannot overwrite a newer accepted refresh.
- Two different posts can update concurrently without clearing each other's
  pending state.

## Performance Considerations

- Reconciliation is linear in the rendered WebNode count for each refreshed
  root. NR lists should be measured with realistic event counts.
- Stable keyed reconciliation avoids rebuilding retained DOM and component
  instances, reducing layout and media churn compared with root replacement.
- Stylesheet synchronization remains keyed by stylesheet ID.
- Entity pending lookup should be constant-time.
- Development key diagnostics may walk sibling arrays but should avoid expensive
  global indexing in production.
- If complete NR list rendering or hydration dominates latency, optimize the
  server refresh path separately. Do not move grouping logic into the browser to
  hide server cost.

## Risks and Mitigations

### Solid reconciliation does not preserve the expected component boundary

Mitigation:

- Prove state retention with a focused fixture before migrating NR.
- Use explicit keyed render records if `createStore` plus stock `reconcile` is
  insufficient.

### Reactive prop updates are missed by eager reads

Mitigation:

- Audit element renderers in Phase 2.
- Convert values that can change after refresh into accessors/memos.

### Duplicate or unstable render keys

Mitigation:

- Add development diagnostics.
- Document sibling uniqueness and tag stability.
- Construct NR keys from stable mode/section/group/entity identifiers, never
  array indexes or counts.

### Local state follows the wrong item after reorder

Mitigation:

- Require keys for stateful repeated nodes.
- Do not rely on positional reconciliation for plugin lists.

### Out-of-order refresh responses regress UI

Mitigation:

- Add per-widget refresh generations and reject late older results.

### Entity pending state leaks

Mitigation:

- Use request-owned reference counts.
- Clear in every completion/error/send-failure path.
- Add debug inspection for pending entries.

### Target post state resets despite reconciliation

Mitigation:

- Keep the same post render key for archive/preference updates.
- Ensure `WebNostrPostElement` receives a reactive retained descriptor.
- If a stateful component must move between incompatible parents, add a later
  state-scope store keyed by `entityKey`; do not add it before a demonstrated
  need.

## Rollout and Compatibility

- All new schema fields are optional.
- Existing plugins continue to render without keys.
- Existing widget-wide busy behavior remains the default.
- Reconciliation applies to all incoming roots, but only keyed nodes gain strong
  identity guarantees.
- NR is the first complete migration and validates the architecture.
- Remove the old optimistic DOM-removal feature only after checking all consumers.
- No plugin code is imported into `src/` or `web/`.

## Documentation Follow-Up

After implementation:

- Add stable `renderKey` guidance to `WEB_RENDERER.md`.
- Document `entityKey` as shared logical identity, not a reconciliation key.
- Document pending presentation and fallback behavior.
- Add a compact plugin renderer example showing repeated keyed entities.
- Record whether Solid's stock reconciler or a custom helper became the final
  implementation.

## Final Architecture Decision

Proceed with server-authoritative full-root refresh plus client-side keyed
reconciliation.

Implementation note: the final client uses a focused recursive WebNode
reconciler. Solid's stock keyed reconciliation is not used for child arrays
because optional keys and mixed text/element siblings make its array-key
selection ambiguous.

Do not introduce:

- NR-specific client handlers in core.
- Direct plugin DOM updates.
- A general WebNode patch DSL.
- Client-side plugin bundles for this use case.

The implementation should first prove that a retained keyed `nostrPost` receives
new reactive props without losing local signals. That proof is the critical
technical gate before migrating NR actions.
