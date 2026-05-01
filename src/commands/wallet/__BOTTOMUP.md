---
direct_hash: aeb7c7fe9bc755860ffcdf4f698ad4aebf29409889f4f69cd65cb3cfb79d9dca
subtree_hash: e86de8c817514f75863296d8f1e65ce2a2d607084e8340a0d465b3cc0703703c
files:
  cli-representation.ts: a94b38650027beb45b90844419c114bdd7e1233f6d3d77be6c0d7b70d54f56ff
  definition.ts: 36d431d476a3ad79508d849906d10ebfc4b470469f28b99e3296067e459d768d
  handler.ts: e1a3098f0960936ef8472361dd4504d473670dda0d7a8cabf8f759f9f7a2d052
children:
---

# commands/wallet

## Purpose
Wallet command group: defines the 'wallet' command with subcommands for Cashu operations (mint, mints, balance, decode, receive, send, history). Handler routes to subcommand logic; definition declares the command tree; cli-representation renders responses to text.

## Files
- `cli-representation.ts` - Switch dispatcher that routes wallet representation kinds to their CLI renderers
- `definition.ts` - Declares the wallet command with its 8 subcommands (mint, mints, balance, decode, receive, send, history, help)
- `handler.ts` - Main entrypoint: parses subcommand, delegates to subcommand handlers, renders results via cli-representation

## Notes
- All subcommand handlers live in their own subdirectories under commands/wallet/
- CLI rendering delegates to per-subcommand renderers
