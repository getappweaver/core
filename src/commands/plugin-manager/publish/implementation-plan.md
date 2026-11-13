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

## Publication diagnostics and discovery

- [x] Propagate structured outcomes to background command status, including partial
      success; replace stale publication results after failed attempts.
- [x] Stream stages, elapsed signing waits, account/purpose, signing transport
      acknowledgements and catalog relay outcomes without exposing credentials.
- [x] Verify the exact published catalog event and distinguish relay acceptance
      from discovery; retain publication destinations for future catalog queries.
- [x] Reuse the existing icon URL when its published source and SHA-256 match;
      use the publishing account for Blossom relay discovery. Publication catalog
      lookup skips unnecessary icon downloads; network Git operations yield while
      progress updates stream.
- [x] Update feature and shared renderer documentation; targeted ESLint `--fix`,
      web TypeScript and whitespace checks pass.
- [ ] Repository-wide lint passes: currently blocked by unused `NostrEvent` in
      `plugins/nr/db/evaluation-queue.ts` and unused `settings` in
      `plugins/translate/service.ts`, outside this change.
- [ ] Root TypeScript passes: still blocked by the three previously documented
      FIPS vendor errors (ProjectivePoint and two WebRTC string/byte mismatches).
- [ ] User verification with authenticated Amber publication and timeout recovery.

## NIP-46 response-side diagnostics

- [x] Report per-relay reply connection setup, requested subscriptions, closures,
      and received responses independently; one failed relay must not stop others.
- [x] Distinguish unmatched, undecryptable and malformed responses without logging
      decrypted payloads; include send/listen counts in timeout diagnostics.
- [x] Complete targeted ESLint `--fix` and whitespace checks; document the
      diagnostic semantics. Root TypeScript still reports only the three FIPS
      vendor errors above. No live signing requests were sent for verification.
- [ ] User retries with Amber to establish whether replies reach the backend.

## Warning/error-only diagnostics

- [x] Keep routine publication stages in live status while retaining only explicitly
      classified warnings/errors in streamed and refreshed diagnostic histories.
- [x] Preserve terminal warning/error summaries in refreshed release results.
- [x] Update documentation; targeted ESLint `--fix` and whitespace checks pass.
      Root TypeScript reports only the same three existing FIPS vendor errors.

## Longer signer approval window

- [x] Extend backend and browser NIP-46 request and bunker connection waits from
      one minute to five minutes; derive publication wait/timeout messages from
      the configured duration and update the feature documentation.
- [x] Targeted ESLint `--fix` and whitespace verification passed.
