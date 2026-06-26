# AppWeaver Roadmap Module

## 1. Product Concept

The Roadmap module is a Nostr-native public issue tracker and fundable roadmap for AppWeaver.

It lets users:

- Create issues with a Nostr identity. An issue can be a bug report or feature request.
- Fund any issue they want to see fixed or developed.
- See which issues other users care about most.
- Follow development priorities without needing GitHub, Discord, or a separate account.

It lets maintainers:

- Collect user feedback in a public, portable format.
- Use payments as prioritization signal, not as binding contracts.
- Monetize open-source development without selling control of the roadmap.
- Show potential users that the project is active, responsive, and community-funded.

The core idea is not a classic Kanban board. The module has two layers: user-created issues, and maintainer-controlled workflows where tracker events assign selected issues to statuses/columns. Kanban-like columns are a maintainer workflow view over existing issues, not the thing users directly control.

**Working tagline:** Fund what you want built next.

## 2. Core Principles

### 2.1 Funding Is Signal, Not A Contract

Payments increase visible priority, but they do not guarantee implementation, timing, acceptance, or support.

Required disclosure:

> Funding an issue is a signal, not a purchase or contract. Funded issues are more visible and more likely to influence our priorities, but AppWeaver maintainers decide what to build, when to build it, and whether an issue fits the product.

### 2.2 Free To Create, Paid To Prioritize

Creating issues should be free in the MVP.

This keeps feedback friction low and avoids turning every bug report into a payment moment. Funding is layered on top as prioritization, not as a gate to participation.

### 2.3 Nostr-Native, Client-Agnostic

Roadmap data should live on Nostr so it can be reused across different clients:

- A singleton AppWeaver in-app timeline widget for browsing, searching, submission, and funding.
- A public landing-page roadmap view.

The feature should not depend on one UI shape. The landing page may show a ranked public roadmap, while the app may show a larger timeline-style widget with search, issue lists, and accordions for statuses/columns. A Kanban layout is optional and not required for the MVP.

### 2.4 Free Creation, Adjustable Spam Defenses

Issue creation is free for the MVP, but the system should leave room for stronger spam controls if needed.

Possible future precautions:

- One-time payment before creating issues.
- Minimum payment for public visibility.
- Hide unpaid issues by default.
- Require moderator approval for unpaid issues.
- Rate limits, relay bans, or event deletion for abusive users.

These are not MVP requirements. The MVP should start with free issue creation and relay/moderator controls.

## 3. MVP Decisions

| Decision | MVP Choice |
|----------|------------|
| Primary product name | Roadmap |
| First use case | AppWeaver dogfooding |
| Canonical object | Issue |
| Issue types | Feature requests and bug reports |
| Who can create issues | Anyone with Nostr |
| Creation cost | Free |
| Funding model | Optional funding on any issue |
| User promise | Signal only, no guarantee |
| Public ranking | Unassigned issues sorted by highest total funding first |
| Board model | Maintainer-controlled workflow; tracker events assign existing issues to statuses/columns |
| Board scope | Core AppWeaver board plus separate official plugin boards |
| Landing page default | Top funded issues only |
| Repo relays | `relays` tag on the NIP-34 repo announcement, discovered through repo author NIP-65 when needed |
| Funding verification | Clients verify board author `lud16`/`lud06` -> LNURLP -> `nostrPubkey` -> zap receipt pubkey |
| Funding total source | Clients compute from verified zap receipts fetched from repo relays plus relevant NIP-65 relays |
| First AppWeaver entry point | Header Roadmap button |
| First surfaces | Usable from AppWeaver, viewable from landing page |
| Payment priority | Lightning zaps first; Nutzaps later |

## 4. User Experience

### 4.1 In-App Flow

The AppWeaver app should make browsing, searching, submission, and funding easy for active users.

The first in-app entry point should be a Roadmap button in the app header. It should open a singleton timeline widget, not a small modal. The widget should have enough space for search, issue lists, funding controls, and status sections without feeling cramped.

Later entry points may include:

- Report bug action near error states or settings.
- Request feature action from the Roadmap widget.

Basic submission flow:

