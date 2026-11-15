# AppWeaver: FIPS Networking and Local-First Team Apps

Status: initial core/FIPS/Teams Todo MVP implemented and locally checked. First
deployed review exposed setup/UI gaps and a local missing-grant blocker. The owner
approved the current target: SQLite semantic change events, manual publication,
independent incoming review and optional agreement, integrated owner setup and
direct invitations. Teams Todo now has a SQLite-only runtime with independent
simulated peers, explicit publication and a separate inbox requiring individual
acceptance before peer-database writes. Real FIPS event sync, merge and guided setup
remain pending. Earlier xitdb/signed-entity proposals are superseded; xitdb code/data
and dependency were explicitly removed. Deployed sync and UI acceptance remain open.

## Implementation records

Work is organized into reviewable increments. The initial MVP implementation is
historical evidence; the revised plans record the newly approved work. Revising
these plans does not itself authorize implementation or publication. Push/release
remain user actions, not automatic agent steps.

1. [Core peer-capability plan](PEER_CAPABILITIES_IMPLEMENTATION_PLAN.md).
2. [FIPS grants, messaging and recovery plan](../plugins/fips/docs/peer-access-plan.md).
3. [Teams Todo MVP plan](TEAMS_TODO_IMPLEMENTATION_PLAN.md).

The [existing FIPS progress record](../plugins/fips/docs/implementation-plan.md)
retains earlier implementation evidence and transport follow-ups. The plans above
define the next phases. Revise the existing v1 contracts in place: this is beta /
research, with no v2, compatibility bridge, dual wire format or coordinated-version
rollout requirement. Implementation dependencies still determine phase order.

## 1. Current baseline

- Core has one bot identity and one human master per AppWeaver instance. Plugins
  run in-process and use versioned capability contracts.
- FIPS has a separate encrypted-at-rest node identity. Multiple FIPS nodes can
  share a human master. FIPS keys identify nodes; aliases are local display names.
- Signed `fips2:` invitations bind owners to node keys. These pairing signatures
  remain. App grants remain unsigned; the new Teams Todo increment also relies on
  authenticated direct-origin delivery instead of per-entity signatures.
- The plugin implements Nostr-signaled UDP NAT traversal, FMP/FSP encryption,
  optional WebSocket seeds, a roster and manual ping. Cross-network encrypted ping
  has been demonstrated; continuous recovery and routed mesh use need more work.
- Node tree management, aliases and legacy unique-master migration are implemented.
- Revised app sends address explicit FIPS keys and use protocol/topic plus text or
  raw binary payloads. Soft-grant checks gate both directions; incoming messages
  route only to the unique protocol owner. A send result is not a durable receipt.
- Personal [Todo](../plugins/todo/README.md) remains a separate SQLite app. The new
  [Teams Todo](../plugins/teams-todo/README.md) now uses independent SQLite peer stores
  and a physically separate incoming inbox. In-process simulated exchange/acceptance
  checks passed; these do not establish real FIPS integration.

## 2. Terminology and layer boundaries

| Term | Meaning / owner |
| --- | --- |
| FIPS node | A particular endpoint identified by its compressed FIPS public key |
| Master | Human owner identity; not a unique network destination |
| App | A locally registered plugin, keyed by its installed alias for this MVP |
| Protocol | App-owned message protocol, e.g. `teams-todo.sync.v1` |
| Topic | App-defined exact scope within a protocol, e.g. a board UUID |
| Grant | Local database record allowing an app to communicate within a scope |
| Subscription | App-owned request to receive a peer's updates on a protocol/topic |
| Receipt cursor | App-owned contiguous published-event position durably received from an origin |
| Working changes | Durable local edits that are not yet eligible for replication |
| Published history | Immutable origin events explicitly released by Send updates |
| Accepted view | Projection selected by this peer's review/resolution decisions |
| App invitation | Bounded paired-node onboarding message, not a FIPS pairing code or grant |

**Core** defines generic contracts, carries normal caller context and supports
explicit owner-driven management surfaces. No FIPS or team-app branches belong
in `src/` or `web/`.

**FIPS** owns pairing, direct connections, connection health, text/binary message
delivery, protocol routing, grant persistence/enforcement and
the bounded pre-grant app-invitation carrier. It supplies authenticated owner
selection/setup surfaces. It does not own app invitation business rules,
subscription records, publication fan-out, project membership, databases or merges.

