# Session commands

`/session list` lists sessions for the active workspace. In browser tabs and PWA
windows, `(current)` identifies the session of the window issuing the command.
Both WebSocket command paths forward the request's timeline/session ID through
the [command dispatcher](../dispatch.ts) to the list handler.

Commands without a browser session context (including HTTP command requests)
fall back to the persisted selection for their transport: the workspace web
selection for web requests, or the current DM session for DM/local requests.
Listing sessions does not change any selection.