```text
User opens AppWeaver
  -> clicks Roadmap / Report Bug / Request Feature
  -> searches existing issues first
  -> reviews similar/exact matches if found
  -> comments or funds an existing issue when appropriate
  -> selects Feature or Bug
  -> enters title and description
  -> optionally includes app version, OS, logs, or context
  -> signs with Nostr key
  -> issue is published to Nostr
  -> user may optionally fund the issue
```

The in-app UI does not need to show a full board. It should behave like a singleton timeline widget and can show:

- Search results and similar issues before submission.
- Top funded issues.
- Issues created by the current user.
- A funding button on each issue.
- Status sections or accordions for board columns.

### 4.2 Landing Page Flow

The landing page should be read-focused and trust-building.

It should show potential users:

- The most-funded issues.
- The amount of community funding attached to development priorities.
- Clear disclosure that funding is signal, not a guarantee.

The landing page should not require login just to view the roadmap.

The default landing-page view should highlight top-funded unassigned issues. This keeps the page focused on social proof and funding competition while preserving the maintainer's freedom to decide what enters the actual roadmap board.

The page can then show the maintainer-controlled roadmap board as a separate widget below the unassigned issues, or as an adjacent section. The board can be rendered as status accordions:

- Unassigned
- Planned
- In Progress
- Shipped
- Rejected
- Archived

This gives visitors a workflow view without requiring a classic Kanban board UI.

### 4.3 Maintainer Flow

Maintainers need enough tooling to keep the roadmap useful without overbuilding the first version.

MVP maintainer actions:

- Assign issues to board statuses/columns.
- Hide spam or invalid issues.
- Mark duplicates.
- Mark issues as planned, in progress, shipped, rejected, or archived.
- Add maintainer notes.

The next maintainer UI should make the issue itself the editing surface. Clicking an issue title can open an issue detail view with controls for assignment, status, duplicate handling, moderation, comments, and funding context. Assignment tools should publish tracker events rather than mutate the original issue.

The issue detail UI should use a signer-aware capability layer before showing or enabling mutation controls. This layer should derive `canCreate`, `canComment`, `canMove`, `canMark`, `canDelete`, and similar booleans from all applicable signing identities, not only the current browser pubkey. In the app this includes browser signers and saved bunker connections; on the landing page it includes only landing-supported signers. For example, `canMove` is true when any available identity matches the board/workflow author, while `canDelete` is true only when an available identity matches the original issue author. The publish handlers must still enforce these rules after signing, but the UI should avoid showing controls that no available signer can execute.

## 5. Issue Model

An issue represents either a feature request or a bug report. The issue event should follow NIP-34 as closely as possible.

The model has two layers:

- User feedback layer: anyone can create an issue.
- Maintainer board layer: maintainers decide whether an existing issue is assigned to a status/column.

This preserves two freedoms at the same time:

- Users are free to submit issues and fund what they care about.
- Maintainers are free to choose which issues enter the board and which status/column they belong to.

Canonical issue event data comes mostly from NIP-34:

| Field | Purpose |
|-------|---------|
| Event ID | Stable issue identifier for NIP-34 `kind:1621` issue events |
| `content` | Markdown description of the bug report or feature request |
| `subject` tag | Short user-facing issue title |
| `a` tag | NIP-34 project/repository anchor |
| `p` tag | Maintainer/project owner reference |
| `t` tags | Labels such as `bug`, `feature`, product area, or platform |
| `created_at` | Original submission timestamp |

Derived view data is not part of the issue event itself. Clients can build a view model by combining the issue event with related events:

- Board assignment from tracker/workflow events.
- Broad issue state from NIP-34 status events.
- Funding total and count from client-verified zap receipts.
- Comments from NIP-22 replies.
- Moderation state from maintainer authority, NIP-56 reports, and client filtering.

Avoid adding AppWeaver-specific issue fields unless NIP-34 tags are not enough. Extra tags can be added later if a concrete need appears.

Suggested board statuses/columns:

- Planned
- In Progress
- Shipped
- Rejected
- Archived

Assignment rules:

- User-created issues start unassigned.
- Funding does not automatically assign an issue to the board.
- Only maintainers can assign an issue to `Planned`, `In Progress`, `Shipped`, `Rejected`, or `Archived`.
- `Rejected` means the issue was considered and will not be pursued.
- `Archived` means the issue is spam, invalid, obsolete, duplicate, or not useful to show by default.