**Teams Todo** owns boards, immutable change events, membership and invitation rules,
working changes, explicit publication, subscriptions, notifications, replication,
durable acknowledgements, review decisions, projections and optional agreement. Other
`teams-*` apps may reuse a library once this first implementation reveals common
behavior; no generic replication framework is required first.

## 3. Soft app-access grants

Core currently exposes `PluginIdentity { name, alias, version }`, not a persistent
installation UUID. Normal capability clients attach a caller containing package
name and alias. Use the registered alias as the MVP app key; package name is
additional context, not verified publisher identity. No new app-install ID,
publisher verification, permission signing or Nostr grant events are required.

A grant contains:

```text
id
appAlias
localFipsPubkey
remoteFipsPubkeys[]
protocol
topics[]
createdAt / updatedAt
```

- One protocol, one or more explicit remote node keys, one or more exact topics.
  Every listed peer is allowed for every listed topic; separate records express
  different scopes. No direction, expiry, wildcard, prefix or all-future-topic rule.
- Bidirectional application access; multiple grants are combined by union.
- Deny by default for outgoing and incoming application messages. Pairing and
  encrypted transport maintenance do not grant application access.
- **Create & share** / **Accept & join** are explicit authenticated owner approval
  surfaces. They display the board/members/access scope and save the required exact
  local grants as part of setup, without a separate grant-editing trip. Manual
  Allow / Save / Remove remain available. Ordinary app/background capabilities
  cannot self-approve or expand records; invitation receipt alone grants nothing.
  Owner workflows must bind approval to stored validated scope and survive retries
  across app/provider persistence without pretending to be one cross-DB transaction.
- Grant updates are regular atomic DB edits. Cancellation leaves the old record
  unchanged. Deletion takes effect for future operations and queued delivery;
  previously sent bytes cannot be recalled. No signed-import replay mechanism or
  revocation tombstones are needed.
- Do not delete, rewrite or reassign grants automatically when a node is unpaired,
  a local identity changes, or an app is disabled/uninstalled. Display unavailable
  references and let the owner manage them. Matching still requires the current
  local FIPS key, a paired remote node and an active owning app/provider. Alias
  reuse can match retained records; it is not a fresh-install identity guarantee.
- Apps see their own grants through capabilities, never FIPS SQL. The owner-facing
  FIPS UI sees all records. Explicit owner peer selection can include ungranted
  nodes; ordinary app peer enumeration returns only authorized peers.
- Membership changes that add peers/topics require explicit owner review of the
  expanded scope. Routine retries and repeated/replayed invitation acceptance must
  not silently restore revoked grants. App reset can offer explicitly scoped owner
  grant removal; ordinary leave/unpair/uninstall still does not auto-clean grants.

These are **soft permissions**: trusted plugins share the process and may bypass
normal APIs. A broker-supplied alias is useful context, not unforgeable isolation.
Display this once in access management, without claiming a security sandbox.
An isolated Safe Apps Runtime remains a separate future track.

## 4. Protocol routing and direct messages

Revise `peer-network:v1` / `peer-channel:v1` without changing their capability names.
Replace the old message `channel` field with `protocol` and add `topic`.

- Consumer providers declare supported protocol names. Route incoming messages
  only to the registered owner, not every provider. Reject conflicting local
  claims. This is a soft local registry, not cryptographic namespace ownership.
- Route to an explicit remote FIPS key, not the human master. Different aliases
  on two machines may implement the same protocol; local aliases are not remote
  wire addresses.
- Support text and raw binary payloads. Preserve `Uint8Array` in-process; any
  JSON-only boundary needs an explicit, validated byte encoding rather than
  implicit object serialization. Advertise provider byte limits.
- Remove the generic nullable signature field. If an app needs signed content,
  its protocol carries and verifies it. Authenticated sender node/owner metadata
  comes from the FIPS session and verified roster binding.
- One send targets one peer and returns one transport result. A success is not
  remote persistence, acceptance, merge, exactly-once delivery or a read receipt.
- No durable hidden message queue, automatic application-message replay, ordering
  promise, pub/sub operations or subscription DB in the networking capability.
- Bound payloads, queues, concurrent operations and deadlines. Return distinguishable
  permission, protocol, peer, size, overload, timeout and transport failures.

