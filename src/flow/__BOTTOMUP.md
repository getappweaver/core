---
direct_hash: 871e33f2864e8ebf968a71c98729e0cb94d1ea0d51d0f96a2d54da82e3677d16
subtree_hash: fae4444a3701c7371cf5ff5a87dbbb764c8c764ccb2a460ae8c7226c402f8ba0
files:
  agent-conversation.ts: 8fc8611557807df092f3ada6a24075b9c79fc08c2741d6bed43c2fc3c7fb86f0
  agent-lint-follow-up.ts: 0b45226d1270219f7f726ef5045736cd3c7c49449fd9aa1a724ccf27a27d1eca
  auto-flow-deposit.ts: d9bcadf57dc95f8bbe90d9e892ad497e05c80e8c9d20bdb1c12edbc89a13393c
  auto-flow-refund.ts: d5340ad836117ecb26816775913eb22fe06493aa44452e28b96c315c7bcf833c
  prepare-provider-run.ts: 38d666d1023dfc1e9b29c41a5acc6d501ee691e9226ed3ac0609052856bc0481
children:
---

# src/flow

## Purpose
Orchestration layer for agent conversation execution. Handles session management, provider initialization, budget annotation parsing, auto-flow deposits/refunds for paid providers, and optional lint follow-up rounds.

## Files
- `agent-conversation.ts` - Main orchestration: session creation, budget parsing, provider init, deposit, agent run, cost calculation, refund, reply sending
- `agent-lint-follow-up.ts` - Runs agent round(s) with optional post-edit lint feedback loop when linting enabled in agent mode
- `auto-flow-deposit.ts` - Pre-run deposit/topup for Routstr provider when inline budget present and provider is routstr
- `auto-flow-refund.ts` - Post-run refund to recover unused sats from Routstr session after agent completion
- `prepare-provider-run.ts` - Validates provider has valid session and sufficient balance before agent execution

## Notes
- Entry point is runAgentConversation which orchestrates the full flow
- Auto-flow pattern: deposit before run, refund after (for Routstr provider)
- Lint follow-up runs only in agent mode when linting is enabled