Open question: whether bug reports later need separate statuses such as Confirmed or Needs Reproduction.

## 6. Workflow And Board Model

The AppWeaver model should be issue-first, not board-first.

Useful lessons from the referenced Kanban drafts:

- A board definition event is useful for naming a project and defining possible columns/statuses.
- Stable issue events are useful because each issue has a durable identity.
- A board can be a view over issues rather than the owner of all issue data.
- Large ordered card lists inside a single board event are not necessary for the MVP.
- Maintainer authority must be explicit, because users can submit issues but should not control board assignment.

Recommended AppWeaver model:

```text
Issue = canonical user-created feature/bug event
Board/workflow = maintainer-controlled event defining statuses/columns
Tracker = maintainer-controlled assignment of an issue to a board/workflow column
Funding events = payment proofs referencing an issue
Views = client-specific projections over issues, board assignments, and funding
```

This supports several UI shapes without changing the data model:

- Public top-funded unassigned issue list on the landing page.
- Singleton in-app timeline widget from the header button.
- Status accordion view for public browsing.

### 6.1 Board Scope

AppWeaver likely needs more than one board:

- Core AppWeaver board.
- One board per official plugin.
- Possible boards exposed by plugins themselves through the BotPlugin system.

Official plugins already have their own NIP-34 repository/project anchors. A plugin board can use that plugin's NIP-34 repo event as its issue anchor.

The existing plugin catalog event can also help connect plugin metadata to boards. In the current codebase, plugin install/catalog parsing uses plugin events with kind `32107`, and includes fields such as plugin name, repository, version, and compatible refs. A plugin roadmap can link to both:

- The plugin's NIP-34 repository announcement for issues.
- The plugin event (`kind:32107`) for AppWeaver plugin identity/metadata.

Unofficial plugins should not automatically appear in the official AppWeaver roadmap. They may expose their own board, but the app should distinguish official boards from third-party/plugin-maintainer boards.

### 6.2 Unassigned Issues Vs Board Roadmap

Unassigned issues are the public feedback pool. They contain valid user-created bugs and feature requests that have not been placed on the maintainer-controlled board.

The roadmap board is the subset of issues that a maintainer has assigned to a status/column.

This distinction is important for product messaging:

- A funded unassigned issue means users care about it.
- A planned issue means the maintainer accepted it as roadmap-relevant.
- An in-progress issue means the maintainer is actively working on it.
- A shipped issue means the work was completed.
- A rejected issue means the maintainer decided not to pursue it.

### 6.3 Kanban-Like UI Without Kanban Lock-In

A classic Kanban board may be too heavy for the in-app and landing-page views. The same workflow can be represented as accordions or sections:

```text
Top Funded
  issue
  issue
  issue

Unassigned
  issue
  issue

Planned
  issue

In Progress
  issue

Shipped
  issue
```

For maintainers, the same statuses can become columns:

```text
Unassigned | Planned | In Progress | Shipped | Rejected | Archived
```

The important design constraint is that board assignment and movement between columns are maintainer actions, not user actions.

## 7. Ranking Model

The MVP ranking should be simple:

```text
sort by funding_total descending
tie-break by created_at ascending
```

This makes the system easy to explain:

> The most-funded unassigned issues appear first.

Clients should compute funding totals from verified zap receipts. For the MVP, clients should not treat relay acceptance as proof of payment. Instead, the client derives the board author's Lightning address from kind `0` profile metadata, fetches the LNURLP document, reads the LNURLP `nostrPubkey`, and only counts zap receipts authored by that pubkey.

Aggregate tables and summary events can be added later for performance, but they are not required for the first version.

Future ranking improvements may include:

- Recent funding momentum.
- Maintainer priority pins.
- Status-aware grouping.
- Caps to reduce domination by one large funder.
- Separate bug and feature rankings.

These should be deferred until there is real usage data.

## 8. Payments

### 8.1 Client-Verified Funding

