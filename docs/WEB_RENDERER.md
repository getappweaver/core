We are building a web UI and web-renderer system for AppWeaver.
Current goal
- Support rich web renderers for commands/subcommands, starting with a custom web renderer for `todo list`.
- Keep the existing text command flow working.
- Reuse existing command handlers/business logic where possible.
- Allow web UI actions to map into normal command invocations first, instead of overengineering adapters.
What already exists

Reusable local date/time display: `timestamp` elements accept `timestampMs`
(epoch milliseconds) and an optional `label` prefix. The client formats them in
the browser's locale/timezone, including the timezone abbreviation, with an ISO
datetime/tooltip for the exact instant. Standard text size/tone/style props apply.

`textField` supports `inputType: "datetime-local"` for a native date/time picker.
Supply a timezone-qualified ISO datetime in `value` to display that instant in
the browser's timezone. On form submission, nonempty date/time fields are
converted from browser-local time to UTC ISO strings before merging into action
arguments/options. Date-only and time-only fields keep their existing string
semantics. The picker supports second precision.

`select` supports `choiceSource: "nostrAccounts"` with `formFieldName` to submit
a public key from the current browser Nostr account or a named saved bunker
connection. Choices are resolved client-side from the shadow-root account context
and authenticated bunker-connections API, using `data.userPubkey` (not the remote
signer server key). Choices load automatically on mount with loading/error feedback; it does
not invoke signing, switch the authenticated account, or send credentials through
form submission. With no connected account it explains how to connect; plugins
may offer a separate manual `textField` fallback. Static `select` behavior is
unchanged when `choiceSource` is omitted.

Generic `details` and `summary` tags render native HTML disclosures, collapsed
initially. Put a `summary` element first in a `details` element's children,
followed by the expandable content. Native keyboard interaction applies; scoped
stylesheets can style the heading and body without introducing custom actions.

The generic browser `nostr.signEvent` client action accepts
`signingMode: "immediate"` for current-time signing with an
`onSuccessCommand` handoff. Its default remains `"scheduled"`, preserving the
date/runAt requirements of scheduling flows. Immediate signing forwards the
signed event but does not inject a scheduled `runAt` argument or publish it.
It also accepts optional `allowedPubkeys` to restrict the standard signer picker
to the intended account(s); a returned signature from another author is rejected
before the `onSuccessCommand` handoff. Omit it to keep unrestricted signing.

Backend/web

### Bot restart notifications

After `/bot restart` successfully requests a watch restart, the backend broadcasts
`process_restart` to every authenticated, non-demo WebSocket connection. Each
tab/PWA window shows the existing `process-restart` client view in its own active
timeline and immediately treats connection loss as an expected restart. The
initiating window's command result uses the same process instance and request
timestamp, so it replaces the live notice rather than creating a second card.
Timeline catch-up also deduplicates notices against persisted command results.
Observer notices are local UI entries; they do not write restart commands into
other sessions' stored history.

The existing authenticated process-instance handshake changes the cards to
“Restarted” after reconnection to a new bot process. Real connection errors still
appear when no restart is expected or the expected-restart window expires. This
notification covers `/bot restart` from web, DM, and local command transports;
unexpected process exits and externally written restart signals do not announce
a restart through this command notification path.

### Backend interfaces
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

On viewports narrower than 900px, header app icons occupy a native horizontally
scrollable single-row strip. Swipe left/right to reach overflow icons; tapping
still opens the app. The logo, layout control, and account menu remain outside
the strip. Icon images disable native image dragging, and the strip contains
horizontal overscroll while permitting pinch zoom. Desktop header placement is
preserved via a `display: contents` wrapper.

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

## Widget-wide tree controls

The card-header **Collapse all** and **Expand all** controls apply to every
`treeItem` in that WebNodeRoot, including independent sibling trees and nested
trees inside layout containers. Each top-level tree registers its toolbar with a
stable component token; removing one registration does not clear the others.
Tree-specific filter/actions remain attached to their registered toolbar.

Bulk controls record expansion state for all supplied item IDs, including
descendants whose components are unmounted under collapsed parents. Existing
item IDs retain their state through root refreshes and within the existing
`stateScopeId` cache. New items use the widget's latest bulk preference while that
widget is mounted. Individual reopening overrides the saved state, so refreshing
does not repeatedly force manually reopened items closed. These controls do not
fetch unloaded lazy branches or change archive selection. Inline tree toolbars
remain tree-local, and text filtering retains its match-reveal behavior.

## Command-backed downloads

