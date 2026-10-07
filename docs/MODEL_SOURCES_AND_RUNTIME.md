# Model sources and managed OpenCode runtime

## Ownership

Core owns model-source selection, capability validation, managed OpenCode
configuration, runtime admission, and process lifecycle. Installed apps own their
catalogs, upstream credentials, account state, and source-specific runtime
contributions. The reusable contract is defined in
`src/capabilities/ai-model-source.v1.ts`; host orchestration lives under
`src/core/model-source/` and `src/backends/`.

See [Capability services](./PLUGIN_CAPABILITY_SERVICES.md) for registration and
validation and [Inference bridge](./INFERENCE_BRIDGE.md) for HTTP consumers.
PPQ-specific accounts, proxy behavior, and funding are documented in the
[PPQ implementation plan](../plugins/ppq/docs/PPQ_PLUGIN_DESIGN_AND_IMPLEMENTATION_PLAN.md).

## Workspace-local configuration

Each workspace has its own canonical normal configuration:

```text
<workspace>/.appweaver/opencode.json   canonical shared base
<workspace>/opencode.json             managed runtime configuration
templates/opencode/opencode.json      tracked bootstrap template
```

Configuration writers update the canonical base rather than treating generated
runtime output as the source of truth. Existing effective configuration is
imported before migration; an existing canonical file is preserved. Malformed
configuration is a blocking error rather than an invitation to replace it with
an empty object. Parent and AppWeaver workspaces have independent managed files.

## Concurrent source runtimes

The workspace's selected source and model are defaults for the main prompt.
Other callers can select a different source and model for their own run.
Managed OpenCode servers are reused per workspace/source/configuration. Different
models within one source use separate sessions and per-prompt model overrides.
Switching the main default does not drain or restart unrelated source servers.

Source-specific configuration is supplied through `OPENCODE_CONFIG_CONTENT`.
OpenCode merges inline configuration with project/global configuration; provider
isolation must be considered for each source instance. Canonical permissions,
tools, agents, MCP servers, instructions, and compaction remain shared base
configuration. Runtime credentials belong to trusted process management and
must not be returned as public capability data or persisted in generated JSON.

## Lifecycle and structural changes

The managed runtime controller tracks active runs for each source instance.
Credential rotation and structural configuration updates coordinate affected
in-flight requests. The host bot is distinct from managed `opencode serve`
processes; configuration transitions must not depend on restarting the whole bot.
Source instances stay open until AppWeaver exits; an active count of zero alone
does not trigger retirement.

Job scheduling may pin workspace/source/model options. Sticky sessions are
opt-in and resume only while saved workspace and source bindings remain valid.
Scheduler contracts remain versioned; older consumers retain their existing
task shapes.
