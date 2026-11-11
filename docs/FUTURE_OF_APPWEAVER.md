# AppWeaver: FIPS Networking and Local-First Team Apps

Status: reviewed architecture with core, FIPS and Teams Todo MVP code implemented
and locally checked. Deployed network, portability and authenticated UI acceptance
remain pending; see each implementation record. Updated on 2026-11-11.

## Implementation records

Work is organized into reviewable increments. The user subsequently authorized
implementing core, FIPS and then Teams Todo in one batch; push/publication remain
user actions, not automatic agent steps.

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
  remain; the decision to drop signing applies to app-access grants only.
- The plugin implements Nostr-signaled UDP NAT traversal, FMP/FSP encryption,
  optional WebSocket seeds, a roster and manual ping. Cross-network encrypted ping
  has been demonstrated; continuous recovery and routed mesh use need more work.
- Node tree management, aliases and legacy unique-master migration are implemented.
- Revised app sends address explicit FIPS keys and use protocol/topic plus text or
  raw binary payloads. Soft-grant checks gate both directions; incoming messages
  route only to the unique protocol owner. A send result is not a durable receipt.
- Personal [Todo](../plugins/todo/README.md) remains a separate SQLite app. The new
  [Teams Todo MVP](../plugins/teams-todo/README.md) uses xitdb source histories and
  local-only SQLite control state; local simulated-peer checks passed.

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
| Head | App-owned committed history position for a particular writer/log |

**Core** defines generic contracts, carries normal caller context and supports
explicit owner-driven management surfaces. No FIPS or team-app branches belong
in `src/` or `web/`.

**FIPS** owns pairing, direct connections, connection health, text/binary message
delivery, protocol routing and grant persistence/enforcement. It does not own
subscription records, publication fan-out, project membership, databases, merges
or review decisions.

**Teams Todo** owns boards, membership, app messages, subscriptions, notifications,
replication, durable acknowledgements, deduplication and conflict policy. Other
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
- The owner reviews explicit access requests and clicks Allow / Save / Remove.
  Apps request access but cannot approve or expand their own records through the
  normal capability API. Background denials never open permission prompts.
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

## 5. App-owned subscriptions and implicit board groups

FIPS is bidirectional, but subscriptions are directional application messages:

```text
A -> B: subscribe(protocol = teams-todo.sync.v1, topic = board-id)
B: check membership; persist A in Teams Todo's DB; reply accepted/rejected
B commits an update: send a notification separately to each subscriber
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

Commit locally before notifying. Debounce bursts and serialize/coalesce sync per
board/writer. Notifications are hints: reconnect and periodic reconciliation, plus
Sync now, recover missed hints. The app distinguishes durable receipt from applying
or reviewing a change.

## 6. Storage and heads

[`xitdb-ts`](https://github.com/xit-vcs/xitdb-ts#replication) is the first candidate,
subject to an MVP feasibility check on a pinned version. It offers immutable
moments and committed-byte replication, not automatic event sourcing, multi-writer
merge, authorship verification or CRDT convergence.

- Each FIPS node is the single writer of its own board log. Keep separate,
  read-only tracking replicas for other writers; never write directly to a replica.
- A head is a position in one identified writer/log, not `updated_at`. The documented
  replication state includes committed size and a latest-commit checksum; associate
  it with the log identity and generation. It is not a cryptographic author proof.
- Use the library's `replicaState`, `replicationStart`, `committedSize`,
  `readCommitted`, and `openReplicated` mechanisms after verifying the pinned API.
  Independently created databases with equivalent tasks need not have equal bytes.
- Isolate board replication files: raw replication must not disclose other boards
  or unrelated local app data. Handle file replacement/reset using staging files;
  interrupted full replacement must preserve the last usable replica.
- Transfer raw bytes in bounded app-level chunks. Verify cross-OS/architecture
  portability and runtime responsiveness rather than assuming it from TypeScript.
- Events, projections, causal metadata, conflicts, merge and Git-style review are
  app responsibilities. Immutable snapshots alone do not implement those policies.

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

Teams Todo shows board membership, pending access, connection state, last sync and
pending/error state separately. Normal edits work offline. The MVP borrows the
personal Todo tree/menu/draft interaction style, not its full feature set.

Paid `teams-*` apps are a possible product direction. Licensing, payments and
purchase enforcement are not requirements for the first networking/sync MVP.
Pairing grants no shell/filesystem or blanket project permissions.
