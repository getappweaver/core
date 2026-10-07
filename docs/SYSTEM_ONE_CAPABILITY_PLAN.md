# System One capability plan

Capability contract: `system-one:v1`, exposed as `system-one.v1` to consumers.
Provider plugin: `plugins/systemone` (current System One decision model `jev-latest`).
First consumer: NR's event classifier. Browser may adopt the same contract in a later phase; browser actions remain owned by Browser.

- [x] Define a shared typed System One decision contract: task state, typed choice/score questions, validated answers.
- [x] Implement the System One provider, configurable API base/key/model, bounded retry policy, and strict output validation.
- [x] Add local provider settings management that never displays the full API key.
- [x] Declare `system-one:v1` in the provider manifest and expose the capability provider.
- [x] Migrate NR classification requests to `capabilities.invoke`; retain NR's question construction and classification interpretation.
- [x] Remove NR-owned Jev endpoint/key settings from the active command/UI and update its declared capability use. Legacy local DB fields remain inert for compatibility.
- [x] Refresh generated systemone/NR bottom-up knowledge for changed root/settings directories. Summaries retain incomplete coverage for other pre-existing unindexed child directories.
- [x] Run targeted ESLint, NR/Systemone TypeScript checks, whitespace checks, and one-off provider/NR capability checks.
- [ ] User verification with a configured provider key and NR classifier mode.

## Settings-only review revision

- [x] Remove template CRUD/AI/help command surfaces and obsolete scaffold code; retain only settings and the capability provider.
- [x] Render an editable settings form with a blank password field, API base, default model, Save, and explicit key removal.
- [x] Reuse shared NIP-44 secret envelopes derived from the bot Nostr identity; migrate existing plaintext System One keys and decrypt only for inference.
- [x] Fix oversized-request timeout cleanup and honor the provider's configured model in NR.
- [x] Verify form parsing, encrypted persistence/migration, and provider behavior; update documentation and generated registration. Targeted lint/type checks and an in-memory settings/provider check passed; no test suite or authenticated browser run was performed.

Review: NR's previous Jev key was plaintext in nr_settings. PPQ already uses src/security/encrypted-secret.ts; System One follows that established encryption pattern. NR legacy keys are unused by this provider.

## Shared inference bridge

Core owns one client-facing Bearer key, HTTP authentication, endpoint discovery, and bounded body reading. Core inference and installed apps explicitly register `inference-endpoint:v1` providers. System One's HTTP adapter invokes its existing `system-one:v1` decision contract; upstream credentials remain encrypted and separate from the bridge key. Internal capabilities are not automatically exposed over HTTP.

- [x] Define the shared endpoint discovery/handling contract with explicit methods, paths, descriptions, and request-size limits.
- [x] Register existing core model/chat endpoints through that contract, preserving the existing streaming implementation. Live streaming verification remains below.
- [x] Dispatch registered endpoints through shared authentication and reject duplicate route registrations.
- [x] Register the System One decision endpoint and validate requests and answers through `system-one:v1`.
- [x] Make `/bot inference-key` display separate provider-advertised LLM and System One bridge sections, base URLs, and endpoint lists, repeating the same shared client key in each section with a blank line between sections.
- [x] Update documentation, generated registration, and System One bottom-up knowledge. Targeted ESLint, full-project TypeScript, and whitespace checks passed. A focused in-memory check passed for discovery, shared-key sections/rotation, authentication, decision dispatch, method/schema errors, and payload limits without upstream calls. Repo-wide lint remains blocked by existing NR, PPQ vendor, and Translate errors.
- [ ] User verification of live authenticated core and System One inference after restarting the bot.

### HTTP model defaulting correction

- [x] Accept omitted or null HTTP `model` by normalizing it to the decision contract's explicit null; preserve explicit model overrides.
- [x] Report invalid request field paths so missing or malformed state/questions can be distinguished from a model error; update bridge documentation and plugin knowledge.
- [x] Verify omitted, null, explicit, and invalid model handling with targeted lint/type checks and a focused in-memory provider check using stubbed upstream responses. Live inference remains unverified.

### Structured choice criteria compatibility

The user's direct TypeSafe connection-test request includes object-valued choice criteria, such as `"1": { "element": "[1] More information" }`. Preserve these JSON values through the shared decision contract and HTTP adapter instead of requiring string/null descriptions.

- [x] Accept JSON-valued choice criteria while retaining nonempty candidate maps and existing score-question validation.
- [x] Verify the reported HTTP request reaches the upstream fetch boundary with equivalent JSON values, including nested criterion objects, and unknown choices/probability keys remain rejected. A focused in-memory check with stubbed upstream responses also verified default model inheritance and rejection of non-JSON criterion values.
- [x] Update documentation and complete targeted ESLint, full-project TypeScript, and whitespace checks. Repo-wide lint remains blocked by the existing NR, PPQ vendor, and Translate errors; live upstream verification remains user-owned.

Provider output must be checked against the caller's offered question IDs/types/candidates. A provider may not return unknown answer IDs or choices, mismatched answer types, out-of-range probability/confidence values, or non-finite scores. The API request carries caller-supplied state to the configured provider; consumers remain responsible for minimizing sensitive content.
