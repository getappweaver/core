# Wallet, NWC, and Payment Services

Status: design agreed; NWC client, state, and commands implemented

Implementation plan:
[WALLET_NWC_PAYMENTS_IMPLEMENTATION_PLAN.md](./WALLET_NWC_PAYMENTS_IMPLEMENTATION_PLAN.md)

## Summary

AppWeaver should provide one core-owned interactive payment service while
supporting several ways for a user to pay. Plugins declare the payment rails
they accept, not the wallets that AppWeaver should use. Core discovers current
wallets, presents the payment UI, obtains explicit approval, executes the
selected payment, and returns a typed result.

The first wallet integration is Nostr Wallet Connect (NWC) using a first-party
NIP-47 client built on the already installed `nostr-tools` primitives. No Alby
SDK or other new payment dependency is required. Existing Cashu functionality
will be separated from the generic wallet command and later adapted into the
same payment service.

Automation is a separate trust model. Core stores automation NWC connections,
binds each connection to a plugin, and gives that plugin a scoped payment API
without exposing the connection URI. Scheduled jobs may later use those scoped
connections under scheduler-owned spending limits.

## Goals

- Add a strict NIP-44 NWC client under core ownership.
- Prevent satoshi/millisatoshi conversion mistakes.
- Let plugins request payments without accessing user wallet credentials.
- Keep payment confirmation UI and execution in core.
- Let users choose among WebLN, named NWC wallets, Cashu, and QR/BOLT-11.
- Manage several named NWC connections through AppWeaver UI.
- Support plugin-specific automation connections with wallet-side budgets.
- Prepare for scheduler-level payment limits and audit history.
- Reuse one Lightning payment flow from roadmap and future plugins.

## Non-Goals For The First Infrastructure Release

- Complete payment modal UX.
- Cashu payment delivery through the generic payment service.
- Scheduled or unattended payments.
- NIP-57 zap receipt aggregation in NR.
- NWC notifications, keysend, hold invoices, or transaction history.
- A WebLN wrapper around NWC.
- Sandboxing installed plugins.
- Encrypted NWC credential persistence.

## Terminology

### Payment Rail

A form of payment accepted by the consumer. The initial rails are:

- `lightning`: a BOLT-11 invoice paid over Lightning.
- `cashu`: a Cashu token accepted from one of a declared set of mints.

NWC and WebLN are not payment rails. They are ways to control a user's
Lightning wallet.

### Payment Source

A concrete source from which the user can pay:

- A browser-provided WebLN wallet.
- A named interactive NWC connection.
- The AppWeaver Cashu wallet and one compatible mint balance.
- Another Lightning wallet through QR code or a BOLT-11 string.

### Interactive Payment

A payment attached to one command request and one active user interaction. Core
must show Pay and Reject controls before executing it. Interactive payments use
the request-scoped plugin context.

### Automation Payment

An unattended NWC payment made through a connection explicitly classified for
automation and bound to one plugin. It does not use the interactive payment
modal. Wallet-side NWC permissions and budgets are the hard external limit.

## Current AppWeaver State

AppWeaver currently has:

- Cashu wallet code under `src/wallet/`.
- Cashu-only commands under `src/commands/wallet/`.
- A browser `wallet.payInvoice` client action that directly invokes
  `window.webln.sendPayment()`.
- Roadmap-specific Lightning zap invoice, WebLN, and QR behavior in
  `web/src/roadmap/lightningZap.ts`.
- A generic plugin capability system, but no wallet or payment capability.

The direct `wallet.payInvoice` action is not a sufficient authorization
boundary because a plugin can construct a client action containing an invoice.
It should eventually be replaced by a core-created payment intent or the
request-scoped payment flow described below.

## Plugin Context Mechanics

`PluginContext` is long-lived and scoped to one installed plugin. Core creates
it once during registration, passes it to `onInit`, and plugins may retain it
for background work. It must not contain a browser request, websocket request
ID, command transport, or interactive prompt session.

