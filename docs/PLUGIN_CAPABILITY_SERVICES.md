# Plugin Capability Services

Status: implementation-ready design

## Summary

AppWeaver plugins should be able to provide versioned services to other plugins without importing each other or depending on local command aliases. Core acts as the orchestrator: it registers installed providers, resolves providers for consumers, validates capability-operation calls, opens provider selection when necessary, and uses the plugin catalog when no compatible provider is installed.

The design has three layers:

1. **Public declaration:** Kind `32107` plugin events advertise provided, used, and required capabilities for discovery.
2. **Runtime registration:** Installed plugins register executable implementations of capability operations.
3. **Core orchestration:** Consumers invoke versioned operations through core instead of calling provider plugins directly.

Catalog metadata is for discovery. Runtime registration is the authority for execution.

## Goals

- Allow plugins to collaborate through stable, versioned contracts.
- Keep consumers independent of provider package names, aliases, commands, storage, and UI implementation.
- Support capabilities containing multiple named, versioned operations.
- Discover installable providers when no compatible provider is registered.
- Support one provider, multiple providers, consumer-owned preferences, and explicit provider selection.
- Make capability contracts easy for plugin authors to find and inspect.
- Keep provider execution and resource ownership with the provider plugin.
- Keep plugin-specific behavior under `plugins/`; core implements generic registration, validation, routing, discovery, and UI primitives.
- Preserve current command, AI tool, CLI, and WebNode flows.

## Non-Goals

- Automatic installation without user confirmation.
- A security sandbox for third-party plugin code. Installed plugins currently execute in the AppWeaver process.
- Replacing plugin commands, `ai.ts` tool definitions, `scripts/generate-tools.ts`, or `src/cli.ts`.
- Introducing a second plugin operation registry in the first implementation.
- Defining how every provider executes its registered work. Execution semantics belong to each capability contract and provider.

## Terminology

### Capability

A named, versioned service contract such as `scheduler:v1` or `translation:v1`.

A capability can expose multiple operations. Every operation belongs to a versioned capability contract and has a canonical invocation ID. For example, `scheduler:v1` may expose:

- `capability:v1:scheduler.create`
- `capability:v1:scheduler.list`
- `capability:v1:scheduler.show`
- `capability:v1:scheduler.update`
- `capability:v1:scheduler.delete`
- `capability:v1:scheduler.run`

The complete operation set and schemas are defined in one core capability contract file.

### Provider

An installed plugin implementation of one capability version. A single plugin may provide multiple capabilities and multiple major versions of the same capability.

### Consumer

A plugin that uses or requires a capability. The consumer invokes versioned capability operations through core and does not import the provider.

### Capability Operation

One callable service inside a capability contract. Its canonical ID is:

```text
capability:v<major>:<capability-name>.<operation-name>
```

Examples:

```text
capability:v1:scheduler.create
capability:v1:scheduler.show
capability:v2:scheduler.show
capability:v1:translation.translate
```

The version is always present in the operation ID. It identifies the operation schema and behavior from that major of the capability contract. `capability:v1:scheduler.show` and `capability:v2:scheduler.show` are separate operations even though both use the short name `show`.

In the initial design, the version in an operation ID is the capability-contract major exported by files such as `scheduler.v1.ts`. If `show` needs a breaking change, `scheduler.v2.ts` defines `capability:v2:scheduler.show`. A provider can continue registering `capability:v1:scheduler.show` alongside it, and is expected to do so while the old behavior remains supportable. Unchanged operations may also be exposed under both contract majors when both complete contracts are supported.

```ts
type CapabilityOperationRef = {
  capability: CapabilityRef;
  operation: string;
};

type CapabilityOperationId =
  `capability:v${number}:${string}.${string}`;
```

### Capability Resource

An entity owned by a provider and returned by a capability operation, such as a scheduled job. Resource identifiers are provider-scoped, not globally meaningful by themselves.

```ts
type CapabilityResourceRef = {
  capability: CapabilityRef;
  providerId: string;
  resourceType: string;
  resourceId: string;
};
```

A consumer may store this reference and later pass it to another operation of the same provider. For example, NR can store the schedule reference returned by `capability:v1:scheduler.create`, then invoke `capability:v1:scheduler.show` with the same provider and resource ID.

## Capability Identifiers And Versions

