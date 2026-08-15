# Plugin Capability Services Implementation Checklist

Companion design: `docs/PLUGIN_CAPABILITY_SERVICES.md`

Status: implementation substantially complete; compatibility metadata and manual verification pending

## 1. Core Contract Foundation

- [x] Add `src/capabilities/types.ts` with capability references, canonical operation IDs, operation definitions, contracts, resource references, and helper types.
- [x] Add a typed `defineCapability(...)` helper that preserves operation input and output inference.
- [x] Add canonical operation-ID validation for `capability:v<major>:<capability>.<operation>`.
- [x] Add exact capability-major matching.
- [x] Add contract validation for duplicate or malformed operation IDs.
- [x] Document each contract's minimum AppWeaver core version in its file header and exported metadata.

## 2. Runtime Registry

- [x] Add `src/core/capabilities/registry.ts`.
- [x] Add `src/core/capabilities/errors.ts` with typed registration, selection, validation, invocation, and resource failures.
- [x] Add `src/core/capabilities/selection.ts` for explicit, single, multiple, and missing-provider resolution.
- [x] Extend `BotPlugin` with `capabilityProviders`.
- [x] Define `CapabilityProviderDefinition` without `providerKey` or plugin-supplied source metadata.
- [x] Enforce one provider registration per plugin package, capability name, and major version.
- [x] Derive provider IDs as `<plugin-package-name>/<capability-name>/v<major>`.
- [x] Build `CapabilityProviderSource` from trusted plugin identity and installed package metadata.
- [x] Include plugin name, alias, version, title, description, and icon URL in registered source metadata.
- [x] Register providers after plugin `onInit` so handlers can use initialized plugin state.
- [x] Validate required operations and reject unknown provider operations.
- [x] Validate operation input before invocation and output after invocation.
- [x] Attribute invocation logs and failures to consumer and provider identities.

## 3. Plugin-Scoped Capability Client

- [x] Add a typed capability client to `PluginContext`.
- [x] Create a plugin-scoped context in `registerPlugin()` so core knows the invoking consumer identity.
- [x] Support invocation using exported operation definitions rather than manually typed strings.
- [x] Support `provider: 'auto'` for new resources.
- [x] Support explicit stable provider IDs for existing provider-owned resources.
- [x] Return typed missing-provider and selection-required results for consumer handling.
- [x] Prevent capability invocation during incomplete startup registration, or define a two-phase registration/finalization lifecycle.

## 4. Capability Relations And Catalog Discovery

- [x] Extend plugin `package.json` parsing with `appweaver.capabilities.provides`, `uses`, and `requires` arrays.
- [x] Accept several capabilities and several versions of the same capability.
- [x] Deduplicate exact repeated declarations without collapsing distinct versions.
- [x] Extend plugin publishing to emit namespaced NIP-32 capability labels on kind `32107` events.
- [x] Parse capability labels only from kind `32107` events with the AppWeaver capability namespace.
- [x] Extend plugin catalog parsing with relation and version metadata.
- [x] Add `capability:<name>:v<major>` provider filtering.
- [x] Add explicit `provides:`, `uses`, and `requires:` filters.
- [x] Preserve existing publisher, repository, release, signature, and core compatibility checks.
- [x] Log missing `requires` relations after all installed providers have registered.
- [x] Keep missing `uses` relations non-blocking.

## 5. Provider Selection And Generic Web Flow

- [x] Keep provider preferences in consumer-owned state rather than core-global persistence.
- [x] Add a generic capability WebAction with operation ID, input, optional provider ID, and selection policy.
- [x] Implement the missing-provider result and plugin-manager search action.
- [x] Implement the single-provider direct route.
- [x] Implement explicit provider routing for consumer-owned preferences.
- [x] Implement the multiple-provider chooser flow on the requested WebAction surface.
- [x] Display plugin icon, title, alias, description, and version in chooser entries.
- [x] Add a generic `Use provider` chooser action.
- [x] Route existing resource operations to the provider ID stored in `CapabilityResourceRef`.
- [x] Keep chooser and missing-provider UI generic and plugin-agnostic.

## 6. Scheduler V1 Contract

- [x] Add `src/capabilities/scheduler.v1.ts` with its minimum core version header.
- [x] Define `capability:v1:scheduler.create` input and output schemas.
- [x] Define `capability:v1:scheduler.list` input and output schemas.
- [x] Define `capability:v1:scheduler.show` input and output schemas.
- [x] Define required versus optional scheduler operations explicitly.
- [x] Define provider-scoped scheduler resource references.
- [x] Define the initial `agent-prompt` task type.
- [x] Allow provider-owned review output without coupling the contract to Job-specific nodes.