The MVP should start with repo relays rather than a dedicated AppWeaver relay. Repo relays are the `relays` tag values on the NIP-34 repository announcement. Clients can use the repo author's NIP-65 outbox write relays to discover the announcement, but the announcement's `relays` tag is the final project-level relay set for board/workflow events, tracker events, created issues, comments, status events, and zap receipts for that repository.

The verification rule is:

```text
board author kind:0 lud16/lud06
  -> LNURLP payRequest document
  -> LNURLP nostrPubkey
  -> zap receipt pubkey must match
```

Clients can fetch roadmap events and zap receipts from repo relays plus relevant NIP-65 relays, verify the receipts locally with this rule, sum the verified amounts, and sort issues by total funding.

Expected flow:

```text
User chooses an issue
  -> clicks Fund
  -> chooses amount
  -> sends zap linked to the issue
  -> zap provider publishes a NIP-57 receipt
  -> client fetches receipts from repo relays and relevant NIP-65 relays
  -> client counts the receipt only if its pubkey matches the board author's LNURLP nostrPubkey
```

### 8.2 Nutzaps

Nutzaps fit the product values well:

- Nostr-native.
- Good for small payments.
- Better privacy than public Lightning zaps.
- Compatible with Cashu wallets.
- Verifiable without relying on fake public zap receipts.

When Nutzaps are added, clients or a later indexing/relay service should verify as much as practical before counting the event:

- The event references a valid AppWeaver issue.
- The mint is accepted by AppWeaver policy.
- The proofs are valid and not already counted.
- The token is spendable by the AppWeaver receiving key.
- The token can be redeemed or swapped into the maintainer wallet.

The event should only count after successful verification and redemption/swap. Nutzaps are not part of the first landing-page path.

### 8.3 Lightning Zaps

Lightning zaps should be supported with client-side receipt verification. The system must not blindly trust arbitrary NIP-57 zap receipts.

Client verification for Lightning zaps should verify:

- The zap receipt references a valid AppWeaver issue.
- The zap receipt author pubkey matches the `nostrPubkey` from the board author's LNURLP payRequest document.
- The paid amount matches the amount being counted.
- The invoice metadata links to the expected issue context when available.
- The payment hash has not already been counted.

Fake, unverifiable, duplicate, or unrelated zap receipts must be ignored and must not affect funding totals.

### 8.4 Refunds And Expectations

The MVP should avoid bounty or escrow semantics.

Funding is a voluntary signal. Refunds should not be promised by default unless a separate bounty/escrow product is introduced later.

## 9. Moderation And Abuse

Because issue creation is free and events may be fetched from public relays, moderation is required.

MVP controls:

- Rate limit issue creation per pubkey.
- Hide obvious spam.
- Allow maintainers to archive invalid issues.
- Allow duplicate marking instead of deleting useful signals.
- Filter low-quality issues from default public views if needed.
- Use NIP-56 reports from the maintainer or moderators as moderation signals.
- Ignore events from abusive users in the client projection.
- Add relay deletion/ban policy later if AppWeaver introduces its own relay or indexer.

Possible later controls:

- Minimum account age or proof-of-work for creation.
- One-time payment before creating issues.
- Minimum funding threshold for landing-page visibility.
- Hide unpaid issues by default.
- Moderator approval for unpaid issues.
- Paid promotion for visibility without implementation guarantee.
- Relay-level allow/block lists.
- Relay dashboard for deletion, bans, moderation review, and policy changes without restarting the relay.

Important distinction:

- Creating an issue should be easy.
- Appearing prominently on the public roadmap should depend on funding, maintainer curation, or both.

NIP-56 is useful because moderation can stay event-based and auditable. If the maintainer or an accepted moderator reports an event as spam, abuse, or another moderation reason, clients can use that report to hide the event in the roadmap projection. A later AppWeaver relay or indexer can also use the same report events for deletion, bans, or review workflows.

The relay dashboard is not part of the MVP, but the relay should be designed so moderation state can eventually be changed at runtime rather than requiring relay restarts.

## 10. Nostr Architecture

NIP-34 gives AppWeaver a good base for issues. The module should reuse NIP-34 issue semantics where possible, then add a maintainer-controlled board layer for roadmap assignment.

### 10.1 Project / Repository Anchor

If AppWeaver wants compatibility with NIP-34 clients, it should announce the project with a NIP-34 repository announcement, even if the Roadmap UI is product-focused rather than Git-focused.

