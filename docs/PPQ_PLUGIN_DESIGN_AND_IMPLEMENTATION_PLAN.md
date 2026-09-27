# PPQ Plugin Design and Implementation Plan

Status: draft for review

## Goal

Add a workspace-scoped `ppq` app that makes PayPerQ the exclusive OpenCode
model source while active. The app manages PPQ accounts and API keys, exposes
the PPQ model catalog in AppWeaver, routes inference through a locally managed
privacy proxy, and supports user-approved Lightning top-ups through a selected
core NWC connection.

The work should also establish reusable model-source infrastructure so Routstr
can later move out of core without copying PPQ-specific account and payment
behavior.

## Confirmed Product Decisions

### Scope and activation

- PPQ is an installable AppWeaver plugin/app with alias `ppq`.
- "Enable PPQ" means a workspace-level active mode. It does not unload the
  installed plugin.
- PPQ mode is independent for the `parent` and `appweaver` workspaces.
- While active, PPQ is exclusive: only PPQ models are exposed to OpenCode.
- Disabling PPQ restores the workspace's normal OpenCode configuration.
- Disabling preserves all PPQ accounts, encrypted credentials, wallet
  assignments, catalog cache, selected model, favorites, recent models,
  notification settings, and payment history.
- Destructive local wipe, API-key revocation, account removal, and NWC
  unassignment are separate explicit operations.

### Managed OpenCode configuration

- AppWeaver fully manages each workspace's runtime `opencode.json`.
- The canonical workspace-local normal configuration is kept under
  `.appweaver/opencode.json`.
- AppWeaver materializes the currently active configuration at
  `<workspace>/opencode.json`.
- Generated root `opencode.json` files are ignored by Git.
- The currently tracked AppWeaver `opencode.json` moves to a tracked template
  used to initialize `.appweaver/opencode.json`.
- Parent setup no longer symlinks `parent/opencode.json` to the AppWeaver
  repository's file. Parent and AppWeaver receive independent managed files.
- Existing user configuration is imported into the canonical managed file
  during migration before the root file becomes generated output.
- Core OpenCode config writers must update the canonical managed file and then
  rematerialize the active runtime variant. They must not mutate generated
  output as the source of truth.

### Restart behavior

- OpenCode config changes are applied by restarting only AppWeaver's managed
  `opencode serve` process, not the whole bot.
- Restart-requiring changes are queued.
- Core stops admitting new OpenCode runs, waits for all active runs to drain,
  confirms no OpenCode session is busy, writes the new config, restarts
  OpenCode, invalidates caches, and then admits runs again.
- Drain waits indefinitely. It does not force-interrupt a task after a timeout.
- System-log entries announce that a change is waiting for drain, when restart
  begins, and when the transition completes.
- Manual status, cancellation, and force-restart recovery actions should exist,
  even though no automatic timeout is used.

### Accounts and keys

- A workspace can store multiple PPQ accounts and selects one active account.
- The account UI offers `Create account` and `Import account`.
- Import requires both `credit_id` and an API key.
- The selected account is always visible. With no selected account, the UI
  warns the user to create or import one and PPQ tasks cannot run.
- A newly created account initially uses the API key returned by
  `POST /accounts/create` as its runtime key.
- Each account supports a selected runtime API key plus full key management:
  list, create, edit name/usage limit/reset period/expiry, select, and revoke.
- Revoking the active runtime key requires selecting or creating a replacement
  before another PPQ task can run.
- Account/key switching stays within the PPQ source: core drains and pauses
  runs, the plugin rotates the proxy credential on the same loopback port, and
  core resumes queued runs only after the selected credential is healthy. The
  OpenCode provider URL and model source do not change.
- PPQ's `credit_id` is treated as an account-administration secret, not public
  metadata. PPQ currently accepts it for balance access, key management, and
  hosted NWC settings.

### Secret storage

- PPQ `credit_id` values and API keys are NIP-44 v2 encrypted in the
  workspace-local PPQ database.
- Core NWC connection URIs remain in the core database but are migrated from
  plaintext to NIP-44 v2 encrypted values.
- Encryption and decryption failures are fatal for the affected operation.
  There is no plaintext write fallback and no "failed decryption means
  plaintext" read fallback.
- Secrets are redacted from logs, errors, command results, declarative UI
  trees, payment records, and system messages.
- The PPQ database stores only a core NWC connection ID. It never copies the
  NWC URI.

### NWC and top-ups

- NWC remains local. AppWeaver never uploads an NWC URI to PPQ's hosted
  auto-top-up API.
- Each PPQ account can select an existing core NWC connection or add a new,
  purpose-labeled connection.
- A dedicated NWC connection with a wallet-side budget is recommended but not
  required.
- Top-ups are assisted, not unattended. Every NWC payment requires explicit
  approval by the authorized master user.
- On-demand Web top-ups keep the invoice only for the active payment modal.
  Closing it discards local invoice state; a new request generates a new invoice.
  AppWeaver stores no PPQ top-up attempt or invoice history. An ambiguous payment
  must be checked with PPQ before the user chooses to pay a new invoice.
- No rolling AppWeaver auto-spend cap is part of the first release because
  unattended payment is not supported.
- The current prepaid PPQ balance is the available task budget.
- PPQ mode may be enabled with zero balance, but task preflight blocks
  inference and opens the top-up flow.
- The user chooses a sat amount before AppWeaver requests an account top-up
  invoice. The UI offers configurable presets plus a custom amount.
- The initial preset recommendation is `100`, `1k`, `5k`, and `custom`, matching
  the Roadmap funding interaction and PPQ's documented 100-sat minimum. This is
  a recommended default, not a protocol rule.
