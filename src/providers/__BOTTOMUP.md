---
direct_hash: 446bdf9a917ea6c7861057ef657c58ea1b9c7296cebd2a53d982180329cbb76f
subtree_hash: 815f69828d4eb19a15bde49c6afb2209efebd4f0226372d1559c4b9ccc207d34
files:
  db.ts: 9b0f940ff020595c6d7b6a3cd3afcd01932ff2bb60a5f0d157fc5444f0977c32
  factory.ts: 8ccb963e2de8164ab0e74a816b29de2fa07d61910aa2a6f4034eb7581083df52
  local.ts: 9d23ea572462a82e87a72425b02fe6a38d4a7597e1e94b99203faaaceed16cf9
  routstr-models.ts: 72e7a5d9dd2f51a351a56291421c099fe419c49854daef94cf4ebfbc5a8e946e
  routstr.ts: 6af3fe552735d9cd4b406e9f9a93970b3fc9142fbfc890a6407b023b260bb7e6
  types.ts: 32ea2f63f86294279db293123f71a3afb0b9d658ec97405f5987991e5e8bc970
children:
---

# providers

## Purpose
Abstraction layer for LLM provider backends supporting 'local' (no payment) and 'routstr' (Cashu-backed payment). Factory pattern creates providers; spend tracking is centralized in db.ts.

## Files
- `db.ts` - Provider database wrapper exposing logSpend for recording usage and getRecentSpendHistory for queries
- `factory.ts` - Creates provider instances by name, validating dependencies for routstr (walletDb, seenDb, providerDb, routstrBaseUrl)
- `local.ts` - No-op provider for local/development; prepareRun does nothing, finalizeRun returns zero spend
- `routstr-models.ts` - Fetches and transforms Routstr's model catalog into OpenCode-compatible model entries
- `routstr.ts` - Routstr provider implementing Cashu wallet deposits, session key creation/topup, balance deduction, and refund on API failure
- `types.ts` - Shared provider interface and types: AnyProvider, PrepareRunOptions, FinalizeRunOptions, FinalizeRunResult, ProviderName

## Notes
- All providers implement the same interface: prepareRun, finalizeRun, getStatus
- Routstr provider handles Cashu wallet deposits, session key management, and refund on failure
- routstr-models.ts and routstr.ts each define their own ROUTSTR_BASE_URL constant