## 7. Job Scheduler Provider

- [x] Declare Job as providing `scheduler:v1` in package metadata.
- [ ] Raise Job's `appweaver.coreApiVersion` to a range that includes the scheduler contract's minimum core version, `10.0.1`.
- [x] Register Job's scheduler provider on `BotPlugin`.
- [x] Map `capability:v1:scheduler.create` to Job's existing draft or creation flow.
- [x] Map `capability:v1:scheduler.list` to Job's existing query and rendering logic.
- [x] Map `capability:v1:scheduler.show` to Job's existing detail UI.
- [x] Return stable Job resource IDs inside complete `CapabilityResourceRef` values.
- [x] Keep Job responsible for persistence, execution, retries, logs, and result delivery.
- [x] Preserve existing Job commands and AI tools.

## 8. NR Scheduler Consumer

- [x] Declare NR as using `scheduler:v1` in package metadata.
- [x] Add a `Schedule fetch` action to the appropriate NR UI.
- [x] Raise NR's `appweaver.coreApiVersion` to a range that includes capability contracts introduced in core `10.0.1`.
- [x] Invoke `capability:v1:scheduler.create` with schedule defaults and the existing generated CLI tool prompt.
- [x] Use the prompt `Run \`bun src/cli.ts nr fetch_evaluate '{}'\` to fetch and evaluate the user's Nostr posts.`
- [x] Store the returned complete `CapabilityResourceRef` in NR persistence.
- [x] Display registered schedule status in NR.
- [x] Add `Show scheduled job` using `capability:v1:scheduler.show` with the stored provider ID and resource ID.
- [x] Handle missing provider by opening plugin manager with `capability:scheduler:v1`.
- [x] Handle stale or removed provider references without preventing NR from loading.

## 9. Verification And Rollout

- [x] Run targeted ESLint on the capability-related core and plugin files.
- [x] Run root TypeScript checking after shared contract and `BotPlugin` changes.
- [ ] Manually verify registration with no providers, one provider, and two providers.
- [ ] Manually verify chooser icons, aliases, explicit selection, and stale consumer-owned provider IDs.
- [ ] Manually verify missing-provider plugin-manager filtering.
- [ ] Manually verify Job draft review, schedule creation, NR resource persistence, and Job detail reopening.
- [ ] Manually verify a due Job executes NR through the existing CLI tool path.
- [ ] Verify existing commands, AI tools, generated skills, and web widgets still work.
- [x] Signal `restart.requested` after native core or plugin changes are ready.
- [ ] Regenerate affected bottom-up documentation after implementation is stable. Declined for now.

## Remaining Work

- Update Job and NR package compatibility ranges for the `scheduler:v1` contract introduced in core `10.0.1`.
- Manually exercise provider registration with zero, one, and two scheduler providers.
- Verify chooser metadata, explicit selection, stale provider IDs, and catalog filtering in the Web UI.
- Complete the Job draft, creation, persistence, detail reopening, and due-run flow through NR's existing CLI tool.
- Smoke-test existing commands, AI tools, generated skills, and web widgets for regressions.

## 10. Translation V1 And AI Translate

- [x] Add a provider-neutral `translation:v1` contract with BCP 47 source and target languages.
- [x] Keep AI backend and model settings outside the capability contract.
- [x] Register AI Translate as a `translation:v1` provider.
- [x] Add optional backend and model settings with current-default fallback.
- [x] Add the model-options datalist used by the regular Web settings form.
- [x] Add the `translate` command for plain text and Markdown.
- [x] Accept standard structured and flat JSON payloads when the command source is Web.
- [x] Use isolated backend sessions with runtime context disabled for translation.
- [x] Add a generic translation icon action to `nostrPost` cards.
- [x] Let NR invoke `translation:v1` for post content with automatic source-language detection.
- [x] Store NR's optional translation target language and default it to English.

## Deferred Work

- [ ] Pending capability-request continuation after plugin installation and restart.
- [ ] Provider-specific settings navigation from the chooser.
- [ ] Capability invocation audit UI.
- [ ] Hard startup blocking for missing `requires` relations.
- [ ] Process isolation or sandboxing for installed providers.