`PluginInvocationContext` is created for one command request. Its optional
`promptFn` is bound to the active transport. Web prompts capture the websocket
request ID inside the prompt function. CLI and Nostr prompts capture their
message source. HTTP command execution and scheduled runs have no interactive
prompt channel.

`PluginContext.promptFn` has been removed. An interactive job command can use
`PluginInvocationContext.promptFn`; a scheduled job run receives only the
long-lived context and cannot prompt.

The current names may later be changed to `PluginRuntimeContext` and
`PluginRequestContext`. That rename is a broad mechanical refactor and is not
required for the initial NWC work. The lifecycle comments on the existing types
should remain authoritative in the meantime.

## Service Boundary

Interactive payments are a core service, not a plugin capability. A capability
would become useful if independently installed plugins were allowed to register
new wallet provider implementations. NWC and Cashu are initially core-owned
adapters with deterministic coordination, so a public provider/consumer
contract would add unnecessary indirection.

The interactive service belongs on `PluginInvocationContext` because it needs
the current prompt session and client connection:

```ts
type InteractivePaymentService = {
  requestPayment(
    request: InteractivePaymentRequest,
  ): Promise<InteractivePaymentResult>;
};
```

Core creates a fresh request facade for every invocation. The facade must read
wallet state at request time rather than capturing a wallet list during plugin
initialization. A wallet added after plugin startup is therefore available to
the next payment request. An already open payment modal may retain a snapshot
of its payment sources.

The calling app identity is derived from registered plugin metadata. A plugin
may supply a payment purpose or description, but it cannot choose the trusted
app title or icon shown by core.

## Accepted Payment Options

The consumer supplies an array of accepted rails. There may be at most one
option of each type in the first version.

All alternatives must use the same principal amount. Provider-specific routing,
mint, or preparation fees are separate and may be displayed differently by
each payment-source tab.

Amounts are whole satoshis in the initial public API. Sub-satoshi Lightning
payments are outside the first contract. `Satoshi` may represent zero for
balances, but an interactive payment request must have a positive principal.

```ts
type InteractivePaymentRequest = {
  purpose: string;
  options: AcceptedPaymentOption[];
};

type AcceptedPaymentOption = LightningPaymentOption | CashuPaymentOption;

type LightningPaymentOption = {
  type: 'lightning';
  amount: Satoshi;
  createInvoice(): Promise<{
    invoice: string;
    checkSettlement(): Promise<PaymentSettlement>;
  }>;
};

type CashuPaymentOption = {
  type: 'cashu';
  amount: Satoshi;
  acceptedMints: [MintUrl, ...MintUrl[]];
  acceptToken(input: {
    attemptId: string;
    token: string;
  }): Promise<CashuTokenAcceptance>;
};
```

Lightning invoice creation is deferred until the modal opens. Core validates
that the returned BOLT-11 amount matches the declared principal before showing
or paying it. `checkSettlement` is required so QR payments have the same
authoritative completion contract as WebLN and NWC payments.

The Cashu mint list cannot be empty. Cashu is mint-specific, and an empty list
must not mean that an arbitrary mint is accepted. Token delivery uses an
idempotent callback with a core-generated attempt ID. Core reports success only
after the callback acknowledges the token and retains enough recovery metadata
to diagnose uncertain delivery.

## Typed Payment Results

Expected operational outcomes should be returned, not thrown:

```ts
type InteractivePaymentResult =
  | { status: 'success'; receipt: PaymentReceipt }
  | { status: 'rejected'; reason: 'user-rejected' | 'modal-closed' }
  | { status: 'unsupported'; reasons: PaymentUnsupportedReason[] }
  | { status: 'failed'; error: PaymentFailure };
```

Invalid API use, such as duplicate rail options, mismatched principal amounts,
an empty accepted mint list, or an invalid amount, is a programmer error and
should throw before a modal opens.

Only one interactive payment may be active per web client/session. A second
request returns `PAYMENT_BUSY`; financial prompts are not queued or stacked.

