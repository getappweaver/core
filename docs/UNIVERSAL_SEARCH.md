# Universal search

## Design and implementation plan

Core owns versioned contracts, provider coordination and a compact grouped search
dialog. Apps own queries, data and resource views. Providers include Memory,
Bookmarks and Todo.

- [x] Define `resource-view:v1` and canonical encoded resource links, aligned with
      `CapabilityResourceRef`; opening only reads/displays a resource.
- [x] Define `search:v1`: bounded plain-text results, nullable context, opaque
      pagination cursor and provider notices. Source metadata comes from core.
- [x] Register Memory, Bookmarks and Todo providers and advertise package capabilities.
- [x] Coordinate concurrent searches with per-source deadlines, incremental
      updates, isolated failures, multi-source label filters and stale-query suppression.
- [x] Add header search (to the left of `/bot status`), `tree` / `treeItem` grouped
      results, keyboard navigation, pagination and resource opening through existing
      capability modal rendering.
- [x] Validate with targeted ESLint and TypeScript; reconcile documentation.
- [ ] User verification in an authenticated context after a deliberate host restart.

Verification: core and web `tsc --noEmit` pass. Targeted ESLint passes. Repo-wide
`bun run lint` reports unrelated unused variables in
`plugins/nr/db/evaluation-queue.ts` (`NostrEvent`) and
`plugins/translate/service.ts` (`settings`). A one-off check opened both existing
plugin databases read-only and validated search results, next pages, encoded-address
round trips and resource views through a fresh capability registry. Each provider
returned three hits with a next page; both first-hit views passed the shared schema.
No indexes or data were changed. No tests were added/run and no browser session was
used. The authenticated UI still needs user verification: header entry, typing,
multi-source selection, tree expansion/collapse, keyboard navigation, pagination,
opening links and missing/deleted-resource feedback. Host restart is required; no
restart signal was created in the active chat.

## Contracts

Contracts live in `src/capabilities/`, using the existing
[capability registry](PLUGIN_CAPABILITY_SERVICES.md). `resource-view:v1.open`
accepts a resource type/ID and returns either a provider-owned `WebNodeRoot` or
an explicit not-found result. It never mutates data. Providers may implement
resource views independently of search.

Addresses are complete `CapabilityResourceRef` values for `resource-view:v1`.
Provider IDs use registry identity, not configurable aliases. The canonical
browser link is `#/resource/v1/<encoded-provider>/<encoded-type>/<encoded-id>`;
each segment is encoded separately. Core routes exactly to the addressed
provider, never substitutes another provider, and uses existing capability
missing-provider/error UI. Addresses are scoped to an AppWeaver installation
and its active workspace; they do not transfer data between installations.

`search:v1.search` accepts `{query, limit, cursor}` and returns
`{results, nextCursor, notices}`. Results contain `{id, text, context, address}`.
Text is plain text. Cursors are provider-owned, query-scoped strings; null starts
a search or indicates no next page. Providers must use deterministic ordering,
bound database work/results, and return only resources belonging to themselves.
Core uses registry metadata for source labels/icons and deduplicates result IDs
within each source. It preserves provider ordering rather than comparing scores.
Providers opt into this capability as an interactive search service; remote
providers must make network-query behavior explicit to their users.

Example result (source metadata is attached separately from the registry):

```json
{
  "results": [{
    "id": "53",
    "text": "Release engineering guide",
    "context": "Engineering · https://example.com/releases",
    "address": {
      "capability": { "name": "resource-view", "version": 1 },
      "providerId": "appweaver-bm-plugin/resource-view/v1",
      "resourceType": "bookmark",
      "resourceId": "53"
    }
  }],
  "nextCursor": null,
  "notices": []
}
```

Providers register `SearchV1` and, independently, `ResourceViewV1` with
`defineCapabilityProvider`, declare both under `appweaver.capabilities.provides`,
and set `coreApiVersion` to `^14.11.1` or newer. Core binds source identity at
registration. Every result's resource provider must belong to that same owner.
The reusable coordinator is in `src/core/search/coordinator.ts` and takes an
injected transport; the web dialog uses the authenticated generic capability
WebSocket path. The coordinator does not depend on browser state or plugin code.

## Surfaces and behavior

The authenticated web header opens a compact search dialog from the search icon to
the left of `/bot status`. Discovered sources appear below the search box as
toggleable labels (all active by default) for multi-source filtering. Queries are
debounced; each active provider progresses independently, with at most four
simultaneous calls and a per-call deadline. New queries, workspace/session changes,
disconnection and dialog cleanup discard obsolete work. Timeouts stop waiting; they
cannot preempt synchronous in-process plugin code. Search does not write timeline
history. Results render inside a `WebNodeShadowRoot` `tree`, with each source as a
collapsible `treeItem` branch, optional collapsible sub-type `treeItem` branches when
a source returns multiple `resourceType`s (such as `code` and `markdown`), and each
result as a leaf `treeItem`. Result addresses may optionally specify
`surface: "modal" | "timeline"` (defaulting to `"modal"`). Selecting a result opens
the owning app's view on that surface. Encoded resource links can also be opened
directly after authentication.

Memory searches existing committed code/Markdown snapshots in the active
workspace, never refreshes indexes, and opens matched files in the timeline via
`workspace-file-view:v1` (falling back to read-only inspection text when no file
location is available). Bookmarks searches saved bookmark fields using bound SQL
and opens the `/bm list` widget in the timeline with the matched bookmark
`treeItem` focused (`focused: true`). Todo searches todo titles, descriptions and
tags using bound SQL and opens the `/todo list` widget in the timeline with the
matched todo `treeItem` focused (`focused: true`).
See [Memory](../plugins/memory/README.md), [Bookmarks](../plugins/bm/README.md) and [Todo](../plugins/todo/README.md).