The canonical text form is:

```text
<name>:v<major>
```

Examples:

```text
scheduler:v1
translation:v1
```

Runtime structures keep the name and version separate:

```ts
type CapabilityRef = {
  name: string;
  version: number;
};
```

Version matching is exact by major. A provider of `scheduler:v2` does not automatically satisfy `scheduler:v1`.

Providers are expected to continue registering older major versions when they can still honor those contracts. A new implementation may therefore register all of these simultaneously:

```text
scheduler:v1
scheduler:v2
translation:v1
```

Each registered major uses its own contract file and handlers. A provider must not silently route a v1 request through v2 unless the v1 contract is still fully honored.

Published metadata must list every major currently supported by that release. Repeated capability names with different versions are valid. Repeated exact declarations should be accepted by parsers and deduplicated when displayed or republished.

## Capability Relations

Plugin metadata uses three explicit relations:

- `provides`: the plugin implements the capability.
- `uses`: the plugin has an optional integration with the capability.
- `requires`: the plugin expects the capability for some functionality.

In the initial implementation, a missing requirement does not prevent plugin code from loading. Core logs missing `requires` declarations during registration and logs failed invocations. The consumer or executor remains responsible for deciding whether to hide functionality, show installation UI, degrade gracefully, retry, or surface an error.

Missing `uses` declarations may be logged at debug or informational level but are not errors.

## Public Plugin Metadata

### `package.json`

Plugins declare relations under `appweaver.capabilities`:

```json
{
  "name": "appweaver-example-plugin",
  "version": "2.0.0",
  "appweaver": {
    "title": "Example",
    "coreApiVersion": "^11.0.0",
    "description": "Example AppWeaver plugin.",
    "capabilities": {
      "provides": [
        { "name": "scheduler", "version": 1 },
        { "name": "scheduler", "version": 2 }
      ],
      "uses": [
        { "name": "translation", "version": 1 }
      ],
      "requires": [
        { "name": "notification.send", "version": 1 }
      ]
    }
  }
}
```

All three values are arrays. The same capability name may appear more than once when different major versions are supported.

### Kind `32107` Tags

Published plugin events use one-letter relation tags:

```json
[
  ["p", "scheduler", "1"],
  ["p", "scheduler", "2"],
  ["p", "translation", "1"],
  ["u", "notification.send", "1"],
  ["r", "storage.documents", "1"]
]
```

For kind `32107` plugin events only:

- `p` means provides.
- `u` means uses.
- `r` means requires.

These meanings are scoped to the AppWeaver plugin event kind. Parsers must not apply them to other Nostr event kinds.

Multiple `p`, `u`, and `r` tags are valid. Events may contain:

- Several different capabilities under one relation.
- The same capability under several supported versions.
- The same capability under different relations when there is a concrete reason, though publishers should avoid contradictory metadata.

The older proposed `capability` and `uses-capability` tags are not needed.

### Plugin Manager Filters

The canonical search expression remains relation-neutral for normal provider discovery:

```text
capability:scheduler:v1
```

By default this searches kind `32107` events whose `p` tags provide the requested capability and version.

The plugin manager may also support explicit relation filters:

```text
provides:scheduler:v1
uses:scheduler:v1
requires:scheduler:v1
```

This lets users and developers see the ecosystem around a capability, not only providers.

Search results must still pass normal publisher, repository, release, signature, and core API compatibility checks. A catalog declaration never makes a plugin executable. After installation and restart, runtime registration must provide the corresponding operation implementation.

## Core Capability Contracts

Capability contracts live in a dedicated, easy-to-discover core directory:

```text
src/capabilities/
  types.ts
  scheduler.v1.ts
  scheduler.v2.ts
  translation.v1.ts
```

Each contract file begins with a comment documenting when it became available:

```ts
/**
 * Capability: scheduler:v1
 * Added in AppWeaver core: 11.2.0
 *
 * Plugin authors that import or declare this capability must set
 * appweaver.coreApiVersion to a range including ^11.2.0 or newer.
 */
```

This gives plugin authors a direct answer to two questions:

1. Which operations and schemas does this capability contain?
2. Which minimum AppWeaver core version can be declared safely?

Contracts contain only shared types, schemas, operation names, canonical operation IDs, and behavior documentation. They do not import provider plugins or contain provider-specific logic.

