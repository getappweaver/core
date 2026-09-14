# Wallet, NWC, and Payment Services Implementation Plan

Status: in progress; Phases 0-4 complete for unbound interactive NWC connections

Related design:
[WALLET_NWC_PAYMENTS.md](./WALLET_NWC_PAYMENTS.md)

## Goal

Introduce a first-party NIP-47 client, named NWC wallet management, safe monetary
types, and core payment service boundaries without adding a third-party payment
dependency. Deliver the protocol and wallet infrastructure first, then add
interactive payment UX, Cashu integration, and scheduled automation in separate
phases.

## Delivery Principles

- Keep core in control of credentials, confirmation, execution, and auditing.
- Do not expose a payment operation before its authorization path exists.
- Treat payment rails separately from payer wallet providers.
- Use exact typed amounts and convert to NWC JSON numbers only at the wire.
- Prefer small phases that can be verified without real funds.
- Use mock relay/wallet adapters for deterministic verification where needed.
- Do not add `@getalby/sdk` or another payment dependency.
- Preserve the existing Cashu behavior while moving its command namespace.
- Keep scheduler v3 and NR zap aggregation out of the infrastructure MVP.

## Phase 0: Prompt Context Boundary

Status: complete in the current working tree

- [x] Document `PluginContext` as long-lived plugin runtime state.
- [x] Document `PluginInvocationContext` as request-scoped state.
- [x] Remove `promptFn` from `PluginContext`.
- [x] Keep `PluginInvocationContext.promptFn` optional for transports without an
      interactive answer channel.
- [x] Create CLI/Nostr prompt functions per inbound command with the source
      captured in the closure.
- [x] Keep web prompt functions bound to their websocket request ID.
- [x] Separate pending CLI and Nostr prompts by message source.
- [x] Remove Job, Todo, and Bookmark fallback use of the long-lived prompt.
- [x] Ensure scheduled Job execution receives no prompt function.
- [x] Run TypeScript, targeted ESLint, and affected plugin tests.

Follow-up outside the wallet critical path:

- [ ] Consider renaming `PluginContext` to `PluginRuntimeContext`.
- [ ] Consider renaming `PluginInvocationContext` to `PluginRequestContext`.
- [ ] Review long-lived `sendReply` and interactive bunker-signing services for
      the same request-scope concerns.

## Phase 1: Exact Monetary Types

Status: complete

Proposed files:

```text
src/payments/amount.ts
src/payments/types.ts
```

- [x] Implement immutable `Satoshi` backed by `bigint`.
- [x] Implement immutable `Millisatoshi` backed by `bigint`.
- [x] Accept decimal strings and `bigint`; reject JavaScript `number`.
- [x] Reject negative, fractional, malformed, and out-of-domain values.
- [x] Reserve positive-amount enforcement for payment-request validation while
      permitting
      zero-valued balance representations.
- [x] Add exact satoshi-to-millisatoshi conversion.
- [x] Add exact millisatoshi-to-satoshi conversion with divisibility checks.
- [x] Add explicit floor conversion only where a caller names that behavior.
- [x] Add decimal persistence and display serialization.
- [x] Add an explicitly named checked NWC JSON-number encoder.
- [x] Prevent implicit JavaScript numeric coercion.
- [x] Verify representative parsing, conversion, wire-boundary, and coercion
      behavior without adding a test file.

Exit criteria:

- Public payment and NWC APIs cannot accidentally accept an untyped number.
- Every conversion is explicit and passes compile, lint, formatting, and runtime
  smoke verification.

## Phase 2: NWC Protocol Foundation

Status: complete

Proposed files:

```text
src/nwc/connection.ts
src/nwc/errors.ts
src/nwc/protocol.ts
src/nwc/schemas.ts
src/nwc/types.ts
```

- [x] Define strict schemas for kind `13194` info events.
- [x] Define request and response payload schemas for `get_info`, `get_balance`,
      `pay_invoice`, and `lookup_invoice`.