A separate preflight `requestSupportedPaymentOptions()` API is not included.
WebLN availability is client-specific and can change between preflight and
execution. `requestPayment()` performs authoritative discovery and returns
typed unsupported reasons such as `MINT_MISMATCH`.

## Payment Modal

The modal uses concrete payment sources as top-level tabs, in this order when
available:

1. Connected browser WebLN wallet.
2. Each named interactive NWC wallet.
3. Cashu.
4. Other wallet using QR code and BOLT-11.

The QR/BOLT-11 tab is always available for a Lightning option, not only after a
connected wallet fails.

When `window.webln` exists but is not enabled, its tab first shows Connect.
AppWeaver calls `enable()` and `getInfo()` only after that explicit action. Pay
is enabled after wallet identity is available. AppWeaver does not inject an
NWC-backed `window.webln`; it invokes NWC directly through core.

For Cashu, one tab contains a mint selector when more than one locally funded
mint matches the consumer's accepted mint list.

Each tab may present fees according to its provider. The principal remains the
same, but the payer's total deduction may include a Lightning routing fee or a
Cashu mint/preparation fee.

Balance is advisory:

- A known insufficient balance displays that the wallet needs funding and that
  another payment option can be selected.
- An unknown balance does not disable Pay.
- A provider insufficient-funds error is displayed without closing other tabs.
- Inline wallet funding is deferred.

There is no "Don't ask again" option initially. A future revocable payment-grant
table may store grants per plugin and payment type.

## Lightning Settlement

WebLN `sendPayment` and NWC `pay_invoice` return a preimage on success. Core
must hash the preimage and compare it with the BOLT-11 payment hash.

QR payment produces no payer-side response inside AppWeaver. The consumer's
required `checkSettlement` callback is therefore the authoritative generic
settlement mechanism. It may use:

- `lookup_invoice` against the invoice creator's wallet.
- A merchant service API.
- Validated kind `9735` zap receipt discovery for a NIP-57 payment.

For automation, NWC `lookup_invoice` is authoritative when a published
`pay_invoice` request times out or disconnects. `get_balance` is only a capacity
check and cannot identify whether a particular invoice was paid.

## Monetary Types

Public payment APIs must not accept JavaScript `number`. Values are immutable
objects backed by `bigint`:

```ts
const amount = Satoshi.parse('2000');
const millisats = amount.toMillisatoshi();
const exactSats = Millisatoshi.parse('2000000').toSatoshiExact();
```

Rules:

- Parse decimal strings or `bigint`; reject `number`.
- Accept only non-negative integers within the supported domain.
- Convert satoshis to millisatoshis by exact multiplication by `1000n`.
- `toSatoshiExact()` throws when the value is not divisible by `1000n`.
- NWC wire serialization is the only conversion to a JSON number.
- Wire serialization rejects values above `Number.MAX_SAFE_INTEGER`.
- UI and persistence use decimal strings.

The interactive payment API uses `Satoshi`. The NWC client converts explicitly
to its protocol-native millisatoshi fields at the wire boundary.

## First-Party NWC Client

The client lives under `src/nwc/` and uses existing `nostr-tools` support for
event signing, signature verification, NIP-44, relay subscriptions, and NWC
event kinds.

Initial methods:

- `get_info`
- `get_balance`
- `pay_invoice`
- `lookup_invoice`

NIP-44 v2 is required. Legacy NIP-04 fallback is intentionally unsupported.

The client must:

- Strictly parse `nostr+walletconnect` URIs.
- Validate the wallet public key and client secret as 32-byte hex values.
- Support and deduplicate multiple relay parameters.
- Permit secure `wss:` relays and explicitly allowed local-development `ws:`
  relays only.
- Fetch and verify the wallet's kind `13194` info event.
- Require advertised NIP-44 support.
- Subscribe for a response before publishing a request.
- Add a bounded request expiration.
- Filter kind `23195` responses by wallet author, request `e` tag, and client
  `p` tag.
- Explicitly verify response signatures.
- Validate decrypted response schemas and matching `result_type`.
- Normalize deployed-wallet envelopes that omit inactive `error` or `result`
  fields instead of sending them as `null`.