- Once PPQ returns an invoice, AppWeaver parses and validates it and shows the
  exact invoice amount before payment.
- Successful NWC payment is not enough to resume work. AppWeaver must also
  reconcile PPQ invoice status or account credit.
- Chat inference uses PPQ prepaid account credit. Direct invoice-bearing L402
  chat payment is out of scope unless PPQ documents support for it later.

### Balance checks and reports

- PPQ preflight runs before every new user task.
- Balance is checked at task boundaries, when opening PPQ Overview/Funding, and
  while handling a `402`. There is no idle background polling.
- Proactive low-balance alerts are disabled until an account threshold is
  configured.
- A mid-task insufficient-balance `402` always creates a persisted funding
  incident.
- Push and Nostr DM notifications are enabled by default and configurable in
  the Settings widget.
- Push is minimal: workspace/session identity, spend/balance figures, and the
  required action.
- NIP-44-encrypted DM is detailed: task summary, completed work, last activity,
  error, session spend, and top-up actions.
- Both channels point to the same persisted incident. Acting through either
  channel resolves the shared state and cannot pay or resume twice.
- The report shows USD session cost from OpenCode assistant-message metadata
  and a timestamped estimated sats conversion. PPQ remains authoritative for
  account balance and invoice amounts.
- The report must not claim to know the exact amount needed to finish a task.
- The primary approval action is `Top up and resume`. Alternatives are
  `Top up only` and `Cancel`.
- After verified credit, AppWeaver continues the same OpenCode session with a
  generated continuation message. It does not create a replacement session.
- The task is described as "paused for insufficient PPQ balance" even though
  the failed model turn has ended. Existing messages, completed tool calls,
  file changes, and session history remain.

### Money presentation

- Sats are the primary user-facing unit for thresholds, top-up choices, and
  Lightning payments.
- PPQ's authoritative USD credit/cost is shown alongside sats.
- Conversion estimates include a rate timestamp and are not used as exact
  accounting values.
- PPQ Lightning bonuses, when returned or confirmed by PPQ, are displayed
  separately from principal and conversion.

### Models and picker

- The first release exposes PPQ chat models, including `private/*` TEE models.
- Image, video, speech, data enrichment, and embedding APIs are outside the
  initial OpenCode model catalog.
- Catalog order preserves the PPQ API order.
- The selected PPQ model is stored in the workspace PPQ database.
- If no valid selected model exists, the first eligible model in PPQ API order
  becomes selected.
- Favorites are workspace-local and independent of selection.
- Recent models are a deduplicated MRU list. The default limit is five and is
  configurable in Settings.
- The composer model picker uses `treeItem` with collapsed top-level nodes:
  `Last used`, `Favourites`, and `All`.
- `Last used` and `Favourites` contain direct model entries.
- `All` groups models by PPQ `owned_by`, then model.
- The standard toolbar filter searches collapsed descendants.
- The catalog retains pricing, context, privacy, modality, architecture, and
  supported-parameter metadata. Exact detail presentation is deferred until
  first-phase UX testing.

### Catalog refresh

- Catalog handling uses preflight plus cache-or-refresh.
- A validated persisted cache is rendered immediately.
- Missing or stale cache triggers refresh from `GET /v1/models`.
- Refresh atomically replaces the cache only after schema validation.
- If refresh fails and a cache exists, AppWeaver may use it with a visible stale
  timestamp.
- If no validated cache exists, PPQ activation is blocked.
- Catalog refresh is triggered by activation, manual refresh, and task
  preflight when the cache TTL has expired. Continuous polling is unnecessary.

### Private-mode proxy

- All PPQ model traffic is routed through a locally managed copy of
  `PayPerQ/ppq-private-mode-proxy`.
- For `private/*`, the proxy verifies and encrypts to the Tinfoil enclave where
  the model runs.
- For ordinary models, the proxy verifies and encrypts to PPQ's Nitro enclave.
  PPQ infrastructure sees ciphertext, while the upstream model provider still
  sees plaintext.
- Proxy source is vendored into the PPQ plugin at a recorded upstream commit.
  It is not a nested Git repository and does not auto-update at runtime.
- The vendored MIT license and copyright notice are retained.
- Proxy updates are reviewed and shipped as PPQ plugin releases.
- The plugin owns proxy start, health/attestation checks, logs, restart, and
  shutdown.
- Selected PPQ workspaces start proxy restoration in the plugin's background
  initialization; bot startup does not wait. PPQ runs await that same startup,
  while inactive workspaces do not build or start the proxy.
- The proxy binds to loopback only, uses a collision-safe managed port, and
  receives the decrypted runtime key through its process environment.
- Failed attestation or proxy health blocks PPQ inference. There is no silent
  direct-network privacy downgrade.

### Capability strategy

- Add a narrow provider-neutral model-source capability in core.
- Core and PPQ both implement the same model-source contract. Routstr can later
  implement it when migrated to a plugin.
- The contract covers activation state, health, catalog, selection, favorites,
  recent models, preflight, safe OpenCode runtime contribution, and optional
  settings/status actions.
- PPQ credentials, balances, top-ups, account management, funding incidents,
  and resume behavior are not forced into the first model-source contract.
- A separate paid-inference/accounting capability is deferred until PPQ and a
  pluginized Routstr provide two concrete implementations to generalize.
- Wallet authorization and NWC execution remain core-enforced services, not
  plugin capability operations.

### Explicitly deferred