### Multi-Operation Contract Shape

```ts
type CapabilityOperationDefinition<TInput, TOutput> = {
  id: CapabilityOperationId;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
};

type CapabilityContract<TOperations extends CapabilityOperationMap> = {
  capability: CapabilityRef;
  addedInCoreVersion: string;
  operations: TOperations;
};
```

A scheduler contract can export several operations:

```ts
export const SchedulerV1 = defineCapability({
  capability: { name: 'scheduler', version: 1 },
  addedInCoreVersion: '11.2.0',
  operations: {
    create: {
      id: 'capability:v1:scheduler.create',
      inputSchema: SchedulerCreateInputSchema,
      outputSchema: SchedulerCreateOutputSchema,
    },
    list: {
      id: 'capability:v1:scheduler.list',
      inputSchema: SchedulerListInputSchema,
      outputSchema: SchedulerListOutputSchema,
    },
    show: {
      id: 'capability:v1:scheduler.show',
      inputSchema: SchedulerShowInputSchema,
      outputSchema: SchedulerShowOutputSchema,
    },
  },
});
```

Operation IDs are stable and versioned. Adding an optional operation may be backward compatible if existing providers are not required to implement it. Adding a required operation to an existing major is breaking unless the contract has an explicit optional-operation mechanism.

For v1, capability files should distinguish required and optional operations explicitly rather than assuming every later addition is mandatory.

## Runtime Provider Registration

### Plugin Contract

Providers are declared on `BotPlugin` so core binds them to the actual plugin identity:

```ts
type BotPlugin = {
  identity: PluginIdentity;
  onInit: (ctx: PluginContext) => void;
  handler: PluginHandler;
  helpText: PluginHelpText;
  commandDefinition: PluginCommandDefinition;
  capabilityProviders?: CapabilityProviderDefinition[];
};
```

Core calls `onInit`, then validates and registers the plugin's providers. Provider handlers can use plugin module state initialized by `onInit`, including the plugin database.

This is preferred over an unrestricted shared `ctx.registerCapability(...)` method because core can authoritatively attach:

- Plugin package name
- Installed alias
- Plugin version
- Provider identifier
- Lifecycle ownership

### Provider Definition

```ts
type CapabilityProviderDefinition = {
  contract: CapabilityContract;
  operations: Record<string, CapabilityOperationHandler>;
};
```

Provider operation maps use the canonical IDs exported by the corresponding core contract, such as `[SchedulerV1.operations.show.id]`. Core validates that all required operations are implemented and that no unknown operations are registered. Registration, invocation, and logging therefore use the same canonical ID `capability:v1:scheduler.show`.

One plugin may register at most one provider for each capability major. Internal implementation choices such as model, API service, account, or endpoint belong in provider settings or in contract-defined operation input. They do not create additional provider registrations.

Core derives the stable provider ID:

```text
<plugin-package-name>/<capability-name>/v<major>
```

For example:

```text
appweaver-job-plugin/scheduler/v1
appweaver-translation-plugin/translation/v1
```

Provider IDs do not depend only on local install aliases because aliases are user-selected and may differ between installations.

### Registered Provider Source

Core attaches source metadata while registering the provider. Plugins do not submit or override their own source identity:

```ts
type RegisteredCapabilityProvider = {
  contract: CapabilityContract;
  providerId: string;
  source: CapabilityProviderSource;
  operations: Record<CapabilityOperationId, CapabilityOperationHandler>;
};

type CapabilityProviderSource = {
  type: 'plugin';
  pluginName: string;
  alias: string;
  version: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
};
```

The source comes from the registered plugin identity and installed package metadata. Core already knows the local alias and can resolve the plugin icon route. This prevents a provider from impersonating another plugin or publishing stale display metadata at runtime.

`providerId` is used for consumer-owned preferences and persisted resource references. `source.alias`, `source.title`, and `source.iconUrl` are used for display and local navigation.

## Core Capability Registry

The registry is generic and contains no provider-specific behavior.

Recommended modules:

```text
src/core/capabilities/
  registry.ts
  errors.ts
  selection.ts
```

Shared public contracts remain in `src/capabilities/`; runtime orchestration lives under `src/core/capabilities/`.

Core registry interface:

```ts
interface CapabilityRegistry {
  listProviders(capability: CapabilityRef): CapabilityProviderSummary[];
  getProvider(providerId: string): CapabilityProviderSummary | null;
  invoke<TInput, TOutput>(request: InvokeCapabilityOperationRequest<TInput>): Promise<TOutput>;
}

type InvokeCapabilityOperationRequest<TInput> = {
  operation: CapabilityOperationId;
  providerId: string;
  input: TInput;
  initiatedBy: CapabilityCaller;
};
```

Core parses the canonical operation ID to resolve its capability name, major version, and short operation name. The registry must:

1. Resolve the exact versioned capability operation.
2. Validate input using the core contract.
3. Record consumer and provider identity for logs.
4. Invoke the provider operation.
5. Validate output using the core contract.
6. Return typed failures without leaking secrets.

Core orchestrates registration, discovery, provider selection, operation routing, validation, and result delivery. The provider remains responsible for executing and applying its work after registration.

Suggested errors:

- `CapabilityProviderMissingError`
- `CapabilityProviderSelectionRequiredError`
- `CapabilityOperationMissingError`
- `CapabilityInputInvalidError`
- `CapabilityOutputInvalidError`
- `CapabilityInvocationFailedError`
- `CapabilityResourceNotFoundError`

Core logs missing requirements at plugin registration and logs invocation failures. The invoking consumer or executing provider determines user-visible handling.

## Provider Resolution And User Choice

Provider selection is a core concern so every consumer behaves consistently.

Resolution order:

1. An explicit provider ID, especially when accessing an existing provider-owned resource.
2. The only compatible installed provider.
3. A chooser when multiple compatible providers are installed.
4. A missing-provider installation prompt when none are installed.

Core does not persist provider defaults. A consumer that wants a stable preference stores the chosen provider ID in its own state and passes it explicitly on later calls. This allows two consumers of the same capability contract to choose different providers. A consumer may instead request selection each time.

The chooser supports:

- Use provider for this invocation
- Open provider settings when available

Each chooser entry displays source metadata supplied by core:

- Plugin icon
- Plugin title
- Local alias
- Description
- Installed plugin version

If two installed plugins provide `translation:v1`, the chooser presents those two plugin sources. A consumer that wants to remember the choice persists the selected provider ID itself. Internal engines exposed by one translation plugin remain that plugin's responsibility and do not create additional core provider entries.

Selecting the only provider means routing to that provider. It does not bypass provider confirmation, review, or draft behavior.

When a consumer stores a `CapabilityResourceRef`, later operations for that resource always use its stored `providerId`. Core must not route `show`, `update`, or `delete` for an existing resource to a different provider.

## Generic Web Capability Action

WebNode gains one reusable capability action:

```ts
type WebCapabilityAction = {
  type: 'capability';
  operation: CapabilityOperationId;
  input: Record<string, unknown>;
  providerId?: string;
  selection: 'auto' | 'always-choose';
  missingProvider: {
    mode: 'offer-install';
  };
  surface?: 'timeline' | 'modal';
  modalTitle?: string;
};
```

Core handles the action:

- No provider: return a missing-provider result with an installation search action.
- One or explicit provider: invoke the requested versioned operation.
- Multiple providers: open a provider chooser.
- Explicit provider: invoke that provider, normally for an existing resource.

Example missing-provider UI:

```text
This action requires an installed scheduler:v1 service.

[Find compatible apps]
```

The button opens plugin manager discovery with:

```text
capability:scheduler:v1
```

The initial implementation can use the existing generic client action mechanism to open the plugin manager with a filter. A later version may add a dedicated generic WebAction.

## Example: Scheduler Capability V1

This section is an example of the generic capability system, not a core goal or special case.

### Responsibility Boundary

The consumer invokes scheduler operations to create and inspect schedules. After creation, the scheduler provider owns the schedule and is responsible for invoking and applying the registered work when it becomes due.

For the current Job implementation, scheduled work may remain an AI prompt. No new operation registry is required. NR can register a prompt that instructs the scheduled agent to use NR's existing generated CLI tool:

```text
Run `bun src/cli.ts nr fetch_evaluate '{}'` to fetch and evaluate the user's Nostr posts.
```

The existing path remains authoritative:

- NR defines `fetch_evaluate` in `ai.ts`.
- `scripts/generate-tools.ts` exposes it to generated tooling.
- `src/cli.ts` validates and executes the tool call.
- Job executes the stored prompt through its existing scheduler and agent flow.

This avoids inventing `fetch-evaluate:v1` as a second operation system in this project.

### Scheduler Operations

An initial `scheduler:v1` contract can expose:

- `capability:v1:scheduler.create`: open or complete schedule creation.
- `capability:v1:scheduler.list`: list resources owned by the selected scheduler provider.
- `capability:v1:scheduler.show`: return one schedule and optionally a provider-owned view.

Later versions or optional operations may add:

- `capability:v1:scheduler.update`
- `capability:v1:scheduler.delete`
- `capability:v1:scheduler.enable`
- `capability:v1:scheduler.disable`
- `capability:v1:scheduler.run`

### Create Request

```ts
type SchedulerCreateInput = {
  name: string;
  schedule: SchedulerSchedule;
  task: {
    type: 'agent-prompt';
    prompt: string;
  };
  enabled: boolean;
};

type SchedulerSchedule =
  | {
      type: 'cron';
      expression: string;
      timezone: string;
      maxRuns: number | null;
    }
  | {
      type: 'one-time';
      runAt: string;
    };
```

The scheduler contract owns the supported task variants. `agent-prompt` is sufficient for the first Job integration. A future scheduler contract may add other task types without requiring a generic core operation registry.

The previous draft's reference to JavaScript callbacks and command aliases meant avoiding persisted in-memory function references or local strings such as `/nr fetch-latest`, which are not portable across restarts or alias changes. That restriction is removed as a top-level design concern. The scheduler contract now explicitly defines its accepted task payloads, and `agent-prompt` uses the existing stable generated CLI tool path in this example.

### Create Result

```ts
type SchedulerCreateOutput = {
  resource: CapabilityResourceRef;
  status: 'draft' | 'created';
  review: WebNodeRoot | null;
};
```

Job may return a draft or provider-owned review form before creating the schedule. The resource reference is returned once an addressable provider resource exists.

### Show Request And Result

```ts
type SchedulerShowInput = {
  resourceId: string;
};

type SchedulerShowOutput = {
  resource: CapabilityResourceRef;
  name: string;
  enabled: boolean;
  scheduleDescription: string;
  nextRunAt: number | null;
  view: WebNodeRoot | null;
};
```

NR stores the returned resource reference in its own settings or database. It can then display:

```text
Hourly fetch is scheduled.

[Show scheduled job]
```

The button invokes `capability:v1:scheduler.show` with the stored provider ID and resource ID. Core routes the call back to Job. Job may return its list or detail UI with that task highlighted or expanded.

### NR Scheduling Flow

1. The user clicks `Schedule fetch and evaluate` in NR.
2. NR invokes `capability:v1:scheduler.create` through core.
3. If no provider is installed, core shows `Find compatible apps`.
4. The plugin manager opens with `capability:scheduler:v1`.
5. The catalog finds kind `32107` events with `p`, including Job.
6. The user reviews and installs Job through the existing installation flow.
7. Installation regenerates plugin registration and restarts AppWeaver as required.
8. The user clicks the NR action again.
9. Core resolves Job as the only or default scheduler provider.
10. NR sends schedule defaults and the CLI-oriented agent prompt to `capability:v1:scheduler.create`.
11. Job displays its schedule review form or draft.
12. After user confirmation, Job creates the cron job and returns its provider-scoped resource reference.
13. NR stores the reference and shows a `Show scheduled job` action.
14. When due, Job executes and applies the registered task using its own runner.
15. Clicking `Show scheduled job` invokes Job's `capability:v1:scheduler.show` operation through core.

The initial implementation does not need to resume the pre-install action automatically. A future continuation token may preserve and replay the pending capability request after installation, but only after explicit user confirmation.

## Example: Translation Capability V1

This section is another example of the same generic mechanism.

`translation:v1` initially exposes:

- `capability:v1:translation.translate`

Language listing or provider-status operations can be added later if consumers need them.

Example translation input:

```ts
type TranslationInputV1 = {
  content: string;
  format: 'plain-text' | 'markdown';
  sourceLanguage: string | null; // null means automatic detection
  targetLanguage: string;
  context: string | null;
};

type TranslationOutputV1 = {
  content: string;
  sourceLanguage: string | null;
  targetLanguage: string;
};
```