- Close subscriptions and timers on every terminal path.
- Return typed wallet, network, publish-timeout, reply-timeout, encryption, and
  response-validation errors.
- Never log connection URIs, secrets, plaintext requests, or preimages.

## NWC Connection Registry

Users manage several named NWC connections through AppWeaver UI. Connections
are stored in one JSON value in the core state database for the first version.
The secret-bearing URI is stored in plaintext by explicit design decision.

This does not protect credentials from database copies, backups, or malicious
plugins running in the AppWeaver process. Encryption-at-rest or OS keychain
storage may be added later. Wallet-side NWC budgets and revocation remain the
hard security boundary.

The initial unbound connection entry contains:

```ts
type StoredNwcConnection = {
  id: string;
  label: string;
  connectionUri: string;
  createdAt: number;
  updatedAt: number;
  verifiedAt: number | null;
  walletAlias: string | null;
  methods: string[];
};
```

Purpose classification and plugin binding are added with automation support in a
later phase. Interactive connections will be eligible for payment modal tabs.
Automation connections will be bound to one installed plugin and excluded from
interactive payment tabs. The exact stable plugin-binding identifier remains an
open design detail; it must prevent another plugin instance from claiming the
connection.

The complete URI:

- Is accepted by an authenticated web form submission.
- Is never returned to the browser after submission.
- Is never included in URLs, logs, errors, timelines, or Nostr-synchronized
  state.
- Is not exposed through the plugin API.

Adding a connection validates the URI locally and attempts `get_info`, but an
offline wallet may still be saved as unverified. `/nwc list` provides Add,
test, rename, inspect, and remove operations while displaying only safe metadata.
`/nwc add` opens an authenticated web form; it must not accept the URI as a CLI
argument or Nostr message.

## Commands And Wallet Overview

Existing Cashu commands move from `src/commands/wallet/` to
`src/commands/cashu/` and use `/cashu ...`.

```text
/cashu list|mint|melt|mints|balance|decode|receive|send|history
/nwc list|add|remove|info|balance
/wallet list
```

The new `/wallet list` is an aggregate overview widget. It shows NWC, WebLN,
Cashu, and future wallet types as tabs or sections, but delegates mutations to
their owner views such as `/nwc list` and `/cashu list`.

Server-rendered wallet data includes current NWC and Cashu state. The browser
appends client-specific WebLN detection. `/wallet list` shows "Browser wallet
detected" and an explicit Connect action rather than calling `enable()` during
rendering.

## Interactive NWC Versus Automation NWC

Core owns the NWC protocol client and every stored URI.

Interactive consumers call the request-scoped payment service. They cannot
select an NWC connection directly; core discovers eligible interactive wallets
and the user chooses a tab.

An automation-enabled plugin receives a scoped core API such as:

```ts
type PluginAutomationPayments = {
  getInfo(input: { connectionId: string }): Promise<NwcWalletInfo>;
  getBalance(input: { connectionId: string }): Promise<Satoshi>;
  payInvoice(input: {
    connectionId: string;
    invoice: string;
  }): Promise<AutomationPaymentResult>;
  lookupInvoice(input: {
    connectionId: string;
    invoice: string;
  }): Promise<AutomationLookupResult>;
};
```

Core derives the calling plugin identity from its scoped context, verifies the
connection binding, applies relevant policy and audit hooks, and invokes the
internal NWC client. It never returns the raw URI.

The plugin-scoped automation API belongs on the long-lived `PluginContext`
because it is intentionally usable by background work. It is separate from the
interactive service on `PluginInvocationContext`. Scheduler v3 adds a
job/run-scoped policy layer before invoking the same core automation service.

This is an API authorization boundary, not a hostile-code sandbox. Installed
plugins currently run in-process and can access filesystem and process APIs.
Plugin process isolation and OS-level sandboxing are deferred.

## Scheduled Payments And Scheduler V3

