# AI Draft Sessions

This document captures the draft-review pattern now used across multiple plugins.

Current examples:

- `todo`
- `job`
- `bm`

The pattern is for AI commands that do not immediately mutate real data.

Instead, they:

- ask the model for one or more structured operations
- store those operations as drafts
- start an interactive review loop
- let the user accept, revise, decline, skip, or quit

## When to use this pattern

Use an AI draft session when a command:

- creates drafts from model output
- may produce more than one draft
- benefits from immediate review after generation
- still needs manual fallback commands later (`drafts`, `accept`, `revise`, `decline`)

Good fits:

- `todo ai`
- `job ai`
- `bm ai`

Less necessary when:

- the operation is read-only
- the interaction is fully recomputable and not draft-based
- there is no meaningful approval step

## Core model

Each draft row should carry an internal `session_id`.

The user should never need to see or type that value.

The session model is:

- AI request generates one or more draft rows
- every generated row gets the same `session_id`
- review position is `(session_id, index)`
- skipped drafts remain in storage for later manual review

Minimal draft requirements:

- `id`
- `session_id`
- `kind`
- `input`
- `original_prompt`
- `created_at`

## User interaction contract

Inside the interactive session, use the same action set across plugins:

- `a` / `accept`
- `r <corrections>` / `revise <corrections>`
- `d` / `decline` or `discard`
- `s` / `skip`
- `q` / `quit`

Recommended behavior:

- `accept` applies the current draft and removes it
- `revise` updates the current draft in place
- `decline` removes the current draft
- `skip` leaves the draft untouched and moves to the next one
- `quit` ends the session without deleting remaining drafts

## Important rule: revise in place

`revise` should update the existing draft row in place.

Do not create a replacement draft unless there is a very strong domain reason.

Why:

- stable `draft.id`
- stable `session_id`
- simpler cursor logic
- easier manual follow-up
- less user confusion

That means revise should normally:

- call the model again
- validate the returned structure
- update the current draft row with `updateDraftEntry(...)` or equivalent
- keep the same draft id visible to the user

## Manual fallback commands remain important

Interactive review does not replace manual draft commands.

Keep these commands working:

- `drafts`
- `accept`
- `revise`
- `decline` / `discard`

Why:

- user may quit the session
- user may skip some drafts
- some tools or scripts may still create drafts non-interactively

The interactive session is the preferred path.
The manual commands are the recovery and fallback path.

## Session rendering rules

The session view should focus on the current draft only.

Recommended structure:

- session progress line (`1/3`)
- current draft header
- draft preview body
- compact action hint line

Avoid showing manual reply-command blocks inside the interactive session.

So inside a session, do not show things like:

- `Reply: /job confirm 1 ...`
- `Reply: !bm accept 2 ...`

Those belong in manual/non-interactive draft previews only.

Inside the session, show only the direct interaction hint line.

## Session completion behavior

When there are no drafts left in the session:

- return `Session complete. No drafts remaining.`

When the review cursor passes the last remaining draft but skipped drafts still exist:

- return a message like `Session finished. N skipped draft(s) remain. Review them later with <cmd> drafts.`

When the user quits:

- return a similar message pointing them to manual draft review

## Mixed-operation sessions

Some plugins may have AI flows that can generate multiple kinds of operations.

Examples:

- create
- update
- delete
- import-from-search

Recommended approach:

- start with interactive sessions only for the safe/clear subset
- usually create-only sessions first
- fall back to the old non-interactive preview flow for mixed or unsupported operation sets

This is better than forcing a half-broken generic session UI too early.

## Suggested implementation structure

Inside a plugin, the session logic usually belongs under the AI command:

```text
plugins/<alias>/commands/ai/
  handler.ts
  prompts.ts
  parse-*.ts
  schemas.ts
  session.ts
```

Typical functions in `session.ts`:

- `renderDraftSessionReview(...)`
- `applyDraftSessionAction(...)`
- `runDraftSessionInteractive(...)`

This session module is usually command-local, not shared globally.

Reason:

- the control flow is similar across plugins
- but the draft preview body and accept/revise behavior are domain-specific

## DB/storage helpers you will usually need

For draft-backed sessions, shared draft storage should normally provide:

- `createDraftSessionId()`
- `storeDraft(...)`
- `getDraft(...)`
- `listDrafts(...)`
- `listDraftsBySession(...)`
- `getDraftBySessionIndex(...)`
- `deleteDraft(...)`
- `updateDraftInput(...)`
- `updateDraftEntry(...)`

If two or more subcommands need these helpers, keep them in shared plugin draft storage.

## Adapter/context requirements

A plugin using interactive AI review needs access to:

- `runAgent`
- `promptFn`

Sometimes also:

- extra plugin services needed during revise (`pool`, `masterPubkey`, search context, etc.)

If a plugin command context already has `sendReply`, that does not automatically mean it should be used for prompt sessions.

For prompt loops, prefer `promptFn(...)`.

## UX guidelines

- keep draft previews compact and scannable
- align fields when there are many structured fields
- shorten overly long labels (`type` instead of `execution_type`, `description` instead of `schedule_description` in review UIs when clearer)
- keep session prompts action-first
- use the same action letters across plugins

## Practical checklist

When adding AI draft sessions to a plugin:

1. add `session_id` to draft rows
2. add storage helpers for per-session listing/indexing
3. keep manual draft commands working
4. add `commands/ai/session.ts`
5. make `ai` group all created drafts under one `session_id`
6. start the interactive session immediately after draft creation
7. make `revise` update the same draft in place
8. hide manual reply-command blocks inside the interactive session
9. keep skipped drafts available through manual draft commands

## Default recommendation

If a plugin has an `ai` subcommand that creates drafts, prefer this session-based review flow by default.

It is now the established plugin pattern in this repo.
