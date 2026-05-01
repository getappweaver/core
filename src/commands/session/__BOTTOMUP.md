---
direct_hash: 76196884d23df821e7abee010b43e517fd0812328a21fcd4de14cde06f6ced54
subtree_hash: 679b7eafa8782161fba68166367055a1bb2684b656faf6e11478f48e5f900eb8
files:
  definition.ts: cfe05eff110898112393c17e7843d22655ac1ee82266436e3e0f887f2de8b6cf
  handler.ts: e76177619bc1c43647254d08be0d78eb42ca49254118d37240855f57cf0f767b
  text-representation.ts: 841fcf6d182ab3248d2d395613477d2b1cda0e9f153ad553f1d6a7cf00371744
children:
---

# commands/session

## Purpose
Session command group dispatcher. Wires subcommands (new, attach, resume, resume-last, list, messages) via definition.ts, routes to handlers in handler.ts, and delegates text rendering to subcommand-specific renderers in text-representation.ts.

## Files
- `definition.ts` - Wires session command tree with 6 subcommands plus help.
- `handler.ts` - Dispatches to subcommand handlers; wraps with errors and status blocks.
- `text-representation.ts` - Routes session.* representation kinds to subcommand text renderers.

## Notes
- Subcommand handlers live in attach/, list/, messages/, new/, resume/, resume-last/ subdirectories
- Each subcommand has its own representation type and text renderer
- Handler error-wraps each subcommand and appends status blocks to output