```json
{
  "kind": 30617,
  "content": "",
  "tags": [
    ["d", "appweaver"],
    ["name", "AppWeaver"],
    ["description", "Nostr-native app builder"],
    ["web", "https://getappweaver.com"],
    ["relays", "wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.snort.social", "wss://nostr.mom", "wss://nos.lol"]
  ]
}
```

The repository/project announcement gives issues a canonical `a` tag target.

### 10.2 Relay Strategy And NIP-65 Outbox

The MVP should start on repo relays instead of requiring an AppWeaver-controlled relay. Repo relays are the `relays` tag values on the NIP-34 repository announcement. Clients may use public discovery relays only to resolve an author hint, find the owner's NIP-65 relay list, and fetch the repository announcement.

Discovery/bootstrap relays:

```text
wss://purplepag.es
wss://relay.nos.social
wss://user.kindpag.es
wss://relay.damus.io
wss://relay.primal.net
```

Relay resolver:

```text
repoAddress = nostr://_@getappweaver.com/core
authorPubkey = nip05(repoAddress.authorHint)
announcementDiscoveryRelays = nip65WriteRelays(authorPubkey)
repoAnnouncement = query kind:30617 by authorPubkey and d tag from announcementDiscoveryRelays
repoRelays = repoAnnouncement.tags.relays
```

The repository announcement `relays` tag is the relay set that clients monitor for issues, board/workflow events, tracker events, comments, status events, and funding receipts. Created issues should be published to those relays as well. The repository owner's NIP-65 write relays remain the discovery path for finding or refreshing the repository announcement itself. If the announcement has no `relays` tag, clients may fall back to the owner's NIP-65 write relays.

Clients should subscribe to relevant event classes on repo relays:

- AppWeaver core NIP-34 repository/project announcement.
- Official plugin NIP-34 repository/project announcements.
- Official plugin catalog events, currently `kind:32107`.
- NIP-34 issues for allowed AppWeaver/plugin project anchors.
- NIP-22 comments on accepted issues.
- NIP-34 status events for accepted issues.
- Board/workflow events for allowed project anchors.
- Tracker events assigning accepted issues to accepted workflows.
- Zap receipts referencing accepted issues.
- NIP-56 reports from accepted moderators or board/project authors.

Because these are public relays, clients must filter and validate the event graph themselves. A dedicated AppWeaver relay or indexer can be added later for performance, moderation, and stricter write policy, but it should not be required for the first public roadmap.

NIP-65 relay lists should augment repo relays for publishing and discovery:

- Repo relays are the project-level inbox and public discovery set, derived from the NIP-34 repository announcement `relays` tag.
- Repo owner NIP-65 write relays are used to discover the repository announcement when only an author hint and repo `d` tag are known.
- Author write relays are where the event author expects their signed events to be published.
- Target read relays are where referenced users are more likely to see events about them.
- Clients should dedupe events across all relays by event ID.

Suggested publish targets:

| Action | Publish to |
|--------|------------|
| Create issue | Repo owner NIP-65 write relays + issue author NIP-65 write relays |
| Comment on issue | Repo relays + commenter NIP-65 write relays + replied-to author NIP-65 read relays |
| Zap issue | Repo relays + zapper NIP-65 write relays + repo owner NIP-65 read relays |
| Close own issue | Repo relays + issue author NIP-65 write relays |
| Close/resolve issue as owner | Repo relays + owner NIP-65 write relays + issue author NIP-65 read relays |
| Tracker assignment/status change | Repo relays + board/repo owner NIP-65 write relays + issue author NIP-65 read relays |
| Board/workflow update | Repo owner NIP-65 write relays |

For reading, clients should start with repo relays and optionally query relevant NIP-65 read relays for issue authors, board authors, zappers, and commenters when more complete discovery is needed.

### 10.3 Board Authority

To avoid delegated authority complexity, AppWeaver should derive roadmap authority from event authorship. The project/repository event author is the project owner, and the board/workflow event author must be the same key.

Authority rules:

