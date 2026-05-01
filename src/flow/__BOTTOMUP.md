---
direct_hash: eb9c389ccf3272489356759906fb80e266bb835eb593b8920f8861be68037bca
subtree_hash: c5d0f42191b37484c43565834be83eb075b6ca55a8e97d48df3782c4c8c8f5b5
files:
  agent-conversation.ts: 0f8b0de8424e4f5ee21f4da5754b09cd0cea0feffe35a39d7a79dd438b97b127
  agent-lint-follow-up.ts: e4a4adcadefa7473796308383fe4faf77039f6bdcfec1ba4d92b2fc448201e65
  auto-flow-deposit.ts: 0b7d0ba099d6e0513aca269fe178cf8c864713d68614950325e2dd876b1a4d17
  auto-flow-refund.ts: 6d53b615bbadfd095ab06db15d4e10d27cb2ad8752e8605b937070fbd8450aa2
  prepare-provider-run.ts: e03a6b9508323a5db3291a1efcc26d88772a317a4583b88e4be03ee94b65577c
children:
---

# flow

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
