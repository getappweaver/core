---
direct_hash: 332c18931ed90f147f691ea9f5ebfcb429bc5d653754d5529d74c761c4cec4e6
subtree_hash: c74249e4cf41a4185ad37c79d56302dac455d5684695deffb68795a8bb2f2b21
files:
  db.ts: 9b0f940ff020595c6d7b6a3cd3afcd01932ff2bb60a5f0d157fc5444f0977c32
  factory.ts: c10119e2872c8da337a3c62ce42d55d740970ac960eb27b785bb18ab812bc497
  local.ts: 9d23ea572462a82e87a72425b02fe6a38d4a7597e1e94b99203faaaceed16cf9
  routstr-models.ts: ebe535783168d17d032afc04e958c1a9697fd3d9abf72f5d18b6f0aeddf8f9ba
  routstr.ts: 028514a31bae0b12aaea5bd0cd991e5f8b25b88c77a3e9d2e66d1b2ff3c9a9fe
  types.ts: 32ea2f63f86294279db293123f71a3afb0b9d658ec97405f5987991e5e8bc970
children:
---

# src/providers

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
