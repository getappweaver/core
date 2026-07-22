---
direct_hash: 0dbe7b948909643775187373ccf2cf7b2b2482c666a1a00ea9b9e9f6296cda86
subtree_hash: 80158be110a7546de234f84a26b875ea22c5f62db5d5470e5c723b7fa8c88cd5
files:
  browserEnvironment.ts: 49a9224d514ff2f1c2142697ce875f272b5941e2f3fe82e45afca032ac377a96
  opencodeAuth.ts: c826031d58f6061cb5506baee19400430990c73b22345ae4adb1510df6136a65
  restart.ts: 5c065a68883c5c595ca3c3f73929625f78cd3556f2007d3e2ae8194d8da7a999
  SetupView.tsx: b54f33aa07444b40e32e9db4a964c06c4247af744431161bfba05df9c4f67652
  statusRows.ts: 1f840079111eae65e74e51776136dea61eabb544e83caf9efa0f8320380a2cf6
  transport.ts: 4cdfc556778dda763bf0964f6e81df68e5ffa427953955c955374bd8d435e101
children:
---

# web/src/setup

## Purpose
Setup contains the Solid UI entrypoint and browser-side helpers for AppWeaver’s first-run/local configuration flow. It owns setup session authentication, API transport types/calls, environment/tool recommendations, status row formatting, and restart polling.

## Files
- `browserEnvironment.ts` - Detects browser, OS, device, and NIP-07 availability, then maps that environment to recommended Nostr signer tools.
- `opencodeAuth.ts` - Stores and selects the preferred OpenCode auth provider and checks whether a provider is configured.
- `restart.ts` - Polls local health after a setup-triggered restart and opens the main app when the server returns.
- `SetupView.tsx` - Composes the setup page, initializes the setup session, fetches status, handles loading/error states, and wires refresh callbacks into setup cards.
- `statusRows.ts` - Converts setup status and dependency records into compact display rows for setup cards.
- `transport.ts` - Defines setup API response/status types and wraps all browser fetch calls for setup session, configuration, OpenCode auth, Piper, web push, and restart actions.

## Notes
- Setup access uses a short-lived token stored in sessionStorage after exchanging the URL secret.
- Most mutating setup actions return an updated SetupStatus for immediate UI refresh.
