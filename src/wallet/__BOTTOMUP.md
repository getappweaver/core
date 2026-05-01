---
direct_hash: 8db6c0c84739914133c0ea3be97324f23e25f01d11537f556d5ec77f8735680e
subtree_hash: 8ee54a2354c8aff1475c921903a0b6912d73ce10661e13a1a6f955e778dd9b3c
files:
  cashu.ts: 317fcfca88380c6354bcd47f4c5cac913314ff31a9e0d24fbb2a9b95d47b4baa
  db.ts: dfe2c3a66efada3721e21d0fa255f70f49ecadcff6ee0560d2f4703d9f31606e
  types.ts: 501b19848bd9e1547afebbdb16dcc55f5c23327f0ae49f768a06661c810654b6
children:
---

# wallets

## Purpose
Local Cashu ecash wallet with SQLite persistence for proofs and counter state. Provides send/receive token operations and tracks wallet history.

## Files
- `cashu.ts` - CashuWallet class with sendToken/receiveToken methods; decodeToken utility. Integrates db.ts for proof storage.
- `db.ts` - SQLite ops for proofs, counters, wallet_log tables. Functions: load/save/deleteProofs, load/persist/bumpCounters, getWalletHistory, logWalletOperation.
- `types.ts` - WalletInfo type and InsufficientFundsError custom error.

## Notes
- Uses @cashu/cashu-ts for wallet operations with bip39 seed derivation
- DB stored at ~/.cashu-wallet/wallet-{fingerprint}.sqlite
- Exports CashuWallet class and decodeToken as public entrypoints
