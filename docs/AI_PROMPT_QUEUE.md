# AI improvements: prompt queue and pause

## Behavior

Web chat prompts submitted to a busy session queue in arrival order and request
a cooperative pause. Pause waits for the next foreground model-request hook;
it does not abort a stream or running tools. Continue resumes the current run
and allows queued turns after the entire AppWeaver run (including lint/fixes).
Don't pause cancels the pause request without discarding the queue. Stop aborts
the current run and holds the queue. Send now aborts, waits for run cleanup,
then runs the selected item before the remaining queue. Editing/removing items
never resumes the AI. Pausing without a queue is supported.

The compact queue panel and status menu share session-scoped server state.
The panel is visible only when the queue contains a prompt. Empty-queue pause,
resume, and stop controls remain in the AI status menu. Queue rows are keyed by
prompt ID so state refreshes preserve editor focus, selection, and unsaved text.
Queued text is recorded in the conversation only when execution starts.
Queues survive browser reconnects, but are currently held in host memory and
do not survive a host restart. Unsupported externally attached OpenCode servers
must reject cooperative pause explicitly rather than claim to be paused.

The managed OpenCode plugin awaits an authenticated AppWeaver callback in
`chat.headers`. Internal title, summary, and compaction requests bypass the
foreground gate. While paused, the hook renews its callback every 15 seconds to
avoid HTTP idle timeouts; it never releases the model request during renewal.
Stop clears waiting gates. OpenCode automatic titles are
disabled for managed servers; AppWeaver's session-title skill remains responsible.
See [managed runtimes](MODEL_SOURCES_AND_RUNTIME.md).

## Implementation progress

- [x] Session run/queue controller, pause lifecycle, and serialized replacement.
- [x] Managed plugin callback and automatic-title configuration.
- [x] WebSocket state/action protocol and reconnect synchronization.
- [x] Compact queue panel and status controls, including inline editing.
- [x] Static verification and final lifecycle review (limitations below).
- [x] Hide the empty queue panel, including transient initial submissions.
- [x] Preserve queue-editor focus across state refreshes.
- [x] Inspect submission routing, transport behavior, and session history for the
  ignored-prompt report; record findings below.
- [ ] Correlate an affected submission's browser log with server acceptance or
  held queue state to establish the intermittent delivery issue's exact cause.
- [ ] User acceptance in an authenticated browser after restarting the host and
  managed OpenCode server.

Authenticated browser verification is left to the user unless an authenticated
browser context is explicitly provided. No automated tests are added or run.

A bounded one-off controller check verified pause/continue, Don't pause, internal
compaction bypass, editing/removal, FIFO continuation, and Send now waiting for
the previous run's finalization. Idle sessions are absent from OpenCode's status
map; cancellation cleanup recognizes successful map absence as idle, and a
cleanup timeout holds the queue rather than launching a replacement.

Targeted ESLint and `git diff --check` pass. The plugin template passes its
standalone TypeScript check. The web TypeScript check reports only two errors
in the separately modified `src/commands/skills/handler.ts` (lines 1683 and
1768); it cannot currently pass project-wide. Authenticated UI acceptance and
end-to-end confirmation against the newly loaded plugin remain outstanding.

## Follow-up investigation: intermittent ignored prompts

The reported standalone message beginning “I also think it's a bit unneeded”
does not appear as a started chat turn in this session's timeline. Queued text
is not persisted until execution begins, so that does not establish whether it
was queued/held or never accepted. Available host logs do not establish its path.

The older submission path clears the composer before attempting a send. A
WebSocket send returning successfully confirms only local buffering, and the
transport clears pending callbacks on disconnect without reconciling acceptance.
A separate interactive-prompt routing branch can consume composer text as an
answer instead of starting a chat. These are investigation leads, not a confirmed
cause of this occurrence. Browser-local `appweaverChatLog` records submission,
routing, request IDs, and socket-send errors; correlating the affected submission
with that log and server receipt/queue state is still needed. Do not automatically
resend uncertain deliveries, since the server may already have accepted them.

Follow-up verification: targeted ESLint and whitespace checks pass. A one-off
controller check confirmed that an idle submission publishes no transient queued
entry, while a busy submission remains queued and disappears on execution. Web
type checking still reports only the two skills-handler errors listed above.
Editor identity/focus was reviewed statically; live browser confirmation remains
part of user acceptance.