Language values use BCP 47 tags such as `en`, `de`, or `pt-BR`. The optional context is provider-neutral supporting information and is not itself translated.

Possible provider plugins include AppWeaver AI Translate, a DeepL integration, and a LibreTranslate integration. With one provider plugin, core routes directly to it. With several provider plugins, core opens the generic icon-aware chooser unless the consumer passes its own stored provider ID. A single translation plugin may also support several engines internally through its own settings.

The translation provider owns external service credentials, model settings, caching, billing, and execution. AI Translate stores optional backend and model overrides and otherwise uses current AppWeaver defaults. AI-specific settings do not appear in the generic capability input. NR owns source-content retrieval, language defaults, provider preference, and presentation of original versus translated content.

## Example: Monitoring Capability V1

`monitoring:v1` exposes `capability:v1:monitoring.record`. The input is a bounded batch of completed spans containing trace and parent span IDs, source, wall-clock start, monotonic duration, status, and scalar attributes.

Monitoring differs from interactive request/response capabilities:

- Core exposes an always-available tracing facade to plugins.
- Completed spans are queued and delivered asynchronously so persistence is outside the measured operation.
- No provider means queued signals are discarded without affecting application behavior.
- Every registered monitoring provider receives the signal batch; there is no provider chooser.
- Browser spans use the same trace ID as server command and plugin spans.
- Sensitive command inputs and outputs are not captured automatically.

The initial Performance Monitor provider stores spans in its own SQLite database and renders recent traces as expandable waterfalls. NR's per-post Read action is the first end-to-end example, covering its mark query, list refresh query, hydration, profile lookup, WebNode build, browser state update, and paint.

## Security And Trust

### Catalog Trust

- Relation tags are signed publisher claims, not proof of implementation quality.
- Plugin manager preserves current publisher, repository, release, and core compatibility checks.
- Search results identify the publisher, relation, capability, and version.

### Runtime Trust

- Only installed and registered providers may be invoked.
- Core binds registrations to actual plugin identity.
- Every operation invocation validates input and output against the core contract.
- Provider errors are attributed to the provider ID in logs.
- Secrets remain inside provider plugins and never appear in catalog events or generic capability payloads.

### User Intent

- Installing a provider requires explicit confirmation.
- Mutating operations preserve provider review or draft semantics.
- Consumers may change or clear provider preferences in their own state.
- Consumers decide how to present missing optional services and runtime failures.

### Current Process Boundary

The registry provides contract isolation, not process isolation. Installed plugins can currently import core modules and execute in the same Bun process. Capability validation reduces accidental coupling but does not sandbox malicious code.

## Persistence And Provider Resources

Providers persist their own resources. Consumers persist provider preferences and `CapabilityResourceRef` values when they need to reconnect to provider-owned resources. Core may record invocation audit metadata.

Consumers must store the complete reference, not only `resourceId`, because two providers may both return `42`.

When a provider is upgraded:

- It should continue registering older capability majors that it still supports.
- Existing resources remain associated with their original provider ID and capability major.
- Breaking operation changes use a new major contract file.
- Providers own migrations for their persisted resources.

When a provider is uninstalled:

- Consumer plugins continue to load.
- Stored resource references become unresolved.
- Core returns a typed missing-provider failure.
- The consumer decides whether to show reinstall discovery, clear the reference, or retain it for later recovery.

## Observability And Error Handling

Core logs:

- Missing `requires` relations at plugin registration.
- Canonical capability operation ID for every failed invocation.
- Provider ID and plugin version.
- Consumer plugin identity.
- Start time, finish time, duration, and typed failure code.

Inputs and outputs are not logged by default because prompts, translated content, credentials, and personal data may be sensitive.

After core routes a valid call, execution errors belong to the provider operation implementation. The provider decides how to record partial work, retries, and provider-specific diagnostics. The consumer decides how failures affect its own UI or workflow.

## Proposed Implementation Phases

### Phase 1: Contracts And Runtime Registry

- Add common contract types under `src/capabilities/types.ts`.
- Add one file per capability major, with the minimum core version documented at the top.
- Add runtime orchestration under `src/core/capabilities/`.
- Extend `BotPlugin` with provider declarations.
- Register providers in `src/core/registry.ts` after `onInit`.
- Add schema validation, typed errors, provider listing, and operation invocation.
- Log missing `requires` relations without preventing plugin startup.

