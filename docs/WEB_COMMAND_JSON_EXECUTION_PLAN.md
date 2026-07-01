# Web command JSON execution and text parser `--` plan

## Problem

Web command forms already submit structured JSON arguments/options, but the current execution path serializes that JSON back into a whitespace-split command string before dispatching. This breaks long free-text inputs such as raw Nostr event JSON when content contains dash-prefixed text (`--foo`) or multi-line prose.

Example observed in `nr list` parse form:

```json
{
  "content": "Do Your Job\n\n... 'whatever anyone does or says...' -- Marcus Aurelius",
  "kind": 1,
  "tags": []
}
```

The text can be split into tokens before command parsing, so a token beginning with `--` is interpreted as an option.

We want two separate improvements:

1. **Web commands:** keep structured JSON structured; do not round-trip through text tokenization.
2. **Text invocations:** support conventional bare `--` as “end of options; the rest is positional text”.

## Current execution flow

### Web form path today

Relevant files:

- `src/web/execute.ts`
- `src/commands/dispatch.ts`
- `src/commands/parse-prefixed.ts`
- plugin `adapter.ts` files, e.g. `plugins/nr/adapter.ts`
- `src/system/parser-cli.ts`

Current flow:

```text
web form JSON
  -> src/web/execute.ts executeBuiltinCommand()
  -> buildInvocationInput()
  -> pushArgumentTokens()
  -> command string
  -> routeCommand(input)
  -> parseBuiltinTokens(input) [whitespace split]
  -> plugin handler(args[])
  -> plugin adapter parseCliInput(tokens: args)
```

The lossy part is in `src/web/execute.ts`:

```ts
if (argument.variadic) {
  if (typeof value === 'string') {
    for (const item of value.split(/\s+/).filter(Boolean)) {
      tokens.push(item);
    }
  }
}
```

Even though the browser submitted JSON, the value is split as if it were a shell command.

### Existing JSON-ish path

`src/web/execute.ts` already has:

```ts
executeBuiltinJsonCommand(...)
```

but normal web command execution still uses `executeBuiltinCommand(...)`, which reconstructs text. `jsonPayload` is passed through `routeCommand` to plugin context, but plugin adapters generally ignore it and parse `args[]`.

## Desired architecture

### Structured web command path

Web command execution should preserve this shape all the way to command adapters:

```ts
{
  command: 'nr',
  subcommand: 'parse',
  arguments: {
    event_json: '{... full JSON string ...}'
  },
  options: {
    force_reclassify: true
  }
}
```

Adapters should receive a parsed invocation equivalent to `parseCliInput()` output, but created directly from structured values rather than text tokens.

Target output shape remains:

```ts
ParsedCliInvocation
```

This minimizes command handler churn because existing adapters already expect `params.parsed.arguments` and `params.parsed.options`.

### Text command path

Text invocations should keep using text parsing, but support:

```text
/nr parse -- {"content":"hello --force-reclassify"}
```

Rules:

- Before bare `--`, parse options normally.
- After bare `--`, treat every token as positional, even if it starts with `-`.
- The bare `--` itself is not included in positional arguments.

Quote-aware tokenization can be a later improvement. Bare `--` is simpler and matches common CLI behavior.

## Proposed implementation plan

User-approved phase split:

- **Phase 1:** create the core structured parser helper, migrate `nr parse`/`nr` web execution to use `jsonPayload`, and document remaining migrations.
- **Phase 2:** implement text-command bare `--` parsing and verify `nr parse` text invocations can use it.
- **Phase 3:** migrate official plugins, update plugin core dependency ranges, and use `--major` commits for plugin releases if the plugin API/core requirement changes.

Current status:

- Phase 1 core helper exists as `parseStructuredInput(...)` in `src/system/parser-cli.ts`.
- `plugins/nr/adapter.ts` uses `jsonPayload` for web-origin invocations and falls back to text parsing otherwise.
- Phase 2 bare `--` parsing is implemented in `parseCliInput(...)` for command/subcommand text arguments.
- Phase 3 is still pending for official plugins and the plugin template.

### Phase 1 — add structured parser helper

Add a helper near `src/system/parser-cli.ts`, for example:

