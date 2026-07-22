---
direct_hash: 381dfd3f092f97c0a0b07d17b8583b8d7eb44189bcbc4482dbf05f7fe112af24
subtree_hash: 15bcde564782ccceb305b50968758e166eeefbfddaef1596d9281626c02d19dc
files:
  NostrAuthContext.tsx: 6f24c7a45283b51de544312556cc0419e7e1d11fdeab6529b257c4e069a18d9d
children:
---

# web/src/contexts

## Purpose
Solid context layer for browser-side Nostr authentication and signing. It centralizes persisted signer state, event signing, NIP-98 token creation, and self-encryption helpers for consumers wrapped by the auth provider.

## Files
- `NostrAuthContext.tsx` - Defines NostrAuthProvider and useNostrAuth, exposing auth state, connect/disconnect/unlock actions, signing, NIP-98 tokens, and NIP-44 self-encryption for the web app.

## Notes
- Supports NIP-07, NIP-55, NIP-46 bunker, and encrypted NIP-49 key flows.
- Provider behavior differs slightly between app and landing modes.