- [x] Define typed NWC error codes and local transport errors.
- [x] Accept only canonical `nostr+walletconnect` URIs initially.
- [x] Validate 32-byte hex wallet pubkeys and client secrets.
- [x] Parse, validate, normalize, and deduplicate repeated `relay` parameters.
- [x] Restrict relays to `wss:` except explicit local-development `ws:` URLs.
- [x] Parse optional `lud16` without treating it as authorization data.
- [x] Redact connection strings from all formatted errors and logs.
- [x] Add a safe connection projection that omits the secret.
- [x] Verify representative URI parsing and redaction behavior without adding a
      test file.

Exit criteria:

- A connection URI can be validated and safely represented without network
  access or secret leakage.

## Phase 3: First-Party NWC Client

Status: complete

Proposed files:

```text
src/nwc/client.ts
src/nwc/transport.ts
```

- [x] Use `nostr-tools` event signing, verification, NIP-44, `SimplePool`, and
      event-kind constants.
- [x] Fetch and verify kind `13194` from the configured wallet pubkey.
- [x] Require advertised `nip44_v2`; return a typed unsupported-encryption error
      for NIP-04-only wallets.
- [x] Publish to all configured relays and succeed when any relay accepts.
- [x] Subscribe for kind `23195` before publishing kind `23194`.
- [x] Include wallet `p`, encryption, and bounded expiration tags.
- [x] Correlate responses by wallet author, request `e`, and client `p`.
- [x] Verify response signatures before decryption.
- [x] Decrypt with NIP-44 and validate matching `result_type`.
- [x] Accept and normalize deployed-wallet responses that omit inactive
      `error` or `result` fields.
- [x] Implement `getInfo()`.
- [x] Implement `getBalance()` with typed amount conversion.
- [x] Implement low-level `payInvoice()` without exposing it to commands or
      plugins yet.
- [x] Implement `lookupInvoice()` for payment reconciliation.
- [x] Close subscriptions and timers after success, error, abort, publish
      failure, and timeout.
- [x] Accept `AbortSignal` and use bounded publish/reply deadlines.
- [x] Do not log requests, invoices where unnecessary, secrets, decrypted
      responses, or preimages.

Verification scenarios:

- [x] NIP-44 request encryption and response decryption through an in-memory
      mock wallet.
- [x] Subscription-before-publication ordering in the mock transport.
- [ ] Multiple-relay publish success and complete publish failure.
- [ ] Wrong author, wrong `e`, wrong `p`, invalid signature, malformed JSON,
      wrong result type, and unsupported encryption.
- [ ] Wallet error mapping including `UNAUTHORIZED`, `QUOTA_EXCEEDED`,
      `INSUFFICIENT_BALANCE`, `PAYMENT_FAILED`, and `NOT_FOUND`.
- [ ] Publish timeout, response timeout, abort, duplicate response, and cleanup.
- [x] `pay_invoice` followed by `lookup_invoice` in the mock wallet flow.
- [x] Real Coinos `get_info` and `get_balance` requests through the configured
      connection.

Exit criteria:

- The client can complete payer-side NWC behavior against deterministic mock
  verification.
- No interactive or automation consumer can invoke it through public core APIs.

## Phase 4: NWC Connection Persistence And Commands

Status: complete for unbound interactive connections; automation metadata is
deferred to Phase 10

Proposed files:

```text
src/nwc/state.ts
src/commands/nwc/definition.ts
src/commands/nwc/handler.ts
src/commands/nwc/...renderers...
```

- [x] Define versioned JSON state for named NWC connections.
- [x] Store the JSON value in the core state database.
- [x] Store connection URIs in plaintext as currently decided.
- [x] Assign stable random connection IDs independent of user labels.
- [ ] Classify each connection as `interactive` or `automation` in Phase 10.
- [ ] Require a plugin binding for automation connections in Phase 10.
- [ ] Resolve the stable plugin-binding identity before implementing automation
      access in Phase 10.