```ts
parseStructuredInput({
  command,
  subcommand,
  arguments,
  options,
  rawInput,
}): ParsedCliInvocation
```

Responsibilities:

- Validate subcommand exists.
- Validate required arguments/options.
- Coerce values using command definition kinds:
  - `string` -> string
  - `integer` -> number
  - `boolean` -> boolean
- Preserve string values exactly as submitted.
- For `variadic` arguments:
  - if structured value is an array, parse each item and return array
  - if structured value is a string, return a single-item array or a string-compatible representation consistent with `ParsedCliInvocationSchema`
- For `multiple` options:
  - accept arrays
  - accept scalar as one value if needed
- Fill `raw.input` with a descriptive non-lossy label such as `/nr parse (web json)`.

Open design point:

- Current `parseCliInput()` represents variadic values as arrays. Keep that shape for compatibility:

```ts
arguments.event_json = ['full JSON string']
```

Existing helpers such as `stringFromVariadicArgument()` already handle arrays by joining with spaces, and a single-item array preserves content exactly.

### Phase 2 — route web commands through structured parsing

Update web/plugin dispatch path so web form requests do not reconstruct text.

Possible approaches:

#### Option A: plugin adapters prefer structured payload

Plugin context already includes:

```ts
jsonPayload?: unknown
```

Update plugin adapters to do:

```ts
const parsed = context.jsonPayload
  ? parseStructuredInput({ command, ...context.jsonPayload })
  : parseCliInput({ command, tokens: normalizedArgs, rawInput })
```

Pros:

- Smallest core change.
- Can migrate plugin adapters incrementally.

Cons:

- Repeated boilerplate in each plugin adapter.
- Easy for future plugins to forget.

#### Option B: add a shared plugin adapter helper

Create a shared helper, for example:

```ts
parsePluginInvocation({
  command,
  args,
  prefix,
  alias,
  jsonPayload,
})
```

It chooses structured parsing for web JSON payloads and text parsing otherwise.

Pros:

- One standard implementation.
- Plugins can migrate with a small adapter change.

Cons:

- Still requires updating each plugin adapter to use the helper.

#### Option C: extend plugin handler interface

Longer-term API:

```ts
handler(args, context)
```

where `context` includes a normalized parsed invocation for web commands when available.

Pros:

- Cleanest model long term.

Cons:

- Broader plugin API change.
- Requires plugin core API version bump and coordinated plugin updates.

Recommended path: **Option B** first. It is explicit, testable, and avoids a large plugin interface redesign.

Phase 1 implementation can start with `nr` using the core structured parser directly. A shared plugin adapter helper should follow before migrating the official plugins, to avoid copy/paste parsing logic.

### Phase 3 — stop building lossy text for web execution

In `src/web/execute.ts`, avoid using `buildInvocationInput()` as the source of truth for web command execution.

Keep a display-only invocation string if the timeline needs it, but do not use it for parsing structured web requests.

Potential change:

- `executeBuiltinCommand()` passes `jsonPayload` and an input like `/${command.name} ${subcommand.name}` only for display/route command identification.
- Plugin adapter helper uses `jsonPayload` for actual parsing when present.

Important: `routeCommand()` currently starts by calling `parseBuiltinTokens({ input, prefix })` to identify `cmd`. So an input string is still needed for routing unless routeCommand grows a structured command entry point.

Minimal safe route:

```ts
input = `${prefix}${command.name} ${subcommand.name}`
jsonPayload = original structured payload
```

Then plugin adapter helper reconstructs parsed arguments from `jsonPayload`.

### Phase 4 — add bare `--` support for text parsing

Update `src/system/parser-cli.ts` option scanning:

```ts
let optionsEnded = false;

for token of subcommandTokens:
  if (!optionsEnded && token === '--') {
    optionsEnded = true;
    continue;
  }

  if (!optionsEnded && token startsWith('-')) parse option
  else positionalTokens.push(token)
```

This should replace the temporary/defensive behavior that treats unknown dash tokens as positional for variadic string commands.

Expected behavior:

```text
/cmd sub --flag value text --not-option
```

`--not-option` is still an option candidate before bare `--`.

```text
/cmd sub -- text --not-option
```

`--not-option` is positional after bare `--`.