- Comparing PPQ query-history charges against token-price estimates.
- Routstr migration itself.
- A broad generic paid-inference capability.
- Unattended NWC auto-top-up.
- Direct L402 payment for PPQ chat.
- Non-chat PPQ products.
- Exact model-detail UX beyond the initial tree picker.
- A generic runtime enable/disable lifecycle for every AppWeaver plugin.

## Current-System Gaps This Work Must Address

1. Plugins are statically registered and have no unload lifecycle. PPQ therefore
   needs an internal workspace active mode, as decided.
2. Parent `opencode.json` currently symlinks to the AppWeaver repository config,
   which conflicts with independent workspace state.
3. The AppWeaver root `opencode.json` is tracked, so adding it to `.gitignore`
   alone cannot prevent diffs.
4. OpenCode config is loaded at startup. Cache invalidation alone cannot apply a
   provider/model change.
5. There is no central drain/restart coordinator covering WebSocket, Nostr,
   plugin, HTTP, and background OpenCode runs.
6. The composer provider list is hard-coded to `local` and `routstr`, and model
   selection is tied to core commands rather than a model-source contract.
7. Plugin APIs can request a run-scoped model but cannot safely contribute a
   persistent active model source or managed OpenCode configuration.
8. Existing interactive payments are request-scoped and WebSocket-oriented.
   DM/push-approved payments need persisted intents and a core-authorized NWC
   execution path.
9. Payment attempts and settlement reconciliation are in memory. Restart-safe
   top-up and resume require persisted state and idempotency.
10. Existing NWC URIs are stored plaintext in core state.
11. Routstr's current balance is not an enforced run budget, its money units are
    inconsistent in places, and its recovery paths are not safe templates for
    PPQ.
12. OpenCode already exposes assistant-message cost and detailed token metadata,
    but AppWeaver's run result currently discards reasoning/cache token details.
    PPQ phase one only needs session cost, not new charge reconciliation.

## Proposed Architecture

```text
Composer / core agent flow
          |
          v
  active model-source resolver
     |                 |
     | normal          | PPQ active
     v                 v
 core OpenCode     ppq plugin capability
 model source       | catalog / selection / preflight
                    | accounts / incidents / settings
                    v
             workspace PPQ database
                    |
                    v
          managed loopback PPQ proxy
                    |
          +---------+----------+
          |                    |
    Tinfoil path          Nitro path
    private/*             ordinary models

PPQ top-up approval
          |
          v
 persisted PPQ payment intent
          |
          v
 core payment authorization service
          |
          v
 selected encrypted core NWC connection
          |
          v
 PPQ invoice status / balance reconciliation
          |
          v
 resume same OpenCode session
```

### Core responsibilities

- Own workspace resolution and managed OpenCode config materialization.
- Own run admission, active-run tracking, draining, and OpenCode-only restart.
- Define and host-invoke the model-source capability.
- Resolve the active model source for composer state and every agent run.
- Keep NWC secrets encrypted and inaccessible to plugin code.
- Authenticate payment approval and execute NWC payments.
- Keep one-off Web payment approval request-scoped; persist 402 incident and
  resume state separately if that feature is implemented.
- Deliver push/DM notifications through existing trusted services.
- Preserve OpenCode session IDs and expose safe resume operations.

### PPQ plugin responsibilities

- Own PPQ account, key, settings, catalog, favorites, recent-model, and future
  incident state; one-off top-ups do not persist invoices or attempts.
- Implement the model-source capability.
- Validate all PPQ API responses with Zod before persistence or use.
- Manage the vendored private-mode proxy.
- Generate safe PPQ runtime provider metadata without exposing secrets.
- Run task preflight and classify insufficient-balance failures.
- Build deterministic 402 reports without requiring another paid model call.
- Request top-up invoices, ask core to authorize/pay them, reconcile credit,
  and request idempotent session resume.
- Render PPQ commands, forms, account/key management, Settings, model picker
  data, and incident actions.

## Model-Source Capability v1

Recommended contract name: `ai-model-source`, version `1`.

The exact schemas should follow the existing capability conventions in
`src/capabilities/types.ts`. Proposed operations are:

```text
capability:v1:ai-model-source.get-state
capability:v1:ai-model-source.list-models
capability:v1:ai-model-source.select-model
capability:v1:ai-model-source.set-favorite
capability:v1:ai-model-source.record-use
capability:v1:ai-model-source.preflight
capability:v1:ai-model-source.get-runtime-config
capability:v1:ai-model-source.get-context-usage
```

Recommended state fields:

```text
sourceId
title
active
transitionState
health
selectedModelId
catalogFetchedAt
catalogStale
settingsAction
statusAction
```

Recommended model fields:

```text
id
providerModelId
name
ownedBy
type
popular
privacyLevel
contextLength
inputModalities
outputModalities
supportedParameters
pricing
favorite
lastUsedAt
availability
unavailableReason
```

`get-runtime-config` must return only a schema-validated, secret-free config
contribution. Runtime secrets are injected by trusted process management, not
returned through the capability registry.

`get-context-usage` takes the active workspace and OpenCode session ID and
returns nullable session token usage with a nullable model context limit and
percentage. Each source owns the limit for its active model: Core uses OpenCode
provider metadata, while PPQ uses its validated model catalog. PPQ streaming
responses can leave OpenCode's reported token counts at zero despite a completed
turn; in that case show an explicitly labeled estimate from available session
text, rather than silently hiding context or presenting the estimate as exact.
No usage data is reported before the session has assistant messages.

Because core itself consumes this capability, the registry needs a host caller
path in addition to the current plugin-scoped caller path. Host calls must still
perform provider selection and input/output validation. PPQ activation makes it
the explicit active provider; multiple registered providers must not rely on
the existing single-provider auto-selection behavior.