- [x] Add safe list projections that never include the secret or complete URI.
- [x] Add create, rename, and remove operations.
- [x] Validate locally before persistence.
- [x] Attempt `get_info` during Add/Test but allow an unreachable connection to
      be saved as unverified.
- [x] Serialize whole-JSON state updates in database transactions and increment
      the stored revision.
- [x] Add `/nwc list`, `/nwc info`, `/nwc balance`, `/nwc add`, `/nwc rename`,
      and `/nwc remove`.
- [x] Make `/nwc add` open an authenticated web form; never accept a connection
      URI through CLI arguments or a Nostr message.
- [x] Keep low-level `/nwc pay` unavailable until the confirmation flow exists.
- [x] Submit the URI in a non-timeline websocket command payload, never a URL.
- [x] Ensure timelines and command results contain only redacted metadata.
- [x] Add confirmation before removing a connection.

Verification scenarios:

- [ ] JSON state migration/version rejection and malformed entry recovery.
- [ ] Concurrent add/remove without lost updates.
- [x] Redacted state projection and valid WebNode list output.
- [x] Successful Add/verification and Balance command flow with a mock wallet.
- [ ] Offline unverified save and later successful Test.
- [ ] Interactive versus automation classification rules in Phase 10.
- [ ] Automation connection without plugin binding rejection in Phase 10.

Exit criteria:

- Users can manage and inspect several NWC connections without exposing their
  bearer secrets to the browser after submission.
- Read-only info and balance behavior works end-to-end.

## Phase 5: Command Namespace And Aggregate Wallet View

- [x] Move Cashu command implementation from `src/commands/wallet/` to
      `src/commands/cashu/`.
- [x] Register the Cashu command as `/cashu`.
- [x] Intentionally break shipped `/wallet` Cashu invocations at the release
      boundary so `/wallet` has unambiguous aggregate-only ownership.
- [x] Create a new generic `src/commands/wallet/` implementation.
- [x] Add `/wallet list` as an overview-only wallet widget.
- [x] Show safe NWC connection metadata and current availability.
- [x] Show Cashu wallet/mint balances using existing behavior.
- [x] Let the browser append WebLN detection to the server-rendered overview.
- [x] Show WebLN as detected without invoking `enable()`.
- [x] Add an explicit WebLN Connect action followed by `getInfo()`.
- [x] Link NWC and Cashu sections to their owner management views.
- [x] Keep mutations out of the aggregate wallet widget.

Exit criteria:

- `/cashu` owns Cashu commands, `/nwc` owns NWC connections, and `/wallet list`
  presents a coherent multi-wallet overview.

## Phase 6: Interactive Payment Contracts And Core Broker

Proposed files:

```text
src/payments/interactive-types.ts
src/payments/validation.ts
src/payments/service.ts
src/payments/lightning-invoice.ts
```

- [x] Define one Lightning and one Cashu accepted-option type.
- [x] Require at most one option per rail.
- [x] Require the same principal `Satoshi` amount across alternatives.
- [x] Require non-empty Cashu accepted mints.
- [x] Require deferred Lightning `createInvoice` and `checkSettlement`
      callbacks.
- [x] Require idempotent Cashu `acceptToken` with a core attempt ID.
- [x] Define typed success, rejected, unsupported, and failed results.
- [x] Throw only for invalid API use.
- [x] Define safe unsupported and payment failure codes.
- [x] Implement or isolate the minimum BOLT-11 parser needed to validate network,
      amount, expiry, and payment hash without adding a dependency.
- [x] Derive app title/icon from registered plugin metadata.
- [x] Add the interactive payment facade to `PluginInvocationContext` only when
      the transport supports it.
- [x] Return unsupported for HTTP/background invocation rather than using a
      global prompt.
- [x] Enforce one active payment per web client/session and return
      `PAYMENT_BUSY` for concurrent requests.
- [x] Read NWC and Cashu state at request time and require browser discovery at
      presentation time.
