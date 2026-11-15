# Peer Capabilities: Core Implementation Plan

Status: initial C1/C2 contracts implemented and locally checked. The approved product
revision requires C3 below: owner setup handoffs and pre-grant invitations
are not implemented contracts yet. Deployed revised acceptance remains open.
FIPS owns grant storage, authenticated delivery, invitation carrier and owner-command UI.
Teams Todo's new target uses SQLite semantic events; the earlier application-signing proposal
is deferred and is not a required capability change.
Source of decisions: [architecture](FUTURE_OF_APPWEAVER.md).
Next owner: core; follow with [FIPS phases](../plugins/fips/docs/peer-access-plan.md)
and then [Teams Todo](TEAMS_TODO_IMPLEMENTATION_PLAN.md).

## Execution rules

- Organize work by phase and record verification. The user authorized completing
  core/FIPS/Teams Todo together in this session; push/publication remain user actions.
  No compatibility shims or v2 rollout.
- Keep core generic. Do not import plugins or implement FIPS/Teams Todo branches.
- Do not delegate docs/core work. If requested, FIPS and Teams Todo implementation
  can later use subagents with bounded file ownership after contracts are settled.
- Follow active repo instructions: targeted ESLint with `--fix`, relevant type /
  schema checks, and plugin generation for registration inputs. Do not add or run
  automated tests unless the user requests them. Use narrowly scoped in-memory
  checks when appropriate; authenticated browser verification requires user access.
- Record observed results, failures and remaining user verification, not intended
  success. Agent commits, pushes and publication require explicit instructions.

## Initial baseline and concrete files (historical)

- `src/capabilities/peer-network.v1.ts`: current list-peers and master-addressed send.
- `src/capabilities/peer-channel.v1.ts`: current receive callback with `channel`.
- `src/capabilities/types.ts`: `CapabilityCaller` already carries plugin name/alias.
- `src/core/registry.ts`: creates plugin-scoped clients with normal caller metadata.
- `src/core/capabilities/registry.ts`: validates/invokes capabilities and attaches caller.
- `src/web/ui-schema.ts` and generic capability/command web actions: shared owner UI
  integration, not a new app-specific renderer.
- No persistent installation UUID exists in the inspected identity/manifest path.
  Key soft grants by installed alias; do not invent verified publisher identity.

## C1 — initial v1 message and callback contracts (historical implementation)

Implemented in `src/capabilities/peer-network.v1.ts` and `peer-channel.v1.ts`.
Text/binary payload schemas, explicit node addressing, six required network operations
plus optional owner member selection,
protocol declarations and connection callbacks are now the active code contract.
Errors are explicit result objects on send/connect, not implicit remote receipts.

### Outbound `peer-network:v1`

Operation names below describe the implemented surface. Exact exported Zod shapes
are authoritative in the two source files.

| Operation | Semantics |
| --- | --- |
| `list-peers` | Caller-authorized nodes only, explicit FIPS keys, owner/alias metadata, connection state and last confirmed activity/error |
| `get-limits` | Provider's byte limits, queue/concurrency bounds and supported text/binary forms |
| `connect` | Explicit destination FIPS key; caller must have an active grant for that paired peer; no payload authority is implied |
| `send` | One destination FIPS key, protocol, exact topic and typed text/binary payload; bounded auto-connect; one transport result |
| `list-grants` | Only the calling app's grant records, including retained unavailable references |
| `request-access` | Record/provide an explicit review request for peers/protocol/topics; cannot approve it or trigger an unsolicited prompt |
| `select-members` (optional) | Store calling app/local-key/protocol/topics intent; return an explicit FIPS owner-command descriptor for paired-node selection and exact-scope approval; no roster or grant on capability invocation |
| `list-invitations` (optional) | Current caller/identity/protocol invitation records, delivery/decision status and stored incoming review command |
| `decline-invitation` (optional) | Decline only the calling app's stored incoming invitation; no access grant |
| `retry-invitation` (optional) | Explicitly retry an existing outgoing offer/status check; no new invitation or grant |

Grant records: opaque record ID, app alias, local FIPS key, nonempty deduplicated
remote key list, one protocol, nonempty deduplicated exact topic list, timestamps.
No signature, publisher key, direction, expiry or wildcard. Requests derive app
identity from normal caller context, not an app alias that the caller submits.

Payload proposal:

```text
{ kind: "text", text: string }
{ kind: "binary", bytes: Uint8Array }
```

FIPS validates UTF-8 byte size for text, not JS character count. Native bytes stay
inside the runtime. `peerPayloadToJson` explicitly encodes JSON binary callers as
`{ kind: "binary", bytes: { encoding: "base64", data } }`; the schema decodes this
back into Uint8Array. Arbitrary numeric-key objects are rejected. The JSON decoder
has a bounded input; provider payload limits still apply. No unbounded stream.