## Managed OpenCode Config Design

### Files

For either active workspace root `<workspace>`:

```text
<workspace>/.appweaver/opencode.json       canonical normal config
<workspace>/opencode.json                  generated active runtime config
<workspace>/.appweaver/ppq/db.sqlite       PPQ workspace state
```

Recommended tracked bootstrap template:

```text
templates/opencode/opencode.json
```

The exact template path may follow existing repository conventions, but it
must not be confused with generated output.

### Normal mode

Materialize the canonical `.appweaver/opencode.json` as the root runtime
configuration after schema validation and normalization.

### PPQ mode

Generate a PPQ runtime variant without modifying the canonical normal config:

- add the PPQ OpenAI-compatible provider pointing to the managed loopback proxy;
- add the validated PPQ chat model map;
- set `enabled_providers` to the generated PPQ provider ID;
- set `model` and, if desired by existing core behavior, `small_model` to valid
  PPQ model references;
- preserve unrelated canonical settings such as permissions, tools, agents,
  MCP servers, instructions, and compaction;
- never place the PPQ key or `credit_id` in JSON;
- write atomically through a temporary file plus rename;
- validate the generated document against OpenCode's current schema before
  replacing runtime output.

### Migration

1. Resolve both AppWeaver and parent workspace roots.
2. Detect regular files versus the current parent symlink.
3. Import each workspace's effective existing config into its canonical
   `.appweaver/opencode.json` without overwriting an existing canonical file.
4. Preserve the repository default as a tracked template.
5. Remove the parent-shared-config behavior from setup and workspace assets.
6. Add generated root config and workspace PPQ runtime data to the appropriate
   `.gitignore` files.
7. Stop tracking the repository root runtime output as part of the migration.
8. Materialize and validate normal mode before allowing PPQ activation.

Migration must be idempotent and must not replace malformed user config with
`{}`. Parse failure is a blocking error with a path and recovery instructions.

## OpenCode Drain and Restart Controller

Introduce one core controller around all OpenCode backend entry points.

Recommended states:

```text
running -> drain_requested -> draining -> restarting -> running
                                      \-> failed
```

Required behavior:

- Increment/decrement active runs in `try/finally` around every OpenCode run,
  independent of transport.
- Reject or queue new run admission once draining starts. The initial
  recommendation is to queue user work with a visible "waiting for OpenCode
  configuration restart" state rather than fail it.
- Wait indefinitely for the active count to reach zero.
- Query OpenCode session statuses as a second guard against untracked busy
  sessions.
- Materialize pending config only after drain.
- Dispose the managed server and start a new one.
- Invalidate config, model, and agent caches.
- Health-check the new server and active provider before releasing queued work.
- If restart fails, retain the pending transition and expose retry/rollback
  controls. Do not silently claim the new source is active.
- Coalesce repeated changes so one drain/restart applies the latest valid
  pending configuration.

## PPQ Workspace Data Model

Use a versioned SQLite schema under the active workspace. Suggested tables:

### `ppq_accounts`

```text
id                         local UUID primary key
label                      unique workspace label
credit_id_ciphertext       versioned NIP-44 envelope
selected_runtime_key_id    nullable local key reference
created_at
updated_at
last_balance_usd           nullable decimal string
last_balance_checked_at    nullable timestamp
```

### `ppq_api_keys`

```text
id                         local UUID primary key
account_id                 foreign key
remote_id                  nullable PPQ key object ID
name
api_key_ciphertext         versioned NIP-44 envelope
usage_limit_usd            nullable decimal string
current_period_usage_usd   nullable decimal string
total_usage_all_time_usd   nullable decimal string
reset_period               nullable daily/weekly/monthly
reset_at                   nullable timestamp
expire_at                  nullable timestamp
revoked_at                 nullable timestamp
created_at
updated_at
```

### `ppq_account_settings`

```text
account_id                 primary/foreign key
nwc_connection_id          nullable core NWC UUID
topup_presets_sats_json
low_balance_threshold_sats nullable; disabled when null
```

### `ppq_workspace_settings`

```text
singleton_id
active
selected_account_id        nullable
selected_model_id          nullable
recent_model_limit         default 5
notify_push                default true
notify_dm                  default true
catalog_ttl_seconds
```

### `ppq_models`

Store normalized validated fields plus optionally bounded raw JSON for forward
compatibility. Include API order and cache generation so stale rows can be
atomically replaced.

### `ppq_favorites` and `ppq_recent_models`

Favorites are a set keyed by model ID. Recent models retain selection/use time
and are pruned to the configured MRU limit.

### `ppq_funding_incidents`

Persist workspace, account, OpenCode session ID, model, state, triggering error,
known session cost, safe report data, notification delivery IDs, and resume
state. Do not retain top-up invoices as incident data.

Do not store raw prompts merely to build a report. Read session history when
authorized and persist only the minimal report snapshot needed for restart-safe
delivery and action handling.

## On-Demand Top-Up Flow

The authenticated Web widget requests a fresh Lightning invoice for the chosen
satoshi amount. Core's interactive payment broker validates its amount, hash,
network, and expiry, then presents the invoice for explicit user approval. The
broker verifies NWC preimages and checks PPQ settlement before claiming success.
The invoice and payment result exist only during this request; closing the modal
or restarting AppWeaver does not leave a local PPQ payment attempt to recover.
If payment status is ambiguous, direct the user to PPQ account activity before
another manual payment. Never create *and pay* a replacement automatically.

The future 402 incident flow persists incident and resume state separately; it
must not introduce a PPQ invoice-history table as part of ordinary top-ups.

## 402 Incident and Resume Flow