- [x] Keep payment source discovery and execution inside core.
- [x] Do not add a separate provider preflight API.

Exit criteria:

- Plugins can express accepted rails through a transport-safe core contract.
- No plugin can execute an interactive payment without entering the core
  approval flow.

## Phase 7: Core Payment Modal And Provider Adapters

Proposed areas:

```text
src/payments/web-prompt.ts
src/web/ws-schema.ts
src/web/ws.ts
web/src/payments/
```

- [x] Render concrete source tabs: WebLN, each interactive NWC wallet, Cashu,
      then Other wallet.
- [x] Make WebLN the first tab when detected.
- [x] Require explicit WebLN Connect before `enable()` and `getInfo()`.
- [x] Never inject an NWC WebLN wrapper into `window.webln`.
- [x] Invoke named NWC wallets directly through core.
- [x] Always provide QR code, copyable BOLT-11, and `lightning:` link.
- [x] Add Cashu mint selection when several accepted local mints have funds.
- [x] Show principal separately from provider-specific fees.
- [x] Treat unknown balance as usable.
- [x] Show known or returned insufficient balance without removing other tabs.
- [x] Display a message to fund that wallet or choose another option.
- [x] Defer inline funding workflows.
- [x] Add Pay and Reject with no remembered grant checkbox initially.
- [x] Verify WebLN/NWC preimages against the invoice payment hash.
- [x] Poll the required consumer settlement callback for QR and final merchant
      confirmation.
- [x] Define bounded modal, invoice, provider, and settlement timeouts.
- [x] Ensure invoice expiry disables Pay and requests a fresh invoice where safe.
- [x] Avoid recording secrets or preimages in browser/server timelines.

Verification scenarios:

- [ ] WebLN absent, detected, rejected, connected, paid, and failed.
- [ ] Zero, one, and several named NWC wallets.
- [ ] NWC offline, unauthorized, quota exceeded, insufficient, timeout, and paid.
- [ ] QR settlement callback success, expiry, and timeout.
- [ ] Cashu unsupported, mint mismatch, one mint, and several matching mints.
- [ ] Equal principal with different provider fees.
- [ ] Modal close, Reject, duplicate request, and invalid consumer callback.
- [ ] Desktop and mobile layouts.

Exit criteria:

- A plugin can request one payment and the user can complete it through any
  supported source under core-controlled confirmation.

## Phase 8: Migrate Existing Lightning Payments

- [x] Extract roadmap's invoice display and WebLN/QR behavior into the generic
      core payment flow.
- [x] Make roadmap supply a deferred Lightning option and settlement callback.
- [x] Preserve zap request construction, LNURLP validation, and receipt context.
- [x] Remove roadmap's direct `window.webln` invocation.
- [x] Replace or remove the raw-invoice `wallet.payInvoice` client action.
- [x] Add `/nwc pay` using the same core confirmation service.
- [x] Verify roadmap funding still falls back to QR and BOLT-11.

Exit criteria:

- No shipped feature bypasses the core interactive payment confirmation path.

## Phase 9: Cashu Payment Adapter

- [ ] Adapt current Cashu balances into payment-source discovery.
- [ ] Normalize accepted mint URLs with existing Cashu mint normalization.
- [ ] Compute spendability and mint/preparation fees for matching mints.
- [ ] Create a token only after Pay approval.
- [ ] Deliver through the idempotent consumer callback.
- [ ] Record delivery as pending, accepted, failed, or unknown.
- [ ] Design token recovery for callback timeout or uncertain acknowledgment.
- [ ] Ensure retries cannot transfer two independently spendable tokens for one
      attempt.
- [ ] Add Cashu receipt/audit projections without exposing bearer tokens.

Exit criteria:

- Cashu is a first-class source behind the same interactive contract without
  changing existing direct Cashu command behavior.

## Phase 10: Automation Connections And Scoped Plugin API

