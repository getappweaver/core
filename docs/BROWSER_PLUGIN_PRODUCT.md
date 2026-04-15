# Browser Plugin Product Notes

## Current Direction

- Product is `browser`, not `socials`
- Main value: AI can use your browser on your machine with persistent local profiles
- Tasks are prompt-first for now
- Scheduling/deferred runs will come from `job`, not from `browser`
- Browser should be architected as a real long-lived task system, not a one-shot command loop
- Runs should be resumable after bot restarts

## MVP Building Blocks

### Profiles

- Stored locally in the plugin directory
- Persistent browser session/auth state
- One profile can be reused across runs
- User may create separate profiles per site/use case

### Tasks

- A task is primarily a prompt
- Prompt can include content, links, references, instructions, tone, and constraints
- AI decides how to execute it using browser tools
- Nostr draft link/content can simply be part of the prompt or a referenced web page for now

### Checkpoints

- Main example: login required
- AI should notify the user whenever a site needs login
- User replies later and the run continues in the same browser task context
- AI can use `sendDm` to notify when blocked or finished
- Future PWA push notifications can plug into the same pattern
- Simple synchronous `promptFn` is not enough for the long-term browser product because it only supports one pending prompt slot in core today
- Browser plugin should own its own async checkpoint / reply routing model

## Browser Capabilities Needed

- open/start browser
- navigate to URL
- inspect compact structured snapshot
- click
- type
- press keys
- scroll
- wait for text/elements
- open new tab
- switch between tabs
- close tab if needed
- keep tabs open for user review by default

## Product Behavior Decisions

- AI should handle platform differences itself
- Prompt can provide extra guidance when needed
- AI should notify every time a site needs login
- User reviews final prepared drafts manually in the browser
- Browser should keep tabs open for review by default
- One active run in MVP UX is okay, but the architecture must be extensible beyond that
- AI should eventually be able to continue other work while one destination waits on login/user action
- Browser should not auto-resume tasks after restart; user can ask it to continue

## Example Task Shape

"Use this source post as reference. Prepare drafts for LinkedIn, YouTube, WhatsApp Web, Telegram Web, X, and Instagram. Open each in a new tab. Adapt tone per platform. Do not publish. Notify me when review is ready."

## Non-Goals For Now

- No formal workflow DSL yet
- No heavy state machine yet
- No complex site-specific architecture unless it becomes necessary
- No separate companion app for hosted mode yet

## Architectural Direction

- Browser plugin should own its own SQLite DB under `plugins/browser/`
- MVP DB should hold:
  - tasks
  - task_events
- Profiles are deferred for MVP; browser uses one implicit persistent local profile from config/code
- Browser plugin should have its own long-lived run/session manager
- Preferred UX: interact with browser runs in a special chat/thread/timeline, not as a single blocking command exchange
- Plugin should append progress/events to that timeline
- User replies in that same timeline; plugin routes the message back to the correct run/task/checkpoint
- MVP can allow only one active run, but should still be built on top of this run/event/checkpoint model
- Browser master should wake up per incoming event/message from persisted state, not rely on a long-lived in-memory loop
- DB-backed task state is the source of truth, not model memory

## Command Direction

- Main AI-first entrypoint: `/browser run <prompt>`
- Browser master interprets the prompt and decides whether to:
  - inspect existing tasks
  - continue a task
  - stop a task
  - repeat a task
  - create a new task
- If ambiguous, browser master should ask the user
- `/browser list` should show all tasks by default, including finished ones and reports/results where useful
- Future filters can narrow to pending/running/failed/etc.
- Explicit commands are still useful for CLI/DM/web consistency, even if primary UX is conversational

## File Structure Direction

Current target direction for `plugins/browser/`:

```text
plugins/browser/
  init.ts
  adapter.ts
  definition.ts
  open-db.ts

  commands/
    run/
      handler.ts
      definition.ts
      adapter.ts
    list/
      handler.ts
      definition.ts
      adapter.ts
      db.ts
      format.ts
    help/
      module.ts

  tasks/
    db.ts
    types.ts
    format.ts

  run/
    orchestrator.ts
    browser-service.ts
    checkpoint-router.ts
    notifications.ts
    prompts.ts
```

Notes:

- Avoid generic `shared/` until duplication is real
- Avoid generic `db/` and `runtime/` buckets when capability-local modules can own their files
- Keep modules locally understandable for future `__BOTTOMUP.md` documentation

## MVP DB Schema Direction

### tasks

- `id`
- `title`
- `prompt`
- `status`
- `created_at`
- `updated_at`

Task status values:

- `pending`
- `running`
- `waiting`
- `completed`
- `failed`
- `cancelled`

### task_events

- `id`
- `task_id`
- `role`
- `kind`
- `text`
- `created_at`

Event model:

- `role`: `user | assistant | system`
- `kind`: `message | status`

Notes:

- `task_events` is append-only timeline/history for a task
- No `metadata_json` in MVP
- No `last_error` / `last_summary` columns in `tasks`; derive from status and event history

## Open Questions

1. How should browser timeline/thread UX map onto current core/web timeline primitives?
2. For MVP, do we want a dedicated browser thread/timeline immediately, or a simpler `/browser run`-started run that already writes to its own event store?
3. After we settle the schema, should `tasks/` stay minimal or split into `events.ts` / `checkpoints.ts` later?