- A board/workflow event is authoritative only when its author matches the author of the referenced NIP-34 project/repository event.
- A tracker event affects a board only when authored by that board's author.
- A tracker event should be ignored if its workflow points to a board whose author does not match the referenced project/repository author.
- AppWeaver should not treat third-party tracker events as board assignments, even if they reference the same workflow and issue.
- If board control needs to move to a new key, the new board author should publish a replacement board/workflow and replacement tracker events.

For official plugin boards, the same rule applies: the plugin board author must match the plugin's NIP-34 project/repository author. If plugin catalog metadata is linked, clients can also require the plugin catalog event author to match the same key.

This is simpler than trying to determine whether another key was a valid maintainer at the time a tracker was created. If AppWeaver later needs multi-key administration, it should add an explicit AppWeaver delegation mechanism instead of relying on the NIP-34 repository announcement.

### 10.4 Issue Events

Users create issues with NIP-34 `kind:1621` events.

```json
{
  "kind": 1621,
  "content": "Markdown description of the bug report or feature request.",
  "tags": [
    ["a", "30617:appweaver-owner-pubkey:appweaver"],
    ["p", "appweaver-owner-pubkey"],
    ["subject", "Add project export"],
    ["t", "feature"],
    ["t", "appweaver"]
  ]
}
```

Recommended issue labels:

- `feature`
- `bug`
- Product-area labels such as `editor`, `publishing`, `wallet`, or `landing`
- Platform labels such as `desktop`, `mobile`, or `web`

Replies and discussion should use NIP-22 comments, as NIP-34 recommends.

### 10.5 NIP-34 Status Events

NIP-34 defines status events for issues:

- `kind:1630` means Open
- `kind:1631` means Resolved
- `kind:1632` means Closed
- `kind:1633` means Draft

These are useful for broad issue state. They should be used alongside board/tracker events, not instead of them.

Examples:

- Maintainer decides an issue should not be implemented and publishes `kind:1632` Closed.
- User realizes their issue is wrong or obsolete and publishes `kind:1632` Closed.
- Maintainer assigns an issue to the board, ships the work, then publishes `kind:1631` Resolved on the original issue.
- Maintainer keeps an issue open while it is planned or in progress on the board.

Recommendation:

- Use NIP-34 issue events as canonical issues.
- Use NIP-34 status events for broad issue lifecycle state.
- Use separate AppWeaver board/tracker events for roadmap column assignment.

This gives both sides flexibility. Users can close their own issue when appropriate. Maintainers can close or resolve issues at the NIP-34 layer, and separately control roadmap placement through board/tracker events.

### 10.6 Board / Workflow Event

The board event is controlled by the maintainer. It defines the roadmap workflow: title, description, columns, and visual metadata.

After reviewing the workflow and Kanban proposals, the better model is:

- Board/workflow event defines columns.
- Separate tracker events assign existing issues to those columns.
- Issues remain canonical NIP-34 issue events.

This avoids large mutable board events that contain every card assignment. It also avoids race conditions if automation later updates assignments.

Possible board/workflow event shape. The exact AppWeaver event kind can be chosen later; the important schema decision is the tags and relationships.

```json
{
  "kind": 39010,
  "content": "",
  "tags": [
    ["d", "appweaver-roadmap"],
    ["title", "AppWeaver Roadmap"],
    ["description", "Maintainer-selected AppWeaver roadmap issues"],
    ["col", "planned", "Planned"],
    ["col", "in-progress", "In Progress"],
    ["col", "shipped", "Shipped"],
    ["col", "rejected", "Rejected"],
    ["col", "archived", "Archived"],
    ["a", "30617:appweaver-owner-pubkey:appweaver", "wss://relay.damus.io", "project"]
  ]
}
```

Only board-author-signed board/workflow events should be accepted as the canonical AppWeaver roadmap board, and the board author must match the referenced project/repository author.

### 10.7 Tracker Events For Board Assignment

Tracker events are the assignment layer. A tracker says: this issue is tracked in this workflow, with this workflow-specific state.

For AppWeaver, the tracker content can be the column ID.

Possible tracker event shape. The exact AppWeaver event kind can be chosen later.