- [ ] Finalize stable plugin-binding identity.
- [ ] Exclude automation connections from interactive modal tabs.
- [ ] Add a core-owned scoped automation payment client to `PluginContext` for
      explicitly authorized background work.
- [ ] Derive caller identity from plugin registration; do not accept it as a
      plugin argument.
- [ ] Verify connection purpose and binding on every operation.
- [ ] Expose `getInfo`, `getBalance`, `payInvoice`, and `lookupInvoice` without
      exposing the URI.
- [ ] Add safe audit rows for attempts and results.
- [ ] Add removal confirmation listing dependent automation consumers.
- [ ] Disable and notify dependent jobs when a bound connection is removed.
- [ ] Document that in-process plugins are trusted and wallet-side NWC budgets
      remain the hard limit.

Exit criteria:

- One plugin can use only its assigned automation connections through core.
- Credentials never cross the plugin API boundary.

## Phase 11: Scheduler V3 Payment Policy

- [ ] Add `scheduler:v3` rather than changing v2 semantics.
- [ ] Wrap the plugin-scoped automation service with job/run-specific policy
      enforcement during scheduled task execution.
- [ ] Add an exact `nwcConnectionId` binding for payment-enabled jobs.
- [ ] Add optional `maxPerPayment`, `maxPerRun`, lifetime `maxTotal`, and rolling
      `maxPerWindow` limits.
- [ ] Represent window length as `{ unit, count }`.
- [ ] Require explicit warning confirmation when no local limits are set.
- [ ] Add payment attempt persistence keyed by job and run.
- [ ] Count settled and unresolved attempts according to conservative policy.
- [ ] Use `lookup_invoice` after an uncertain published payment.
- [ ] Treat `get_balance` as capacity information, not settlement proof.
- [ ] Disable and notify on missing, expired, unauthorized, removed, or
      wallet-budget-exhausted connections.
- [ ] Disable and notify when lifetime `maxTotal` is exhausted.
- [ ] Fail only the current run for `maxPerRun` exhaustion.
- [ ] Skip/fail the current run but retain the schedule for `maxPerWindow`
      exhaustion.
- [ ] Decide terminal behavior after bounded lookup remains unavailable.
- [ ] Deep-link payment-related notifications to `/job show <id>`.
- [ ] Show payment attempts, outcomes, and safe reason messages in Job detail.
- [ ] Ensure retry and restart recovery cannot silently duplicate a payment.

Exit criteria:

- Scheduled payments have exact wallet selection, layered limits, durable
  accounting, reconciliation, and actionable notifications.

## Phase 12: NR Zap Receipt Support

- [ ] Add follower-oriented kind `9735` fetching using established NR reaction
      and relay patterns where appropriate.
- [ ] Resolve the recipient LNURLP document and authoritative `nostrPubkey`.
- [ ] Validate zap receipt signature, author, zap request, target context, amount,
      invoice, and payment hash.
- [ ] Deduplicate by payment hash.
- [ ] Use validated receipts for settlement callbacks and funding totals.
- [ ] Keep relay acceptance separate from proof of payment.

Exit criteria:

- NR can discover and count only verified follower zap receipts.

## Deferred Work

- [ ] NWC `make_invoice` and receiving-wallet UI.
- [ ] NWC notifications and transaction history.
- [ ] NWC keysend and optional extension specifications.
- [ ] Payment grants and "Don't ask again" UX.
- [ ] Inline funding for WebLN, NWC, and Cashu wallets.
- [ ] Credential encryption or OS keychain storage.
- [ ] Out-of-process plugin RPC and OS/container/WASI sandboxing.
- [ ] Third-party wallet providers through a public capability contract.
- [ ] Sub-satoshi interactive payment amounts.

## Verification Commands

Run after each applicable phase:

```text
bunx tsc --noEmit
bunx eslint <touched files>
bunx prettier --check <touched files>
git diff --check
```

Also run each modified installed plugin repository's available verification and
patch checks separately because `plugins/` contains independent Git
repositories and is ignored by the AppWeaver core repository.