1. A PPQ-backed OpenCode turn returns an error classified as insufficient
   balance.
2. Core/plugin captures the session ID, model, workspace, selected account, and
   safe error metadata.
3. The PPQ app reads existing OpenCode session messages and computes known
   session cost from assistant-message metadata.
4. It builds a deterministic report from the original task label/excerpt,
   completed steps/tool results, partial assistant output, file-change summary,
   last activity, and error. Report generation must not call PPQ.
5. A persisted incident is created before notifications are sent.
6. Minimal push and detailed encrypted DM are sent according to settings.
7. The user selects a preset/custom sat amount.
8. PPQ creates a Lightning top-up invoice for that exact requested amount.
9. The user reviews the parsed invoice and approves `Top up and resume`, `Top up
only`, or cancels.
10. Core pays through the account's assigned NWC connection.
11. PPQ credit is reconciled.
12. For `Top up and resume`, AppWeaver reuses the same session ID and sends a
    visible generated continuation instruction that funding was restored and
    the interrupted task should continue from current state.

The continuation instruction must tell the model to inspect existing state and
avoid repeating completed side effects. This reduces duplicate work but cannot
guarantee idempotency for arbitrary external tools; the report and UI should
state that limitation.

## Commands and Widget

Recommended command surface:

```text
/ppq                         open PPQ overview widget
/ppq enable
/ppq disable
/ppq status
/ppq models
/ppq accounts
/ppq keys
/ppq topup
/ppq incidents
/ppq settings
/ppq proxy
```

Generated command definitions should provide forms for create/import account,
key creation/editing, account selection, NWC assignment, top-up amount, and
settings. The primary Web experience is one PPQ widget with sections:

- Overview: active/pending mode, selected account/key/model, balance, proxy
  attestation health, and last preflight.
- Accounts: create, import, select, rename locally, disconnect locally.
- Keys: list, create, edit limits/expiry/reset, select runtime key, revoke.
- Models: tree picker, favorites, recent limit, cache age, refresh.
- Funding: NWC assignment, presets, optional low-balance threshold, and an
  on-demand Lightning payment modal; no local invoice history.
- Incidents: open/resolved 402 reports and retry/resume actions.
- Notifications: push and DM toggles.
- Proxy: vendored version/upstream commit, process health, attestation paths,
  safe logs, restart.

The PPQ widget must warn rather than render unusable actions when account,
runtime key, NWC assignment, catalog, proxy, or balance prerequisites are
missing.

## Security Requirements

- Bind the PPQ proxy to `127.0.0.1` only.
- Prefer moving the managed OpenCode server from `0.0.0.0` to loopback as a
  related core hardening change unless external access is an intentional,
  authenticated deployment requirement.
- Never put API keys, `credit_id`, NWC URIs, Cashu tokens, invoices, or
  preimages in URLs.
- Do not include secrets in environment dumps or child-process command lines.
- Pass the PPQ key in the child environment and redact proxy startup failures.
- Validate PPQ base URLs as fixed HTTPS endpoints; do not permit arbitrary
  account-supplied hosts in phase one.
- Limit response body sizes and timeouts for catalog, account, key, balance,
  top-up, and status APIs.
- Parse all remote data with strict schemas and preserve unknown fields only in
  bounded raw metadata.
- Treat PPQ prices as decimal values, not binary floating-point accounting
  values. Convert to numbers only at OpenCode's schema boundary where required.
- Use core `Satoshi`/`Millisatoshi` value objects for Lightning amounts.
- Verify all notification actions against the master identity and persisted
  incident state.
- Ensure one active payment submission per attempt and one resume per incident.
- Keep detailed prompt/task information out of push payloads.
- Retain an audit trail of state and safe error codes without prompt content or
  credentials.
- Add a versioned ciphertext envelope so future key rotation/migration is
  distinguishable from plaintext legacy data.

## Recommended API Validation Work

Before implementing live flows, capture redacted fixtures or confirm exact
schemas for:

- `POST /accounts/create`
- `POST /credits/balance`
- `GET /keys`, `POST /keys`, `GET/PATCH/DELETE /keys/{id}`
- `GET /v1/models`
- `GET /topup/payment-methods`
- `POST /topup/create/btc-lightning`
- `GET /topup/status/{invoice_id}`
- insufficient-balance errors from streaming and non-streaming chat
- private proxy health, model, and attestation endpoints

Questions that implementation must answer from real responses rather than
guessing:

- Exact account creation response fields; verify positive-balance responses and
  key/account association with a disposable funded account. An unfunded
  response of `{ "balance": 0 }` and invalid-key rejection were observed.
- Whether account creation's returned key has a remote key object ID discoverable
  through `GET /keys`.
- Whether chat 402 errors include a stable machine code and status through the
  private proxy.
- Whether top-up create/status provide payment hash, credited USD, bonus, and
  settled timestamps.
- Whether PPQ supports idempotency headers for account, key, or top-up creation.
- Whether a request ID can correlate OpenCode messages with PPQ history. This is
  informational because charge reconciliation is deferred.
- The proxy's stable readiness and per-attestation-path health contract.
- Node versus Bun runtime compatibility for the vendored proxy and its native
  or cryptographic dependencies.

## Implementation Phases

Checked items are implemented in this worktree. They do not imply that live
inference, paid flows, or the manual end-to-end matrix have been verified.
Remaining portions of mixed items are listed separately below.