Replace `delivered` with a documented single-peer transport send result. Define
whether `sentAt` timestamps submission or completion. No remote durable receipt,
exactly-once or ordering guarantee. Remove nullable signature from generic send;
signed app events may live inside payloads.

Define typed error codes including permission-denied, unsupported-protocol,
peer-unavailable, payload-too-large, busy/resource-limit, timeout and transport-error.
Do not equate permission denial with transient network failure.

### Inbound `peer-channel:v1`

Keep the capability name for now; "channel" no longer names a message field.

- `describe`: declare the provider's supported protocol names. No topic/project
  discovery or ownership inference from text prefixes. Conflicting active local
  ownership is an error, not delivery to multiple apps.
- `receive`: authenticated sender FIPS/owner metadata, protocol, exact topic,
  typed payload and receive time. Handler `accepted` means processing acceptance,
  not durable storage or business approval.
- `connection-changed`: metadata-only hint to affected authorized app providers.
  No broadcast of the entire roster and no promise that apps cannot miss events.
- Optional `describe.invitationProtocols` explicitly opts protocols into onboarding.
  Optional `invitation-received` validates a bounded app metadata envelope and returns
  an app-scoped completion command. It cannot approve access or accept entity history.

No subscribe/unsubscribe/publish/authorize-subscription operations: those are
ordinary messages defined and stored by consumer apps.

### Checklist and exit criteria

- [x] Specify/export schemas, payload unions, grant/request types, results and errors.
- [x] Keep existing normal caller-context typing; no claim of isolation.
- [x] Check existing capability consumers, generated/demo fixtures and registration
      inputs; update broken references directly rather than introduce adapters.
- [x] Define connection states: unknown, connecting, connected, disconnected;
      last confirmed remote activity and last error are separate from app sync state.
- [x] Define typed protocol declarations and connection callbacks without DOM,
      transport-specific socket handles, or direct access to the FIPS database.
- [x] Verify representative text/binary schema round trips, explicit instance
      addressing, caller metadata and failure shapes; document JSON byte boundaries.
- [x] Run targeted lint/type checks and document results.
- [ ] User review / publication of core changes.

Original exit: core types defined the initial agreed interface; C3 extends it for
the approved revision. Temporary breakage while core/FIPS are changed is accepted in
this research phase; compatibility is not a gate.

## C2 — owner-driven management surfaces and broker wiring

The FIPS provider owns grant SQL and grant-management rendering. Existing generic
command/form actions and authenticated owner-command paths were sufficient; no
FIPS-specific core/web rendering branches were added. A management-command
descriptor is data, not an automatic prompt or an app write permission.

- [x] Normal app calls can list only their own records and submit requests, never
      approve, update or delete grants by passing an arbitrary target app identity.
- [x] Explicit authenticated owner management can inspect the full roster and
      manage grants. A consumer member-selection picker was not implemented;
      the earlier picker claim is corrected by C3 and the owning FIPS plan.
- [x] Bind review/save actions to the stored request and selected scope. Display
      exact peers/protocol/topics; do not trust a friendly description as authority.
- [x] Support the same owner management view from FIPS and app entry points without
      adding plugin-specific branches to core/web or exposing direct SQL.
- [x] Keep background request-access / permission-denied results noninteractive.
- [x] Check cancellation semantics and atomic batch writes in local validation.
- [ ] User verifies authenticated-owner invocation paths and UI interactions; record which
      protections are normal-API policy and which still require process isolation.

## C3 — approved revision: contracts and owner workflows

Dependency for [Teams Todo owner setup](../plugins/teams-todo/docs/implementation-plan.md)
and [FIPS revision](../plugins/fips/docs/peer-access-plan.md). Status: owner member
selection, scoped completion commands and bounded pre-grant invitations implemented;
deployed authenticated onboarding acceptance remains open.
Finalize precise operation names/schemas before provider/consumer implementation;
do not imply the existing six network operations already cover these functions.

The SQLite/direct-origin decision supersedes the pending NIP-01/JCS application
signing work. No generic signing capability or core entity/hash/causality schema is
required. Existing FIPS pairing and signaling signatures remain unchanged.

- [ ] Preserve authenticated sender metadata and generic text/binary bounds for app
      event exchange. The consumer validates origin, schema, dependencies, publication
      and membership; core does not implement SQLite event sync, review or agreement.
- [x] Add optional `peer-network.select-members`: stored caller-app/local-key/protocol/
      topics scope, returning an explicit FIPS owner command descriptor. The owner-only
      UI selects named paired nodes (including ungranted nodes) and adds reviewed
      exact grants. Normal `list-peers` remains filtered; no public ungranted roster.
