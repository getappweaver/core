# Publication repository reconciliation

- [x] Discover all Git fetch remote names/URLs and normalize repository comparison.
- [x] Require explicit selection for multiple remotes or manifest/catalog mismatches;
      carry the selected URL through review and confirmed publication.
- [x] Push and verify the selected destination instead of silently using origin.
- [x] Reconcile plugins.json after successful and already-published releases.
- [x] Persist publication receipts and provide registration-only retry after a local failure.
- [x] Correct the local FIPS manifest entry to its configured Nostr origin.
- [x] Targeted ESLint and `git diff --check` passed; command generation completed.
- [x] One-off selection/output-schema check covered a single matching remote,
      multiple remotes, mismatched registration, explicit selection, unknown
      destination rejection, URL normalization, and registration retry controls.
- [x] TypeScript check reported only the three existing FIPS vendor errors
      (removed Noble ProjectivePoint and two WebRTC string/byte mismatches).
- [ ] User verification of authenticated publication, relay-failure behavior, and
      a real manifest-write failure followed by registration-only retry.

No catalog publication, Git push, or authenticated browser checks are performed
as part of implementation verification. Existing offer management stays separate.

## ngit account output compatibility

- [x] Support ngit 3.x `accounts` output while retaining the older `active.npub`
      format for the first-publication author check. Select only the active account.
- [x] Targeted ESLint `--fix` passed. A one-off check of the actual lookup function
      covered both formats, inactive-first selection, missing active accounts,
      invalid npubs, malformed account entries, invalid JSON and command failure.
- [ ] User retries first publication with ngit 3.0.5 after loading the fix.