### Approved pre-grant onboarding path (new work)

Ordinary board messaging cannot deliver the first invitation before the recipient
has a grant. Add a narrowly bounded authenticated invitation carrier between
already-paired nodes, separate from ordinary app send authority. Route only to the
active declared invitation handler/inbox for the app protocol; never broadcast to
all plugins or carry arbitrary board history over this exception.

FIPS owns framing/authentication/bounds and owner approval integration; Teams Todo
owns the descriptor, authenticated creator/membership validation, recipient binding and
join decision. Persist bounded invitation IDs, expiry, delivery/decision state and
duplicate handling. Invitations may require chunking under advertised budgets;
do not assume a 32-member descriptor fits the existing 512-byte payload.
Receiving/acknowledging delivery does not install an app, import a board or grant
access. Accept & join authorizes those local app/grant changes explicitly; Decline
does not. Offline retries are limited to this onboarding workflow, not a hidden
general application outbox in the normal send contract.

No automatic peer pairing: unknown members are visible setup prerequisites.
Automatic invitations for an existing board are distinct from the later FIPS peer
introduction/routed mesh work.

## 5. App-owned subscriptions and implicit board groups

FIPS is bidirectional, but subscriptions are directional application messages:

```text
A -> B: subscribe(protocol = teams-todo.sync.v1, topic = board-id)
B: check membership; persist A in Teams Todo's DB; reply accepted/rejected
B explicitly publishes working updates: notify each subscriber
```

For board members A, B and C, each app requests subscriptions to the other two.
This is implicit group behavior **inside Teams Todo**, implemented with explicit
P2P subscriptions; no central topic host or channel server exists. Membership
changes drive subscribe/unsubscribe and publication eligibility. A grant alone
does not imply interest or project membership.

Every subscribe message, reply, notification and sync request is ordinary
grant-checked application traffic. The app may retain blocked subscription intent
after grant deletion, but FIPS will reject its use. Unsubscribe does not delete a
grant. Reconnect restores app subscriptions through new exchanges; FIPS does not
maintain a second authoritative subscription state.

Local edits save immediately into nonreplicated working state. **Send updates**
captures and commits a published batch before notifying. Later edits stay local.
Debounce hints and serialize/coalesce sync per board/writer. Reconnect/periodic
reconciliation and Sync now recover only already-published history; they never
release pending working changes. Receiving published updates and retrying a released
batch are automatic. The app distinguishes local save, publication, transport send,
remote durable receipt, review, projection and agreement. Receiving events never
automatically accepts them; publication cannot recall events received elsewhere.

## 6. SQLite events, publication and review

The initial MVP used xitdb binary replication; retain its evidence in the
[archived record](../plugins/teams-todo/docs/initial-mvp-and-superseded-plan.md), not
as the new architecture. Use SQLite for events, dependencies, decisions, projections,
publication batches and receipt state. Do not replicate database/WAL files or build
native shared board trees, xit commit/patch machinery or a generic version-control engine.

- Each immutable semantic event identifies its board/task, author, operation/data,
  timestamp and causal context. Pin stable event identifiers in the app; hashing is
  not required for origin attribution. Task identity is independent of mutation ID.
- `basedOn` identifies edited state/conflict context; `requires` identifies semantic
  prerequisites. An origin's transport sequence is not dependency on all prior events.
  Use deterministic causal replay; timestamps/global counters alone do not resolve
  offline concurrency or authorize a winner for competing field edits.
- Maintain indexed current projections incrementally and allow rebuild from events
  and decisions. Historical views can replay or use optional local checkpoints;
  checkpoints are derived acceleration, not authority or required full snapshots.
- Event receipt and acceptance are separate. Persist duplicate-safe incoming payloads
  and contiguous per-board/origin cursors in a **separate inbox database** before
  durable acknowledgement. Do not insert received events, entities or peer metadata
  into a receiving peer database until each item is explicitly accepted. Acceptance
  commits its source event and projection together; declining changes only the inbox.
  Pending/declined/blocked payloads remain received and are not refetched indefinitely.
  A receipt cursor is not acceptance or a merged view.
- Publish working changes in an explicit transaction/batch; all outbound event queries
  filter for released data. Never leak local intermediate work via background pull,
  retry, reconciliation or diagnostics. Chunk bounded app payloads as needed.