```json
{
  "kind": 39011,
  "content": "in-progress",
  "tags": [
    ["d", "appweaver-roadmap:issue-event-id-1"],
    ["e", "issue-event-id-1", "wss://relay.damus.io", "tracked_item"],
    ["a", "39010:appweaver-board-pubkey:appweaver-roadmap", "wss://relay.damus.io", "workflow"],
    ["rank", "10"]
  ]
}
```

The tracker uses both `d` and `e` tags for different reasons:

- `d` gives the parameterized replaceable tracker event a stable assignment key for one workflow/issue pair.
- `e` is the canonical Nostr reference to the tracked issue event.
- Clients should not parse the issue ID out of `d` as the source of truth.
- If `d` and `e` disagree, the tracker should be ignored.

Using only `d` would make the event harder to query with standard `#e` filters and would hide the actual issue relationship inside an AppWeaver-specific identifier.

Tracker rules:

- Only tracker events authored by the board author should affect the AppWeaver board, and the board author must match the referenced project/repository author.
- The tracker `content` is the board column ID, such as `planned`, `in-progress`, `shipped`, `rejected`, or `archived`.
- The optional `rank` tag can define manual ordering inside a column.
- If multiple valid trackers exist for the same issue and workflow, clients should use the latest valid tracker by `created_at`, unless a later spec defines different consensus rules.
- Deleting or replacing a tracker removes or changes the board assignment; the original issue remains intact.

Unassigned issues are all valid NIP-34 issue events for the AppWeaver project that have no latest valid tracker in the AppWeaver roadmap workflow.

### 10.8 Funding Events

Users zap/fund issues directly, not board columns.

Funding events should reference the issue event ID. For Nutzaps, the event should include an `e` tag pointing to the `kind:1621` issue.

Repo and NIP-65 relays are transport, not payment authority. Clients should compute funding totals by scanning zap receipts from repo relays and relevant NIP-65 relays, then verifying that each receipt was authored by the LNURLP `nostrPubkey` for the relevant board author.

This means ordering is deterministic for clients that use the same relay set and verification rules:

```text
funding_total(issue) = sum(amount of verified funding events referencing issue)
```

If a funding event cannot be verified against the board author's LNURLP payRequest metadata, it does not count toward ranking.

Board assignment does not affect funding. If a funded issue later moves from unassigned to `Planned`, the issue keeps its funding total.

### 10.9 Derived Views

Clients can derive the main views from the same data:

- Unassigned issues: NIP-34 issues for AppWeaver without a latest valid tracker in the AppWeaver roadmap workflow, sorted by verified funding total.
- Roadmap board: issues referenced by valid tracker events for the board workflow, grouped by tracker column.
- Top funded: all visible issues, or only unassigned issues, sorted by verified funding total depending on UI context.

Current technical decisions:

- Issues use NIP-34 `kind:1621`.
- Issues are regular events, so references should use `e` tags.
- NIP-34 status events should be used alongside board/tracker events.
- Repo relays come from the NIP-34 project announcement `relays` tag, with repo owner NIP-65 write relays used for announcement discovery and fallback.
- NIP-65 relay lists augment repo relays for publishing and discovery.
- Funding summary events and aggregation tables are not part of the MVP.
- Draft board/workflow proposals are useful references, but AppWeaver does not need to commit to their exact event kinds yet.

Duplicate handling can be simple:

- Maintainer or moderator comments on the duplicate issue with a link to the canonical issue.
- Maintainer closes the duplicate with NIP-34 `kind:1632` Closed.
- Client UI can display the maintainer note and direct users to fund/comment on the canonical issue.

If duplicates become common, AppWeaver can later standardize a tag or tracker convention for `duplicate-of`, but that is not needed for MVP.

## 11. Monetization Strategy

The first monetization target is AppWeaver itself, not a generic SaaS product.

### 11.1 Direct Monetization

Users can fund specific issues they care about.

This creates a lightweight open-source funding loop:

```text
User has a need
  -> submits or finds an issue
  -> funds it
  -> issue rises publicly
  -> maintainer sees stronger demand
  -> development priorities become easier to justify
```

This does not sell implementation guarantees. It sells influence as signal.

### 11.2 Indirect Monetization

The public roadmap can also increase AppWeaver revenue by showing:

- Active development.
- Transparent prioritization.
- A real user community.
- Public proof that people are willing to fund improvements.