- [x] Scoped app completion command on Close refreshes/reconciles the app flow.
- [x] Bind **Share** / **Accept & join** to stored validated app/identity/
      protocol/topic/peer/descriptor scope and the authenticated owner's explicit
      action. Allow grant writes through this owner workflow without exposing an
      app-facing approve operation. Do not trust a payload boolean such as
      `ownerApproved` or a client-supplied arbitrary app identity.
- [x] Define setup success, cancellation, partial persistence and idempotent retry
      receipts. There is no cross-database atomic transaction between app and FIPS;
      bind retries to the reviewed intent and never silently recreate revoked grants.
      Owner action completion gives the app a scoped recheck/reconcile opportunity.
- [x] Specify bounded pre-grant app invitation send/receive/inbox and decision/status
      integration for already-paired nodes, with active protocol-handler declaration,
      sender/recipient binding, expiry, duplicate handling and delivery vs acceptance
      results. This is an explicit onboarding exception, not ordinary ungranted send.
- [x] Keep app invite bodies, descriptor validation, board acceptance and publication
      semantics consumer-owned. FIPS transports bounded envelopes; core remains
      plugin-agnostic with no Teams Todo imports, entity schemas, tags or renderer
      branches. The invitation contract covers generic delivery/handling metadata,
      not the schema or signature semantics of an app's board descriptor.
- [x] Bound envelope/chunk/reassembly/concurrency/retention and version handling;
      multi-member descriptors may exceed a single 512-byte app payload.
      Distinguish bounded onboarding retry state from a general transport outbox.

Implemented optional operations: `select-members` accepts a stored small invitation
draft; `list-invitations`, `decline-invitation`, `retry-invitation` are caller/identity
scoped. `peer-channel.describe.invitationProtocols` opts in, and optional
`invitation-received` validates app metadata/returns local completion data, never
approves access. The FIPS owner command is the only acceptance/grant path. See
[exact carrier/storage bounds](../plugins/fips/docs/app-invitations.md).
- [ ] Define structured local setup/provider error results and sanitized diagnostics;
      preserve unknown remote cause when no app response exists. Handler `accepted`
      remains processing feedback, not a durable replica receipt.
- [ ] Scope explicit reset-time owner grant/request removal without changing normal
      leave/unpair/uninstall retention, touching unrelated apps or deleting a shared
      record's unrelated scope implicitly.
- [x] Update capability declarations, docs and registration generation when implemented;
      use existing generic web primitives where sufficient. Document any new generic
      UI primitive only if the owner workflow genuinely needs it.
- [x] Targeted/full lint, schema and permitted one-off verification of caller/owner
      separation, authenticated-origin metadata, exact-scope retries and bounded invitation paths.
      Automated tests require explicit user request; deployed owner UI acceptance
      remains user-assisted unless an authenticated context is confirmed.
      TypeScript reports only the three existing FIPS vendor errors.

Exit: generic broker contracts let an owner select/create/join once with exact
grants and deliver narrowly
scoped app invitations before grants. They do not implement app membership, source
storage, manual publication, review/merge/agreement or peer durable receipts in core.

## Retained boundaries after revision

No grant auto-cleanup on unpair, local identity change, disable or uninstall.
Unavailable records stay visible and editable. No permission signatures, grant
expiry, wildcard scope, transport-owned subscriptions, general app-data replay
queue, global namespace cryptography or paid-app licensing subsystem. Bounded
onboarding invitation retry state is the explicitly scoped new exception, not a
general ordinary-send queue.

## Progress / verification log

- [x] Review current core identity, caller context and contract files; document plan.
- [x] C1 implementation and local schema/type verification.
- [x] C2 implementation using FIPS owner commands and existing generic actions.
- [ ] User-reviewed/published revised core increment(s), including C3; historical
      C1/C2 local checks do not verify the new contracts.

Targeted ESLint passed. Native 512-byte binary and explicit JSON/base64 round trips,
malformed-byte rejection, legacy-shape rejection and inconsistent-send-result
rejection passed. Root `tsc --noEmit` reports only the three pre-existing FIPS vendor
Noble/WebRTC errors. `sentAt` is local send completion time; failure has a null time
and a structured error.

Added generic `BotPlugin.onStop` and reverse-registration shutdown with a five-second
deadline per hook, called on normal signals and startup failure before closing the
shared relay pool. FIPS and Teams Todo release their own timers/sockets/databases
there. This is host-shutdown support, not a new hot-unload implementation.

The scaffold's boolean options are required function inputs, without parameter
defaults. Manager checkboxes and CLI prompts resolve defaults at the caller:
draft commands enabled, hook configuration disabled. Teams Todo passed false for
hooks; this creation did not configure or execute them. The initial app used root
`xitdb@0.30.0`; its code/data and plugin/root dependency were subsequently removed
after confirming no other runtime consumer. Teams Todo currently uses SQLite-only
simulation and declares no peer capabilities until the new FIPS event path is implemented.
