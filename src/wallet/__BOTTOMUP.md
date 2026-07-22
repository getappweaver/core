---
direct_hash: ee3f5d8d6d1c42687155a9d4cc441907ce0c64fdbd203c0dbe6b8af608ebbf44
subtree_hash: c22fe0b23fb9028a526950a6111ad74004855044600e796a602e141d40d2cda8
files:
  cashu.ts: 7333741459b487c840898d8054759d2b09acd19421c192fac0eed69c8f873cc4
  db.ts: 0e9882e5dd2b2f5cd9b90ab24648699f2bf77f33c11eda5bc3b49dd77706491e
  mint-url.ts: 54e54d3225d8dbdafef5ebf81ae9341a31cdf46eaee2dd89dad84a7366177e48
  nostr-state.ts: b7ed9f56c59a1eff264601826285a42da86b0797ebb7dd289dddddcf1c5da7e7
  qr.ts: 01a91252ba0aa0f6f4c8223dbf974dd5c5c7e12a7ed1cfe00e0b1e0304b6c92d
  types.ts: 501b19848bd9e1547afebbdb16dcc55f5c23327f0ae49f768a06661c810654b6
children:
---

# src/wallet

## Purpose
Implements the local Cashu wallet layer: deterministic wallet operations, proof/counter persistence, mint URL normalization, Nostr-backed deterministic state sync, and QR encoding. It is used by higher-level wallet commands/services to mint, melt, send, receive, inspect balance/history, and preserve deterministic counters.

## Files
- `cashu.ts` - Wraps @cashu/cashu-ts wallet operations for mint quotes, claiming, melting invoices, sending tokens, and receiving tokens while persisting proofs and counters.
- `db.ts` - Owns the SQLite wallet store for proofs, deterministic counters, balances, mints, and wallet operation history.
- `mint-url.ts` - Normalizes Cashu mint URLs and encodes/decodes mint-plus-keyset counter keys.
- `nostr-state.ts` - Serializes, encrypts, fetches, hydrates, and publishes deterministic wallet seed/counter state via Nostr events.
- `qr.ts` - Converts Lightning invoices into SVG QR-code data URIs.
- `types.ts` - Defines shared wallet result types and the insufficient-funds error used by wallet operations.

## Notes
- Wallet databases live outside the repo under the user's home directory.
- Mint URLs are normalized before counter/state comparisons.
- Deterministic counter state can be hydrated from and published to Nostr.