This can support subscriptions, paid plans, sponsorships, or future commercial features.

## 12. MVP Scope

### Phase 1: Public Roadmap Data And View

- Define the AppWeaver NIP-34 project/repository announcement.
- Use NIP-34 `kind:1621` for issue events.
- Start with repo relays from the NIP-34 repo event `relays` tag, discovering that repo event through NIP-05 and repo owner NIP-65 when needed.
- Define the maintainer board event format.
- Define tracker events for board assignment.
- Publish and read feature/bug issues from Nostr.
- Build landing-page read view sorted by total funding.
- Show issue type, title, board assignment, funding total, and created date.
- Include clear funding disclosure.

### Phase 2: In-App Submission

- Add AppWeaver header Roadmap button.
- Build the singleton in-app timeline widget.
- Search existing issues before creating a new one.
- Let users submit feature requests and bug reports.
- Encourage commenting/funding existing issues instead of creating duplicates.
- Include optional app context such as version, platform, and logs when appropriate.
- Publish signed Nostr events.

### Phase 3: Funding

- Add funding button to issues.
- Implement client-side verification for zap receipts: board author `lud16`/`lud06` -> LNURLP -> `nostrPubkey` -> zap receipt pubkey.
- Ignore unverifiable, duplicate, or unrelated payment events.
- Compute funding totals client-side from verified zap receipts fetched from repo relays and relevant NIP-65 relays.
- Display funding totals and funding count.

### Phase 4: Maintainer Tools

- Assign issues to board statuses/columns.
- Open an issue detail UI when clicking an issue title.
- Add assignment controls in the issue detail UI.
- Hide/archive spam.
- Mark duplicates.
- Add maintainer notes.
- Publish NIP-34 status events when issues are closed or resolved.

## 13. Open Questions

| Question | Current Leaning | Status |
|----------|-----------------|--------|
| Should bugs and features share one ranked list? | Start together, add filters | Pending |
| Should landing page show all issues or only funded/top issues? | Top funded only | Decided |
| Should maintainers be able to pin issues above funded ranking? | Maybe later | Pending |
| Should funding totals be computed client-side or published by AppWeaver? | Client computes from locally verified zap receipts | Decided |
| Which Nostr event kind should be used for issues? | NIP-34 `kind:1621` | Proposed |
| Should anonymous/throwaway submissions be encouraged? | Useful, but may increase spam | Pending |
| What minimum moderation tools are required before public launch? | Hide/archive/rate limit/NIP-56 reports | Pending |
| Should board assignment be separate from the board definition? | Yes, use tracker events | Proposed |
| How should official plugin boards be discovered? | NIP-34 repo + plugin `kind:32107` metadata | Proposed |

## 14. Next Decisions Needed

Before development starts, decide:

1. The exact Nostr event model for the board workflow, tracker assignments, and funding references.
2. Whether the public status accordion should be available on the landing page immediately or after the top-funded list.
3. Whether bug reports and feature requests need different form fields in the first version.
4. The exact issue detail UI and assignment controls for board workflow actions.
5. Whether and when to add an AppWeaver relay or indexer after the public-relay MVP.

## 15. Current Summary

Build a Nostr-native Roadmap module for AppWeaver first.

Anyone with Nostr can submit feature requests or bug reports for free as NIP-34 issues. New issues start unassigned. Users should search before submitting and comment/fund an existing issue when one already exists. Any user can fund any issue. Funding is a public prioritization signal, not a contract. The MVP uses repo relays from the NIP-34 repo event `relays` tag, after discovering that repo event through NIP-05 and repo owner NIP-65 when needed, and created issues are published to those relays. Clients compute funding totals by verifying zap receipts against the board author's LNURLP `nostrPubkey`. Board authors control workflow events that define board columns for AppWeaver core and official plugins, and clients should only accept boards whose author matches the referenced NIP-34 project/repository author. Tracker events assign selected issues to planned, in progress, shipped, rejected, or archived columns. The app provides creation and funding through a header Roadmap button that opens a singleton timeline widget; the landing page highlights top-funded unassigned issues and can show roadmap boards as separate widgets. The next maintainer tooling step is an issue detail UI, opened from the issue title, with assignment controls that publish tracker events.