### Phase 5 — plugin migration

Update plugin adapters to use the shared parse helper.

Also make plugin invocation types generic so structured web payloads can be represented without repeated `unknown` narrowing:

```ts
export type PluginInvocationContext<TJsonPayload = unknown> = {
  prefix: string;
  source: MessageSource;
  runAgent: RunAgentFn;
  sendReply?: SendReplyFn;
  promptFn?: PromptFn;
  jsonPayload?: TJsonPayload;
};

export type BotPlugin<TJsonPayload = unknown> = {
  handler: (
    args: string[],
    context: PluginInvocationContext<TJsonPayload>,
  ) => Promise<string | WebNodeRoot>;
  // existing fields unchanged
};
```

Add a shared payload type for normal web command form submissions:

```ts
export type StructuredCommandJsonPayload = {
  arguments?: Record<string, unknown>;
  options?: Record<string, unknown>;
};
```

Do **not** blindly narrow the existing global `jsonPayload?: unknown` field to `StructuredCommandJsonPayload` without checking other consumers. `src/commands/ai/handler.ts` currently uses `ctx.jsonPayload` for AI agent/config JSON flows, which may not have the normal `{ arguments, options }` command-form shape. If we want a strongly typed structured command payload everywhere, consider adding a separate field such as:

```ts
structuredCommandPayload?: StructuredCommandJsonPayload;
jsonPayload?: unknown;
```

or use generics so each command/plugin path can specify its own payload shape.

Then plugins that use structured parsing can declare:

```ts
export const NrPlugin: BotPlugin<StructuredCommandJsonPayload> = { ... };
```

This is a plugin API typing change. Runtime behavior is already compatible because `jsonPayload` exists, but published plugin packages that import/use the generic types should update their core API dependency during migration.

Likely files:

- `src/core/plugin.ts`
- `plugins/nr/adapter.ts`
- `plugins/todo/adapter.ts`
- `plugins/bm/adapter.ts`
- `plugins/file/adapter.ts`
- `plugins/job/adapter.ts`
- `plugins/journal/adapter.ts`
- `plugins/browser/adapter.ts`

The helper should require minimal adapter diff:

```ts
const parsed = parsePluginInvocation({
  command,
  args: normalizedArgs,
  prefix,
  alias,
  jsonPayload: storedCtxOrInvocationContext.jsonPayload,
});
```

Current issue: generated template adapters may not pass `jsonPayload` into `NrCommandAdapterParams`. The plugin invocation context already has it (`src/core/plugin.ts`), but generated adapters need to propagate it.

Also update `scripts/plugin-template/adapter.ts.template` so new plugins inherit the structured path.

### Phase 6 — core API version bump

Because plugin adapters and plugin template behavior change, bump plugin `coreApiVersion` expectations when published plugins are updated.

Notes:

- The already-added `webInput?: 'text' | 'textarea'` field is a command-definition schema/API addition. If published plugins use it, their `coreApiVersion` should require a core version that supports it.
- If structured parsing is implemented in core but plugins must opt into the helper, each migrated plugin should bump its core API dependency.
- If core handles structured parsing without plugin code changes, plugin dependency bumps may be less urgent, but generated skills/registries should still be regenerated.

## Codebase search results

### Dispatch/parser touchpoints

Search:

```text
parseCliInput|jsonPayload|executeBuiltinJsonCommand|pushArgumentTokens|parseBuiltinTokens
```

Matches of interest:

- `src/system/parser-cli.ts`
  - `parseCliInput(...)`
- `src/web/execute.ts`
  - `pushArgumentTokens(...)`
  - `executeBuiltinCommand(...)`
  - `executeBuiltinJsonCommand(...)`
  - passes `jsonPayload`
- `src/commands/dispatch.ts`
  - `parseBuiltinTokens(...)`
  - passes `jsonPayload` into plugin context
- `src/commands/parse-prefixed.ts`
  - current root command tokenization uses `rest.split(/\s+/)`
- `src/core/plugin.ts`
  - plugin invocation context includes `jsonPayload?: unknown`
- `src/web/ws.ts`
  - imports/uses `executeBuiltinCommand` and `executeBuiltinJsonCommand`

### Variadic command definitions in core

