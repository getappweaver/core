# Teams Todo implementation record

The independent app's initial MVP is now historical evidence. After deployed UX review, the
owner chose SQLite with semantic change events, immediate local edits/manual publication,
independent incoming review, dependency-aware conflicts and optional agreement.
Direct invitations/integrated owner grants, focused views, diagnostics and reset
remain in scope. xitdb/native-state replication and per-entity signing proposals are
superseded/deferred. The schema foundation and real board UI's local SQLite task/event
path are now implemented with independent Peer A/B/C databases in the real UI.
Send/Sync simulates explicit release and delivery to a separate inbox. Each incoming
item must be accepted before its event/entity enters the receiving peer database;
decline leaves that database unchanged. The xitdb runtime/data/dependency were removed.
Settle that UI first, then implement real FIPS event syncing and full merge workflows.
Agreement and guided onboarding remain planned.
The owning phase plan, historical evidence and revised acceptance checklist live in
[plugins/teams-todo/docs/implementation-plan.md](../plugins/teams-todo/docs/implementation-plan.md).

Original checked evidence and the earlier pending plan are preserved in the
[historical record](../plugins/teams-todo/docs/initial-mvp-and-superseded-plan.md).

Start with the [app README](../plugins/teams-todo/README.md) for commands, setup,
storage, merge rules and current limits. Real FIPS/network, Linux portability and
authenticated browser checks remain open; local simulated-peer results do not
establish those outcomes.

Related work: [core contracts](PEER_CAPABILITIES_IMPLEMENTATION_PLAN.md),
[FIPS implementation](../plugins/fips/docs/peer-access-plan.md), and
[architecture](FUTURE_OF_APPWEAVER.md).
