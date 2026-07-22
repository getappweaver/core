---
direct_hash: 8d523004ddb9c769c6e77c1e05f3f9cd6dda59c1020c2427e12cbb7ff53e2258
subtree_hash: c56b97e95fdc3e35f17f91157834167484f3e781a23e573c208b43d3e53f6e2f
enriched: true
enriched_version: 1
files:
  backgroundStatus.ts: 81bd519ef1bef625df691c5f30d3a3ce849020ad51c2beb38bcdd4bd4528fafe
  catalog.ts: b2cecb2da2db331ff8b70bfe8cc0c0f8c7286d24e457c0d9370312fcb1466db7
  CommandFormCard.tsx: 7f4af4f349d5b17cb2114920538579f2a900d0ca4c3b7e621fde347e3a5557c6
  types.ts: 27979212c5f7df2b3b4f8d658b816d848577182b428e4fe1c9e4de5a71146165
  useCommandForms.ts: cbd4791dfafd155ead529dee003e13753cb5777f892e83bdfc3f7399be78782e
  useCommands.ts: 8a7c37f7bf4d0448edaccd2608de766729868fcea856cfe1ca682d2fbf848776
children:
---

# web/src/commands

## Purpose
Command orchestration for the Solid web app: resolving command metadata, opening timeline forms, sending command requests over the socket, and handling web actions returned by command UI. This directory bridges generic WebAction payloads to timeline, modal, taskbar, prompt, background-status, and client-side interaction flows.

## Files
- `backgroundStatus.ts` - Tracks background command status in a Solid signal and encodes/parses marker-prefixed status updates from command output.
- `catalog.ts` - Resolves command details by name or alias and throws a clear error when a requested command is missing.
- `CommandFormCard.tsx` - Renders a collapsible timeline command form with required arguments, options, flags, model-choice fields, and submit/delete actions.
- `types.ts` - Defines the adapter and hook contracts that connect command handling to app state, sockets, chrome modals, signing, timeline updates, and web actions.
- `useCommandForms.ts` - Creates and opens command form timeline items, with shortcuts for runnable/help subcommands and injected OpenCode model choices.
- `useCommands.ts` - Implements the command hook that dispatches socket commands, processes results/prompts/errors, runs WebActions, updates modals/timeline/taskbar state, and triggers refresh behavior.

## Notes
- `useCommands.ts` is the main integration point and owns most command/action side effects.
- Command forms are timeline items and are persisted through adapter callbacks.
- Background command status messages use a marker-prefixed string protocol.