Current implementation: core secret storage, managed OpenCode configuration,
runtime transitions, model-source picker, local PPQ credentials/catalog,
automatic vendored-proxy build, activation, and key-authenticated balance
preflight. Composer session context usage is supplied by the active model
source, with PPQ's limit from its validated catalog. Selected PPQ workspaces
restore the proxy and model source in the background after bot startup;
PPQ runs wait for readiness. Still outstanding: remote account/key management,
live PPQ top-up response verification and cross-transport funding approval,
402 incident reporting and resume, live standard/private inference validation,
and release hardening. A web-initiated Lightning top-up uses the core
interactive payment broker without persisting invoice attempts.

### Phase 0: Contract and runtime spikes

- [x] Record the vendored proxy upstream commit, version, and license in
      `plugins/ppq/vendor/UPSTREAM.md`.
- [ ] Pin/document a dated PPQ API contract snapshot (the live docs do not
      publish a pinned API version).
- [ ] Capture sanitized response/error fixtures for the remaining account,
      key, invoice, 402, and private-proxy endpoints. The public model catalog
      and `{ "balance": 0 }` response were inspected, but a complete fixture set
      has not been captured.
- [ ] Verify standard and `private/*` streaming tool-call traffic through the
      proxy using a disposable funded test account.
- [ ] Verify insufficient-balance error propagation through proxy and OpenCode
      SDK events.
- [ ] Verify PPQ streamed token-usage propagation through the proxy and OpenCode;
      current PPQ assistant messages record zero tokens despite completed turns.
- [x] Define and check the Node.js 20+ runtime prerequisite for the vendored
      proxy; Bun compatibility is not assumed.
- [x] Identify the proxy health/attestation endpoint and startup readiness
      signal.
- [x] Confirm the selected `ppq/private/gpt-oss-120b` is generated in OpenCode
      with a loopback proxy URL, appears in its `/v1/models`, and that `/health`
      reports both attestations and the runtime key configured. The pinned
      private-model route selects Tinfoil. This is not a paid inference check.
- [ ] Confirm OpenCode custom-provider config for model IDs containing `/`,
      streaming, tools, images/files, reasoning, and pricing.

Exit criteria:

- No implementation depends on guessed remote response shapes.
- The proxy/runtime strategy and 402 classification are proven.

### Phase 1: Secret-storage hardening

- [x] Add a versioned NIP-44 v2 encrypted-secret envelope in core.
- [x] Migrate existing core NWC URIs transactionally from plaintext.
- [x] Remove plaintext encryption/decryption fallbacks from new and migrated
      paths.
- [x] Add redacted diagnostics and explicit unrecoverable-secret errors.
- [ ] Expose safe NWC summaries and IDs through the plugin API for PPQ top-up
      assignment (core already has redacted NWC summaries).
- [ ] Test plaintext migration, restart, wrong-key failure, malformed
      ciphertext, and redaction end to end (unit coverage exists but has not
      been run for this work).

Exit criteria:

- Existing valid NWC connections continue to work after migration.
- No newly persisted NWC or PPQ secret is plaintext.

### Phase 2: Managed OpenCode configuration

- [x] Add canonical `.appweaver/opencode.json` resolution for both workspaces.
- [x] Move the tracked repository default to a bootstrap template.
- [x] Replace parent symlink creation with independent config initialization.
- [x] Add safe idempotent migration of existing effective configs.
- [x] Ignore generated root runtime configs and PPQ runtime data.
- [x] Route existing OpenCode config readers/writers through the canonical
      source/materializer boundary.
- [x] Validate config before atomic materialization.
- [x] Prevent parse failures from collapsing config to `{}`.
- [x] Add normal and PPQ runtime-variant generation hooks.

Exit criteria:

- Parent and AppWeaver can hold different configs.
- Existing root/agent/model operations survive migration.
- Repeated materialization is deterministic and creates no Git diff.

### Phase 3: OpenCode drain/restart controller

- [x] Track OpenCode runs through the shared runtime controller across entry
      points.
- [x] Add admission pause and visible queued-run state.
- [x] Add pending config transition state and system-log events.
- [x] Drain indefinitely and confirm OpenCode session status.
- [x] Restart only the managed OpenCode process.
- [x] Rebuild SDK client state and invalidate its resolved-model cache.
- [x] Coalesce multiple pending transitions.
- [x] Add status, cancel, retry, and manual force-restart recovery operations.
- [ ] Test runs from WebSocket, Nostr, plugin agent service, and HTTP inference.

Exit criteria:

- A config transition cannot start a new run on old config after drain begins.
- OpenCode restarts without restarting AppWeaver or losing resumable sessions.

### Phase 4: Model-source capability and composer integration

- [x] Add `src/capabilities/ai-model-source.v1.ts` with strict schemas.
- [x] Add validated core-host invocation to the capability registry.
- [x] Implement the normal/core OpenCode model source.
- [x] Replace hard-coded composer provider/model behavior with the active model
      source.
- [x] Add `treeItem` model picker with collapsed Last used, Favourites, and All
      nodes and toolbar filtering.
- [x] Implement active-source state in WebSocket composer updates.
- [x] Ensure model selection updates the source first, then transitions runtime
      config when the source's structural runtime contribution changes. Model
      changes within the active source use the run-scoped model override without
      a config transition.
- [x] Reuse the active source snapshot and a short-lived in-memory Core catalog
      lookup across composer state, selection validation, and run preparation.
- [x] Coalesce concurrent composer-state refresh requests into one follow-up
      request instead of issuing overlapping capability and OpenCode calls.
- [x] Show model selection as pending immediately and prevent duplicate picker
      actions until the command settles.
- [x] Route composer session context usage through the active model-source
      capability so Core and PPQ supply their own context limits.
- [x] Estimate PPQ session text tokens when OpenCode reports zero usage and mark
      the context indicator as approximate; retain exact usage when reported.