The generic `web.downloadCommand` client action downloads a text file generated by
any command. Its payload contains `command`, `subcommand`, `arguments`, and `options`.
It runs one authenticated JSON command with timeline recording disabled, without
replacing the current root or opening a modal. The source widget is busy during
generation; failures are shown as system messages rather than downloaded as files.

The target command must return a **JSON-encoded string** matching
`WebCommandDownloadSchema` in `src/web/ui-schema.ts`:

```json
{"filename":"report.txt","mimeType":"text/plain;charset=utf-8","content":"Report contents\n"}
```

The browser validates the envelope, creates a UTF-8 Blob and a temporary download
anchor, then removes the anchor and revokes its object URL. No server-side temporary
file or plugin-specific browser branch is needed. File content is generated only
when clicked, not embedded in every rendered view. Implementations live in
`web/src/utils/download.ts` and the generic client-action dispatcher.

## Scoped styles (Shadow DOM)

Command web UIs (`WebNodeRoot`, `kind: 'ui'`) render inside a **Shadow DOM** island on the web client. Shared primitives (`.web-node`, `.web-button`, tree, overflow menu, tone utilities, etc.) come from a **base stylesheet** injected automatically; optional **`stylesheets`** on the root payload add presentation-only CSS scoped to that render.

Plugin / handler guardrails:

- `stylesheets` are **presentation-only**. Do not rely on global app classes from `web/src/styles.css`; only `:root` theme variables (for example `var(--color-accent)`) are guaranteed to inherit into the shadow tree.
- Prefer stable string **`id`** values per logical sheet (for example `file-plugin-tree`); the client dedupes by `id` and replaces `cssText` when the same `id` appears again on an updated root.
- Avoid `@import` and remote fonts in v1 payloads; keep CSS self-contained and small.

Schema: `WebStyleSheet` in `src/web/ui-schema.ts` (`{ id, cssText }`); optional `stylesheets` array on `WebRenderResultSchema` / `WebNodeRoot`.

### Opt-in live refresh

`WebNodeRoot.autoRefreshMs` (2,000–60,000 ms) opts a render into polling its own `meta` command. Use it only on read-only view commands, never a command that starts execution. The Shadow DOM host skips polling while hidden/unmounted, busy, or while an input/textarea/select/contenteditable is focused. Requests do not overlap, create timeline entries, or show a pending overlay. Responses use normal root reconciliation and stale-response handling; polling is disposed when the render changes or unmounts. Include a manual Refresh action for recovery after connection errors.

**Shadow mount overflow:** optional `shadowMountOverflow` on `WebNodeRoot` (`'hidden' | 'scroll-y'`). Omitted or `'scroll-y'` lets the inner Solid mount scroll when content is taller than the host (typical timeline cards). Use `'hidden'` when your tree defines its own scroll regions (for example a fixed chrome row plus an `overflow: auto` panel inside `stylesheets`). The file `tree` web renderer sets `'hidden'` so only `.web-file-tree-block` scrolls in the modal.

## Stable identity and pending UI

Refreshed `WebNodeRoot` payloads are authoritative complete trees. The client reconciles compatible element nodes so stateful components can keep local UI state while server-rendered props, children, metadata, and stylesheets update.

- Put `renderKey` on repeated or stateful element nodes. It must be stable across equivalent refreshes, unique among siblings, independent of sorting/counts, and never reused for another element tag.
- Include branch context when one entity appears in several places, for example `topic:nostr:event:<id>` and `mood:focused:event:<id>`. `renderKey` identifies one rendered instance.
- Put `entityKey` in element props when several render instances represent one logical entity, for example `nostr-event:<id>`. Duplicate entity keys are intentional and are not reconciliation keys.
- Unkeyed legacy nodes continue to reconcile positionally. Reordered stateful collections should always provide keys.
- The client uses a focused recursive WebNode reconciler rather than Solid's stock keyed array reconciler because WebNode arrays may mix keyed elements, unkeyed elements, and text nodes.

Command actions may choose pending presentation:

An explicit `surface: 'timeline'` action renders its result in the main timeline, even when the target command has widget/dock metadata. It does not replace the origin widget or modal root. Actions without a surface can update their origin in place via `onReplaceRoot`.

```ts
pendingUi: {
  presentation: 'entity',
  label: 'Updating...',
}
```

- Omitted or `widget` keeps the widget-wide Working overlay.
- `entity` uses the nearest ancestor `entityKey`, marks every mounted copy in the same widget source pending, and falls back to widget pending when no entity is available.
- `none` runs without a pending overlay.
- Keep the action's refresh command server-authoritative. Entity pending remains active through refresh settlement, and late older refresh roots are ignored.