Search:

```text
variadic: true
```

Core matches:

- `src/commands/roadmap/definition.ts`
- `src/commands/definitions-registry.ts`
- `src/commands/ai/agent/save/definition.ts`
- `src/commands/wot/definition.ts`
- `src/commands/wallet/history/definition.ts`
- `src/commands/bot/push/definition.ts`
- `src/commands/bot/log/definition.ts`
- `src/commands/bot/lint/definition.ts`

### Variadic command definitions in plugins

Plugin matches:

- `plugins/nr/commands/parse/definition.ts`
- `plugins/nr/commands/accept/definition.ts`
- `plugins/nr/commands/revise/definition.ts`
- `plugins/nr/commands/ai/definition.ts`
- `plugins/nr/commands/add/definition.ts`
- `plugins/file/commands/tree/definition.ts`
- `plugins/file/commands/commit/definition.ts`
- `plugins/file/commands/edit/definition.ts`
- `plugins/file/commands/search/definition.ts`
- `plugins/bm/commands/search/definition.ts`
- `plugins/bm/commands/ai/definition.ts`
- `plugins/bm/commands/update/definition.ts`
- `plugins/bm/commands/revise/definition.ts`
- `plugins/journal/definition.ts`
- `plugins/todo/commands/duel/definition.ts`
- `plugins/todo/commands/add/definition.ts`
- `plugins/todo/commands/update/definition.ts`
- `plugins/todo/commands/revise/definition.ts`
- `plugins/todo/commands/ai/definition.ts`
- `plugins/browser/commands/run/definition.ts`
- `plugins/job/commands/revise/definition.ts`
- `plugins/job/commands/ai/definition.ts`

These are the commands most likely to be affected by text-token semantics and should be included in regression tests.

## Test plan

### Unit tests for structured parsing

Add tests for `parseStructuredInput()`:

- simple required string argument
- variadic string argument with spaces
- variadic string argument containing `--flag` text
- integer coercion
- boolean option coercion
- required argument missing
- unknown argument/option payload keys, if we choose to reject them
- multiple option arrays

### Unit tests for text `--`

Add tests for `parseCliInput()`:

```text
sub --flag value text
sub -- text --flag value
sub text -- unknown-before-end
sub -- --literal
```

### Integration smoke tests

Use `nr` because it exposes the original failure clearly:

1. Web-style structured call to `nr parse` with event JSON containing:
   - `-- Marcus Aurelius`
   - `--force-reclassify`
   - newlines
   - quotes
2. Text call:

```text
/nr parse -- {"content":"hello --force-reclassify"...}
```

3. Existing common variadic commands still work:
   - `todo add hello world`
   - `bm search nostr bitcoin`
   - `file search some phrase`
   - `browser run open example.com and click login`

## Risks and mitigations

### Risk: plugin adapters ignore structured payload

Mitigation: shared helper and plugin-template update.

### Risk: web timeline display loses full invocation text

Mitigation: separate display string from parsed execution data. Do not require display string to be reparsable.

### Risk: variadic arrays vs single string shape changes

Mitigation: structured parser should mimic current `ParsedCliInvocation` shape. For a variadic string submitted as a string, use a single-element array.

### Risk: existing text commands using literal `--`

Mitigation: bare `--` behavior is standard. Document it. Literal `--` can be passed after `--` as the first positional token if needed:

```text
/cmd sub -- --
```

### Risk: core API mismatch for published plugins

Mitigation: after migrating official plugins, update package `appweaver.coreApiVersion` / `coreApiVersion` to the new core version and regenerate plugin skills/registries.

## Open decisions

1. Should structured web parsing reject unknown argument/option keys, or ignore them?
   - Recommended: reject unknown keys for safety and debugging.
2. Should `parseStructuredInput()` live in `src/system/parser-cli.ts` or a new file like `src/system/parser-structured.ts`?
   - Recommended: same module initially, because output schema and coercion are shared.
3. Should quote-aware text tokenization be included now?
   - Recommended: no. Add bare `--` first, then consider quote-aware tokenizer as separate work.
4. Should `webInput: 'textarea'` remain?
   - Recommended: yes, as a UI hint only. Do not require it for transport correctness.