- [x] Refresh composer context after session changes and show 0% for a newly
      created session until its first assistant turn reports usage.
- [x] Refresh composer state while a background source activation is pending,
      stopping when it becomes stable or fails.

Exit criteria:

- Core model selection behaves as before through the new contract.
- A test provider can replace the picker/catalog without importing core UI.

### Phase 5: PPQ plugin foundation

- [x] Scaffold `plugins/ppq` with package metadata, generated command
      definitions, capability declaration, and workspace-local DB migrations.
- [x] Implement encrypted account and key repositories.
- [x] Implement local import/select account flows.
- [x] Create PPQ accounts through the documented remote API, validate returned
      credentials, encrypt them locally, and expose creation in the Accounts UI.
- [ ] Verify the account-creation success/error response against a disposable
      account and confirm the created key's account association.
- [x] Implement local key import and runtime key selection.
- [ ] Implement remote key creation, listing, updates, limits, and revocation.
- [x] Validate the selected runtime key and positive balance at each task
      preflight; reject zero, invalid, and unavailable balances.
- [x] Show a live verified USD balance in PPQ Overview and Funding (including a
      manual refresh), with unavailable distinct from zero and no local cache.
- [x] Implement catalog fetch, strict normalization, atomic cache generations,
      stale fallback, PPQ API ordering, favorites, and MRU limit.
- [x] Implement Settings and Accounts/Keys/Models widget sections (local
      settings and import/select controls).
- [x] Implement PPQ model-source capability operations while inactive.

Exit criteria:

- Multiple accounts and keys survive restart securely.
- Catalog and model picker work without changing OpenCode provider state.

### Phase 6: Vendored proxy and PPQ activation

- [x] Vendor the reviewed private proxy source and MIT notice with upstream
      commit metadata.
- [x] Add a documented manual upstream-sync procedure.
- [x] Automatically build the proxy when PPQ is selected or activated if
      artifacts are missing or vendored sources, lockfile, or Node version change.
- [ ] Verify release packaging and the proxy build in a clean installation.
- [x] Add loopback port allocation, process supervision, redacted logs, health,
      and attestation checks.
- [x] Inject only the selected decrypted PPQ runtime key into the proxy process.
- [x] Generate one OpenCode PPQ provider pointed at the local proxy and map the
      validated chat catalog to OpenCode model schema.
- [x] Keep private-model selection aligned with the pinned proxy's supported
      Tinfoil model map; mark newly listed unsupported `private/*` IDs unavailable.
- [x] Implement PPQ enable/disable and selected-model transitions through the
      drain/restart controller.
- [x] Let PPQ select accounts/keys without switching model sources: core drains
      runs, the plugin rotates the attested proxy credential, then core resumes
      queued runs without a temporary Core-model fallback.
- [ ] Verify active account/key rotations against concurrent live runs and
      restoration failures with a disposable PPQ account.
- [x] Block runs on missing account/key/model, unhealthy proxy, failed
      attestation, or known zero balance.
- [x] Start selected PPQ proxy restoration from plugin initialization without
      blocking bot startup; defer source restoration and make PPQ runs await the
      in-progress proxy start. Avoid work for inactive PPQ workspaces.

Exit criteria:

- PPQ becomes exclusive only after successful proxy and OpenCode health checks.
- Disabling restores normal config exactly and preserves PPQ state.
- No failure silently bypasses the proxy.

### Phase 7: On-demand Lightning top-ups

- [x] Wire a web-initiated PPQ Lightning invoice through the core interactive
      payment broker with selected-account isolation and safe reconciliation.
- [x] Remove PPQ top-up attempt persistence, history, and local status commands;
      request a new invoice only for a new, user-initiated payment.
- [ ] Add account-scoped NWC assignment using safe core connection summaries.
- [x] Reuse the Roadmap `choiceField` amount pattern with 100/1k/5k sats and
      a custom amount.
- [ ] Verify PPQ Lightning invoice creation and status schemas against a funded
      disposable account; unrecognized responses currently fail closed.
- [x] Validate BOLT-11 invoice network, expiry, and exact `Satoshi` amount.
- [x] Require authenticated Web payment-modal approval via `src/payments`.
- [ ] Add DM and push approval paths for persisted funding incidents.
- [x] Offer encrypted core NWC connections through the payment broker, with
      its preimage verification and timeout lookup.
- [ ] Verify PPQ credit/status reporting after success or response loss; direct
      ambiguous results to PPQ account activity without automatic repayment.

Exit criteria:

- Repeated clicks and process restarts never automatically pay an invoice.
- A closed modal does not block a new user-initiated invoice. Ambiguous payments
  are not claimed as settled; PPQ is authoritative after a restart.

### Phase 8: 402 reporting and session resume

- [ ] Preserve HTTP status/provider error details needed to classify PPQ 402s.
- [ ] Persist one funding incident per interrupted PPQ turn.
- [ ] Build deterministic reports from OpenCode session state without a model
      call.
- [ ] Sum OpenCode session cost and provide timestamped sats estimates.
- [ ] Deliver minimal push and detailed encrypted DM with shared action IDs.
- [ ] Implement `Top up and resume`, `Top up only`, and `Cancel`.
- [ ] Resume the same OpenCode session at most once after verified credit.
- [ ] Add notification delivery/update/deduplication handling.
- [ ] Add optional task-boundary low-balance notifications, disabled by default.

Exit criteria:

- A real or simulated mid-task 402 produces one report, one approved payment,
  and one same-session resume across restarts and duplicate clicks.

### Phase 9: Hardening and release

