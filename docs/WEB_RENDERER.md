We are building a web UI and web-renderer system for this dm-bot codebase.
Current goal
- Support rich web renderers for commands/subcommands, starting with a custom web renderer for `todo list`.
- Keep the existing text command flow working.
- Reuse existing command handlers/business logic where possible.
- Allow web UI actions to map into normal command invocations first, instead of overengineering adapters.
What already exists
Backend/web
- Local web server exists in `src/web/server.ts`, `src/web/routes.ts`, `src/web/command-catalog.ts`, `src/web/execute.ts`, `src/web/chat.ts`.
- Web API supports:
  - `GET /api/health`
  - `GET /api/commands`
  - `GET /api/commands/:name`
  - `POST /api/commands/:command/:subcommand`
  - `POST /api/chat`
- Plugin commands are included in web command discovery if the plugin exposes `commandDefinition`.
- Plugin commandDefinition can now be either:
  - a concrete `CommandDefinition`
  - or a function `(prefix, alias) => CommandDefinition`
- `src/commands/help/handlers.ts` was updated to resolve plugin command definitions correctly.
Frontend/web
- Solid + Vite app exists under `web/`
- Main files:
  - `web/src/App.tsx`
  - `web/src/components/TimelineView.tsx`
  - `web/src/components/CommandPalette.tsx`
  - `web/src/components/Composer.tsx`
  - `web/src/types.ts`
  - `web/src/utils.ts`
- Current UI supports:
  - timeline/chat shell
  - bottom composer
  - `/` command popup
  - command and subcommand filtering
  - auto-focus behaviors
  - command execution through HTTP
  - chat through `/api/chat`
- The popup path parser supports command/subcommand-ish input such as `todo list`, and special treatment for `/help`.
Command helper work already done
- `src/system/command-helpers.ts` now exists with:
  - `createCommand(...)`
  - `createSubcommand(...)`
- It uses the shared representation base from:
  - `src/system/representation.ts`
- Helper-based subcommands currently include:
  - `definition`
  - `representation`
  - `handler`
  - `renderers`
  - optional `adapter`
- Important: adapters are optional by design. Do not force adapters everywhere.
- The current practical rule is:
  - prefer transforming web actions into normal command invocations first
  - only add adapters if a command truly needs one later
Important architectural decisions already made
- We want renderer targets to be:
  - `text`
  - `web`
  not `cli`
- We are leaning toward adding `web` to `MessageSource` and eventually removing `plugin` from `src/messaging.ts`, but that has NOT been fully implemented yet.
- Long-term renderer selection should likely be global/shared, not per-plugin hacked in adapters.
- But we have NOT yet implemented a full target-aware renderer dispatcher.
- For now, web still mostly executes commands through existing command-text paths or reconstructed command payloads.
What we want next
Primary next goal
- Build a real custom web renderer for `todo list`.
What “todo list web renderer” should mean
- A dedicated web view for the `todo list` subcommand, not just plain text in a card.
- It should render the todo tree/list in structured HTML/UI.
- Desired interactions we discussed:
  - click checkbox to mark item `in_progress`
  - double click to mark item `done`
  - click `[x]` to delete
  - edit item text
  - insert new item
  - move/reorder item, maybe change parent
  - maybe save-all mode, maybe immediate execution mode
- However, we decided NOT to overbuild a generic action-adapter system yet.
- First preference:
  - map web UI actions back into normal command invocations where possible, such as:
    - `/todo update ...`
    - `/todo done ...`
    - `/todo delete ...`
    - `/todo add ...`
    - `/todo move ...`
  - after each action, refresh the rendered list by re-running the list command or equivalent