### Phase 2: Published Relations And Discovery

- Extend plugin `package.json` validation with `provides`, `uses`, and `requires` arrays.
- Publish `p`, `u`, and `r` tags in kind `32107` events.
- Accept repeated tags and multiple versions of the same capability.
- Parse and display relation tags in plugin manager results.
- Add provider and relation filter syntax.
- Add a plugin-manager client action that opens a prefiltered catalog.

### Phase 3: Generic Web Routing

- Add a generic capability WebAction containing the canonical operation ID, input, and optional provider ID.
- Implement missing-provider, single-provider, explicit-provider, and chooser flows.
- Keep remembered provider choices in consumer-owned state.
- Keep results expressed through existing generic WebNode primitives.

### Phase 4: Scheduler Example

- Add `src/capabilities/scheduler.v1.ts` with `create`, `list`, and `show` schemas.
- Register Job as a `scheduler:v1` provider.
- Advertise Job's provider relation in package metadata and kind `32107`.
- Add NR's scheduler consumer declaration and scheduling action.
- Have NR invoke `capability:v1:scheduler.create` with an agent prompt that uses its existing CLI tool.
- Store the returned provider-scoped resource reference in NR.
- Add an NR action that invokes `capability:v1:scheduler.show` through core.
- Preserve Job's draft and review behavior.

### Phase 5: Translation Example

- Add `src/capabilities/translation.v1.ts`.
- Add a translation provider plugin using the configured AI backend and model selector.
- Add Translate actions to NR notes and long-form article views.
- Add translation caching and original/translated presentation.

## Acceptance Criteria For The Scheduler Example

- NR has no import from Job and no dependency on the local `job` alias.
- Job publishes a `p` tag for `scheduler:v1` and registers its runtime provider.
- NR publishes a `u` or `r` tag according to whether scheduling is optional or required for the relevant feature.
- With Job absent, the NR action offers plugin discovery filtered by `capability:scheduler:v1`.
- With one scheduler installed, the NR action opens that provider's creation or review flow.
- With multiple schedulers installed, the user can choose one and optionally save it as default.
- Job creates and owns the scheduled resource and remains responsible for executing it later.
- NR stores the complete provider-scoped resource reference returned by Job.
- NR can invoke `capability:v1:scheduler.show` through core and open the provider-owned view for that resource.
- Job schedules NR through the existing `ai.ts`, generated-tools, and `src/cli.ts` path rather than a second operation registry.
- Existing plugin commands, AI tools, and web renderers continue to work without capability declarations.

## Open Questions

1. Should `p`, `u`, and `r` remain direct kind `32107` tags, or should relation codes be nested under a single `c` tag to avoid possible semantic overlap with tags used by other Nostr event kinds?
2. Should provider operation outputs be domain JSON only, or may contracts explicitly include `WebNodeRoot` provider views?
3. Which scheduler operations are required in v1 beyond `create`, `list`, and `show`?
4. Should installing a provider preserve a pending capability request for continuation after restart?
5. What generic callback or continuation mechanism should consumers use when they want a WebAction chooser result persisted automatically?
6. Should missing `requires` declarations remain log-only, or should plugins be able to mark individual actions disabled through a generic status operation?
7. How should plugin manager rank multiple providers beyond compatibility, publisher identity, and installed status?

## Recommended Initial Decisions

- Use exact major-version matching and allow providers to register several majors concurrently.
- Use explicit `provides`, `uses`, and `requires` arrays in package metadata.
- Publish relation tags as `p`, `u`, and `r` on kind `32107`, while keeping their meaning scoped to that event kind.
- Put capability contracts in discoverable files under `src/capabilities/`, with minimum core version comments.
- Let every capability expose multiple named, schema-validated, canonically versioned operations.
- Put runtime providers on `BotPlugin` and bind them to plugin identity in core.
- Keep execution and resource persistence with providers; core only orchestrates.
- Use provider-scoped resource references for follow-up operations.
- Keep provider preferences consumer-owned rather than storing global core defaults.
- Use NR's existing AI tool and CLI path inside the scheduled Job prompt for the first scheduler integration.
- Require the user to click the original action again after installation in v1; add continuation tokens later.