- [ ] Run schema fuzz/boundary tests for models, balances, keys, invoices, and
      errors.
- [ ] Test secret redaction in logs, UI, notifications, and thrown errors.
- [ ] Test malformed canonical and generated OpenCode configs.
- [ ] Test proxy crash, attestation failure, port collision, and key rotation.
- [ ] Test account/key deletion and stale notification actions.
- [ ] Test parent/AppWeaver workspace isolation.
- [ ] Test mobile and desktop Settings/model/payment/incident UI.
- [ ] Document PPQ privacy paths accurately, including what metadata PPQ sees
      and that ordinary upstream providers see plaintext.
- [ ] Document account recovery limitations tied to the AppWeaver identity key.
- [ ] Publish the PPQ plugin only after a small-value real Lightning end-to-end
      verification.

## Test Matrix

### Unit

- PPQ response schemas and model normalization.
- Decimal USD and exact sat amount handling.
- Ciphertext envelope, NWC migration, and redaction.
- Managed config migration, merge, validation, and atomic write.
- Active model-source resolution and capability validation.
- Catalog ordering, favorites, MRU pruning, and stale cache behavior.
- One-off invoice validation and incident state transition guards.
- Invoice amount/hash/expiry validation.
- 402 classification and deterministic report generation.

### Integration with mocks

- PPQ account/key lifecycle with redacted fixture server.
- Catalog refresh failure with and without cache.
- Proxy readiness and attestation failure.
- OpenCode drain while runs originate from different transports.
- NWC success, reject, timeout, response loss, lookup recovery, and bad preimage.
- Lightning paid followed by delayed PPQ credit.
- Duplicate Web/DM/push approval actions.
- Restart with an open payment modal leaves no locally persisted PPQ invoice;
  restart during every persisted incident state.
- Same-session resume success and failure.

### Manual end to end

- Create and import accounts.
- Switch accounts and runtime keys.
- Enable/disable PPQ in each workspace independently.
- Run standard and `private/*` tool-using models through the proxy.
- Verify model picker groups, filtering, favorites, and recent limit on desktop
  and mobile.
- Fund with the minimum supported Lightning amount.
- Exhaust a small test balance, receive push/DM reports, approve top-up, and
  resume the same session.
- Confirm generated runtime files produce no unintended Git diff.

## Recommended Remaining Details

These are implementation recommendations, not additional settled product
requirements:

1. Use a vendored source snapshot plus an `UPSTREAM.md` file containing the
   repository URL, commit, version, license, local patches, and update steps.
   Avoid both a nested clone and Git subtree unless repeated manual syncing
   becomes burdensome.
2. Keep the default top-up presets at `100`, `1k`, and `5k` sats initially and
   revise after real usage.
3. Queue new runs during a short OpenCode drain rather than rejecting them, but
   expose the waiting state clearly.
4. Use one generated continuation message after top-up and keep it visible in
   session history for auditability.
5. Store USD values as validated decimal strings in PPQ state. OpenCode config
   may require numeric prices, but that conversion should happen only when
   generating the model map.
6. Keep detailed funding reports available in the authenticated widget and use
   notification payloads only as projections of persisted incident state.
7. Bind the managed OpenCode server to loopback while introducing the proxy,
   unless a separately documented external server mode requires otherwise.
8. Add retention settings for resolved incidents after observing database
   growth. Do not add top-up invoice records or raw prompt retention.
9. Treat private-proxy runtime compatibility as a phase-0 gate. Vendoring source
   does not remove its Node 20+ and dependency requirements.

## Known Risks

- PPQ API docs show examples but not full formal schemas or idempotency
  guarantees for every account/top-up response.
- `credit_id` functions as a privileged account credential despite its name.
- A Lightning payment can succeed while PPQ credit confirmation is delayed or
  lost; with no local top-up record, the user must verify ambiguous outcomes at
  PPQ before choosing to pay another invoice.
- "Top up and resume" cannot guarantee arbitrary external tool idempotency.
- Waiting indefinitely for drain can leave a transition pending forever if a
  run is stuck; manual recovery controls are therefore necessary.
- Model metadata may not map perfectly to OpenCode's schema, especially output
  limits, file modalities, reasoning variants, and provider-specific pricing.
- The private proxy's ordinary-model path hides content from PPQ but not from
  the upstream provider. UI wording must not overstate privacy.
- Vendored cryptographic/attestation code creates an update and security-review
  responsibility for each PPQ plugin release.
- Encrypting secrets to the AppWeaver identity means identity-key loss or
  replacement can make stored account and NWC credentials unrecoverable.
- Current capability auto-selection assumes one provider. Active model-source
  resolution must be explicit when core, PPQ, and future Routstr providers are
  all registered.

## Definition of Done

- PPQ can be created/imported, funded, enabled, used, disabled, and re-enabled
  independently in both workspaces.
- Only PPQ models are available while PPQ mode is active.
- Every PPQ inference request uses the healthy, attested local proxy.
- Normal OpenCode config is restored without loss after disabling PPQ.
- Account, key, and NWC secrets are encrypted at rest and absent from logs/UI.
- The composer model tree uses the active model-source capability and supports
  Last used, Favourites, All/provider grouping, filtering, and selection.
- OpenCode provider transitions drain and restart OpenCode without restarting
  AppWeaver.
- User-approved NWC top-ups have exact invoices and verified settlement;
  AppWeaver never automatically repays or persists one-off invoice attempts.
- A 402 produces safe push/DM reporting and can top up and resume the same
  session exactly once.
- Unit, mocked integration, and small-value real-funds verification pass.
- Deferred work remains absent rather than partially or unsafely implemented.