- Only add custom web-only action plumbing if command-shaped mapping becomes clearly awkward.
What is still missing
- No real renderer selection system yet (`text` vs `web`).
- No standard place yet where command handlers return `representation + renderers` and dispatch chooses target.
- No actual custom web renderer has been wired into command dispatch yet.
- `todo list` currently still goes through the generic command form/result system.
- `MessageSource.web` and target-aware rendering are still conceptual, not finished infra.
- No websocket live event system yet; current web messaging uses HTTP.
Practical next step
Implement the smallest clean vertical slice for `todo list` custom web rendering, without overhauling the whole architecture.
Recommended scope for the next step
1. Inspect the todo plugin structure, especially:
   - `plugins/todo/commands/list/*`
   - existing handler/representation/text rendering
2. Add a custom `renderers/web.ts` for `todo list`
3. Keep the current web shell architecture, but teach it to recognize/render the `todo list` result specially
4. Reuse existing command execution for actions when possible
   - for example, a click in the web renderer can call the existing `/api/commands/...` endpoint with the right command/subcommand/payload
5. After an action succeeds, refresh the `todo list` web view by re-running list with the same filters/options
6. Do not try to solve every renderer/dispatcher abstraction globally unless needed for this slice
7. Prefer one focused working example over a generalized framework that is not yet exercised
Suggested approach
- Start by inspecting:
  - `plugins/todo/commands/list/handler.ts`
  - `plugins/todo/commands/list/representation.ts`
  - `plugins/todo/commands/list/renderers/text.ts` or equivalent existing text renderer
- If there is no suitable representation for web, extend or improve the `todo list` representation so it contains enough structured data for a web view.
- Then create a web renderer for that representation.
- Wire the frontend so when a `todo list` result is returned, it renders a structured todo view instead of plain text.
- Keep fallback to plain text if web rendering is unavailable.
Important constraints
- Do not force adapters everywhere.
- Do not require every command to have a web renderer yet.
- Do not break existing text/CLI behavior.
- Keep the new helper system optional.
- Prefer incremental integration over large-scale refactors.
Useful context on code quality
- `src/web/*` backend code is currently cleaner and more structured than the frontend was.
- `web/src/App.tsx` was recently split into components and is now more manageable.
- The next good cleanup after the todo renderer may be:
  - further splitting timeline card components
  - introducing a global renderer-selection helper
- But do not do those first unless needed to make `todo list` work well.
Deliverable for this session
- A working first custom web renderer path for `todo list`
- Enough backend/frontend wiring so the web UI can show a structured todo list and trigger at least one or two meaningful actions through the existing command execution path
- A short explanation of the architecture chosen and what should come next after this slice
My practical recommendation:
- yes, start the new session with exactly this
- the next logical step is not a full renderer framework
- it is one real todo list web renderer slice that proves the model

## Scoped styles (Shadow DOM)

Command web UIs (`WebNodeRoot`, `kind: 'ui'`) render inside a **Shadow DOM** island on the web client. Shared primitives (`.web-node`, `.web-button`, tree, overflow menu, tone utilities, etc.) come from a **base stylesheet** injected automatically; optional **`stylesheets`** on the root payload add presentation-only CSS scoped to that render.

Plugin / handler guardrails:

- `stylesheets` are **presentation-only**. Do not rely on global app classes from `web/src/styles.css`; only `:root` theme variables (for example `var(--color-accent)`) are guaranteed to inherit into the shadow tree.
- Prefer stable string **`id`** values per logical sheet (for example `file-plugin-tree`); the client dedupes by `id` and replaces `cssText` when the same `id` appears again on an updated root.
- Avoid `@import` and remote fonts in v1 payloads; keep CSS self-contained and small.

Schema: `WebStyleSheet` in `src/web/ui-schema.ts` (`{ id, cssText }`); optional `stylesheets` array on `WebRenderResultSchema` / `WebNodeRoot`.

**Shadow mount overflow:** optional `shadowMountOverflow` on `WebNodeRoot` (`'hidden' | 'scroll-y'`). Omitted or `'scroll-y'` lets the inner Solid mount scroll when content is taller than the host (typical timeline cards). Use `'hidden'` when your tree defines its own scroll regions (for example a fixed chrome row plus an `overflow: auto` panel inside `stylesheets`). The file `tree` web renderer sets `'hidden'` so only `.web-file-tree-block` scrolls in the modal.