A payment-enabled scheduler v3 job binds to one exact named automation NWC
connection. There is no implicit default wallet. Removing that connection shows
affected jobs, requires confirmation, then disables and notifies them.

All local job limits are optional. Missing limits mean AppWeaver applies no
corresponding local limit and relies on the selected NWC connection's wallet-side
policy. Creating a payment-enabled job with no local limits requires an explicit
warning confirmation.

```ts
type SchedulerPaymentPolicyV3 = {
  nwcConnectionId: string;
  maxPerPayment?: Satoshi;
  maxPerRun?: Satoshi;
  maxTotal?: Satoshi;
  maxPerWindow?: {
    amount: Satoshi;
    window: {
      unit: 'minute' | 'hour' | 'day' | 'week';
      count: number;
    };
  };
};
```

`maxPerWindow` is a rolling window measured backward from each attempted
payment. `count` is the number of units, for example 100 sats per two hours.

The limits address different risks because one run may request several
payments:

- `maxPerPayment`: bounds one payment operation.
- `maxPerRun`: bounds aggregate spending during one run.
- `maxTotal`: bounds lifetime spending by the job.
- `maxPerWindow`: bounds aggregate spending in a rolling time interval.

Limit behavior:

- Lifetime `maxTotal` exhaustion disables and notifies the job.
- `maxPerRun` exhaustion fails only the current run.
- `maxPerWindow` exhaustion skips or fails the current run but leaves the job
  enabled for a later eligible window.
- A missing, expired, unauthorized, or wallet-budget-exhausted NWC connection
  disables and notifies the job.

The scheduler records each payment attempt and its amount, run, invoice hash,
connection ID, timestamps, status, and safe error code. It does not store the
connection URI or preimage in ordinary logs.

If `pay_invoice` becomes uncertain after publication, the runner uses
`lookup_invoice`. Settled and failed results are authoritative. Attempts that
remain unknown after bounded lookup retries count conservatively toward local
limits; the exact terminal job behavior for a permanently unavailable lookup
should be confirmed during scheduler v3 implementation.

Push notifications for scheduled runs should deep-link to `/job show <id>`
rather than the generic job list. The job detail view shows the relevant run,
payment outcome, and reason such as expired wallet, exceeded budget, insufficient
funds, or unresolved payment.

## Future Zaps

The generic Lightning option can support zaps when a consumer's deferred
invoice callback creates a NIP-57 zap request and obtains its invoice through
LNURLP.

NR may later fetch kind `9735` zap receipts from the user's followers similarly
to reactions. Receipt verification must validate the LNURLP `nostrPubkey`, zap
request context, amount, invoice, and duplicate payment hash before counting a
zap. This work is separate from the NWC infrastructure release.

## Deferred Plugin Sandbox

Core-managed credentials and plugin binding reduce accidental access but do not
protect against malicious in-process plugins. A real sandbox requires a
separate plugin process plus OS, container, or WASI restrictions. A future
plugin RPC protocol should expose scoped services without core DB handles,
environment variables, or wallet credentials. This subject is intentionally
parked and does not block wallet implementation.

## Open Decisions

- Stable identity format for binding an automation connection to one installed
  plugin instance.
- Exact BOLT-11 parser scope and network policy.
- Payment modal timeout and settlement polling intervals.
- Fee display and maximum-fee controls for each provider.
- Terminal scheduler behavior when both payment response and bounded
  `lookup_invoice` reconciliation remain unavailable.
- Cashu token recovery behavior after uncertain callback delivery.
- Future payment grant schema and authorization UX.
- Credential encryption or OS keychain migration.

## References

- [NIP-47](https://nips.nostr.com/47)
- [NWC extension specifications](https://github.com/nostr-wallet-connect/nwc)
- [WebLN guide](https://www.webln.guide/)
- [WebLN sendPayment](https://www.webln.guide/building-lightning-apps/webln-reference/webln.sendpayment)
- [nostr-tools NIP-47 helper](https://github.com/nbd-wtf/nostr-tools/blob/master/nip47.ts)