- Validate incoming origin against authenticated FIPS sender, plus membership/schema/
  scope. Store provenance. No per-event signature, JCS/NIP-01 signing format or FIPS
  signing capability is required. Human labels derive from verified node-owner
  bindings; this is local trusted attribution, not transferable cryptographic proof.
- Do not blindly accept third-party authorship through forwarding or unsigned import.
  Direct creator messages authorize membership changes; manual imports need explicit
  owner trust review. FIPS's existing signed pairing/signaling remain unchanged.

### Acceptance, dependencies and optional agreement

Retain pending/accepted/declined/blocked/conflicted decisions separately from source
events. Declining creation of Y excludes changes requiring Y, not unrelated later
events. Missing prerequisites are waiting, not rejected. Reconsideration reopens
dependent review instead of auto-accepting it. Resolve competing field values or
delete/edit conflicts explicitly and rebuild affected state transactionally.

Independent accepted views are the base model. Identical events, decisions and rule
versions produce identical projections; different decisions intentionally fork views.
Keep creator, editor, revision actor and any future ownership policy distinct.

Optional agreement proposes an exact accepted change set/resolutions and membership
revision, collecting explicit direct responses from all required participants. An
offline peer leaves agreement pending; altered results need a new proposal. No
automatic quorum/leader/consensus protocol or transferable unsigned agreement proof.
Participants must already possess matching directly attributed origin history.

Clear tasks publishes ordinary deletion actions; local removal stops jobs and prevents
silent rejoin. Fresh board uses new board/stream identities. Reset is explicit local
app cleanup preserving FIPS pairing/identity and other apps, with separately scoped
owner grant cleanup. The initial xitdb data was removed by explicit owner request;
future SQLite resets must remain explicitly scoped rather than rewriting history.

## 7. Connection lifecycle and topology

- Send can establish an authorized connection within a bounded deadline; explicit
  connect is also available. Grants authorize apps, not arbitrary node probing.
- Keep established paired connections reusable while AppWeaver runs; no initial
  idle-disconnect policy. Consumer apps cannot tear down another app's physical link.
- Connected requires fresh authenticated remote evidence. Sending UDP heartbeats
  is insufficient. Expose unknown / connecting / connected / disconnected, last
  confirmed activity and last error separately from app sync status.
- FIPS retries failed established, still-paired links with bounded backoff/jitter
  and repairs relay subscriptions. Apps retry messages and resume sync/subscriptions.
  Connection-change callbacks are hints, backed by app reconciliation.
- Direct links first. Vendored core supports routed datagrams and forwarding, but
  forwarding is disabled by default and the plugin currently forces direct dials.
  Routed mesh requires a separate policy and three-node verification milestone.
- A third peer may courier fresh pairing invitations/acceptances; it cannot approve
  another owner's pairing or grants. Completed invitations cannot be reused as
  automatic introductions. Introduction UI is a later convenience feature.

## 8. UI and product boundaries

Use existing `tree` / `treeItem`, overflow menus and generic command/form primitives.
FIPS lists nodes and all grants; team apps show their own grants with protocols,
topics and exact peer keys. Identify the local endpoint as "My laptop (local FIPS
node)" where appropriate. Do not show Direction, Validity, Verified installation
or permission-signing controls.

Teams Todo `list` contains only board tree rows and human summaries. `show <board>`
places the title/header outside the task tree; task rows borrow personal Todo's
compact checkbox/title/inline-action patterns. Ordinary owner edits save locally
without per-edit drafts; automation review can remain separate. Visible Create &
share, invitations/Accept & join, Send updates and actionable setup/status replace
manual key/UUID/protocol/JSON entry in the normal workflow. Retain command fallbacks.

UI separates saved/unsent/sent/peer-confirmed/blocked state without dumping IDs,
Lamport clocks, byte cursors or log records. Expand readable activity/member panels
as needed; technical details are opt-in diagnostics. Logs contain bounded correlated
stage/direction/attempt/timing/error information, not task bodies or secrets. A
peer's silence cannot establish remote grant denial; only claim synchronization
for durable receipt positions at the last exchange. Show incoming review and differing
accepted views separately; receipt does not imply acceptance or agreement.

Paid `teams-*` apps are a possible product direction. Licensing, payments and
purchase enforcement are not requirements for the first networking/sync MVP.
Pairing grants no shell/filesystem or blanket project permissions.
