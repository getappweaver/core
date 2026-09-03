# New Bottom-Up Design

## Status

This document consolidates the decisions from the bottom-up redesign Q&A. It replaces the earlier conversational notes with the current proposed specification.

The primary goals are:

- Reduce the source reads and tokens agents need to understand a codebase.
- Reuse knowledge already learned by the agent doing the work.
- Incrementally analyze only changed or explicitly requested source scopes.
- Keep source-grounded and context-enriched knowledge separate.
- Store one canonical machine-readable representation without duplicated generated Markdown.
- Let users review all AI-generated index changes before accepting them.

## Core Model

The system has four operations:

### `bottomup.generate`

Incrementally creates source-grounded knowledge for a requested subtree.

It answers:

> What do these files and directories do based on their source?

### `bottomup.summarize`

Recursively combines generated knowledge into compact higher-level summaries.

It answers:

> What is the concise big picture represented by the generated records below this directory?

### `bottomup.enrich`

Adds contextual meaning to existing source-grounded knowledge.

It answers:

> What role does this file or directory play given its surrounding architectural context?

### `bottomup.summary`

Reads and renders stored knowledge without an AI call.

It answers:

> What does the current index already know about this path?

The first three operations may create AI-generated changes. `bottomup.summary` is read-only.

## Canonical Storage

Only JSON is persisted as canonical state. Each analyzed directory has a hidden `.BOTTOMUP.json` file:

```text
src/
  .BOTTOMUP.json
  commands/
    .BOTTOMUP.json
    wallet/
      .BOTTOMUP.json
```

The old generated Markdown artifacts were removed and replaced by structured JSON records. There is no migration; the JSON index starts from scratch.

Human-readable and agent-readable Markdown is rendered on demand:

```text
bottomup.summary --path .
bottomup.summary --path src/commands
bottomup.summary --path src/commands --format json
```

An optional Markdown export may be supported later, either through explicit file name/location options or by returning a buffer the user can save. Export design is outside the initial scope. Any export is a projection rather than canonical state and must never become a second source of truth.

The `.BOTTOMUP.json` files are tracked by Git by default. A local-only configuration may be supported for users who do not want to commit the index.

Serialization must minimize noisy diffs:

- Use stable key ordering.
- Use workspace-relative paths.
- Do not add timestamps that change on every run.
- Do not rewrite unchanged records.
- Do not persist model-specific metadata unless it is needed for diagnostics.

## Record Granularity

Each directory record stores separate entries for its direct source files and its own directory-level knowledge.

Illustrative shape:

```json
{
  "schemaVersion": 1,
  "scope": {
    "root": false
  },
  "files": {
    "handler.ts": {
      "fileHash": "...",
      "sourceInputHash": "...",
      "sourceSummary": "...",
      "enrichmentInputHash": "...",
      "enrichedSummary": "...",
      "provenance": {
        "source": "agent-supplied"
      }
    }
  },
  "directory": {
    "sourceInputHash": "...",
    "sourceSummary": "...",
    "summaryInputHash": "...",
    "summary": "...",
    "enrichmentInputHash": "...",
    "enrichedSummary": "..."
  },
  "context": {
    "value": "...",
    "origin": "agent",
    "inputHash": "..."
  },
  "coverage": {
    "complete": true,
    "missing": [],
    "stale": []
  }
}
```

The exact schema will be iterated while testing the system, but it must preserve these distinctions:

- Actual source state
- Source-grounded summaries
- Compact hierarchical summaries
- Contextual enrichment
- Persisted architectural context
- Coverage and validity inputs
- Provenance

## Separate Source And Enriched Knowledge

Source summaries and enriched summaries must not overwrite each other.

```text
sourceSummary
  What the source itself establishes.

enrichedSummary
  What the node means in the surrounding system.
```

This prevents source regeneration from destroying useful architectural knowledge and makes it possible to distinguish source-backed claims from contextual interpretation.

Enrichment should add contextual information rather than repeat the source summary. A rendered human view can present them as:

```markdown
## Purpose
Source-grounded description.

## Role in the System
Additional contextual relationships and architectural role.
```

Only valid enrichment is included in the normal rendered view. An old enrichment may remain stored for inspection, but hash validation determines whether it is current.

## Root And Scope Resolution

Operations have a requested path and a logical root:

```bash
bottomup.generate \
  --path plugins/todo/commands/create \
  --root plugins/todo
```

Root resolution is:

1. Use an explicit `--root` when supplied.
2. Otherwise walk upward from `--path` and use the nearest `.BOTTOMUP.json` marked as a root.
3. If no marked root exists, use the workspace root.

The root must contain the requested path. A one-level generation writes the requested directory's record; it does not generate intermediate or ancestor directory records merely to fill the path to the root. Missing intermediate knowledge is reported as incomplete coverage and can later be generated or created by recursive summarization.

Nested roots are allowed. A nested root is a default scope marker, not a hard isolation boundary.

For example:

```text
project/.BOTTOMUP.json          root
plugins/todo/.BOTTOMUP.json     nested root
```

An operation started under `plugins/todo` defaults to the Todo root. An operation with `--root .` can summarize or enrich the whole workspace, including Todo.

## Generate Workflow

`bottomup.generate` analyzes one directory level by default. It reads direct source files in the requested directory, writes that directory's `.BOTTOMUP.json`, and records child directories as ungenerated coverage without descending into them.

This allows gradual indexing:

```bash
bottomup.generate --path src/commands/help --root .
bottomup.generate --path src/commands/wallet --root .
bottomup.generate --path src/commands/session --root .
```

The default one-level operation:

1. Resolves the logical root.
2. Enumerates direct source files and child directories under the requested path.
3. Hashes direct source files.
4. Reuses valid file records.
5. Uses trusted agent-supplied knowledge for changed files when available.
6. Uses focused AI analysis for missing knowledge.
7. Produces the requested directory's file and directory source records.
8. Marks ungenerated child directories as incomplete coverage.

Generation does not need to process every sibling command or the entire workspace at once.

When a directory requires an AI call, raw source is included only for changed or new files. Hash-current files contribute their stored source summaries instead. The worker receives each omitted file's exact path and may use a targeted file-read tool only when the stored summary is genuinely insufficient; it must not reread unchanged source by default.

### Recursive Generation

Bulk initialization is explicit:

```bash
bottomup.generate --path plugins/todo --root plugins/todo --recursive
```

`--recursive` generates the requested directory and all included descendant directories. It may use independent fresh worker sessions internally and applies generated records without a review draft. It may be combined with `--enrich` when explicit or saved effective context is available, allowing a context-aware subtree bootstrap in one command.

`--recursive` and `--draft` are mutually exclusive. Passing both is an error:

```text
bottomup.generate --path plugins/todo --recursive --draft
→ error: --draft is only supported for one-level generation
```

This keeps reviewed generation local and easy to understand while retaining a practical command for initial full-subtree indexing.

### Agent-Supplied Knowledge

The agent that implemented a feature may provide source knowledge it already learned:

```json
{
  "learned": {
    "src/auth/session.ts": {
      "sourceSummary": "Adds session rotation and invalidates the previous refresh token."
    }
  }
}
```

The tool:

- Verifies the file exists.
- Binds supplied knowledge to the file's current hash.
- Records agent-supplied provenance.
- Avoids another AI analysis call for that knowledge.
- Generates missing records normally.

This is one of the main token-saving mechanisms: the coding agent does not need to pay another agent to rediscover code it just changed.

## Recursive Summarization

`bottomup.summarize` creates compact summaries hierarchically instead of flattening all descendant records into one prompt.

```text
file records
     ↓
feature directory summary
     ↓
subsystem summary
     ↓
root summary
```

For example:

```text
commands/create records ─┐
commands/list records   ─┼→ commands summary
commands/delete records ─┘         ↓
                              plugin summary
```

A higher-level AI call receives immediate child summaries, not every source file and every descendant record. If an intermediate summary is missing or stale, recursive summarization rebuilds it first.

The compact root summary is intentionally bounded and should contain:

- System purpose and architecture
- Major directories and responsibilities
- Important cross-directory relationships
- Entry points and operational flows
- Architectural constraints

It should remain concise and bounded. Exact numeric size or token budgets are outside the initial scope. Detailed file knowledge stays in lower directory records and is retrieved only when needed.

### Partial Summaries

Summarization is useful before the index is complete.

By default:

```text
bottomup.summarize --path <path>
```

returns and stores the best available summary and marks it incomplete. Coverage is stored structurally:

```json
{
  "coverage": {
    "complete": false,
    "missing": ["src/commands/bunker"],
    "stale": ["src/commands/wallet"]
  }
}
```

Strict mode is explicit:

```text
bottomup.summarize --path <path> --no-partial
```

This fails when included source contains missing or stale generated records.

Completeness refers only to files and directories included by the requested scope and ignore configuration. It does not mean every entry in the physical workspace.

Completing a previously missing area changes the relevant summary hashes. The earlier partial summary was still valuable, but it becomes stale and can be regenerated.

## Enrichment Workflow

`bottomup.enrich` uses source summaries, compact parent summaries, and saved architectural context to produce separate enriched summaries. When explicit and saved context are both absent, the nearest valid root or ancestor compact summary supplies the initial big-picture context.

Enrichment prompts use stored source and child summaries rather than raw source content. The worker may perform a targeted file-tool read only when a specific stored summary is genuinely insufficient; it must not reread source by default.

Enrichment requires complete coverage by default:

```text
bottomup.enrich --path <path>
```

If any included area is missing or stale, the operation fails.

Partial enrichment must be requested explicitly:

```text
bottomup.enrich --path <path> --allow-partial
```

In this mode, missing or stale nodes are skipped and valid nodes are enriched. The resulting enrichment records that their input context was incomplete. When the missing source is later generated and summarized, changed input hashes invalidate the affected enrichment.

The parent summary remains valuable even while partial; strictness applies to whether enrichment may proceed, not whether a partial summary may exist.

The calling agent may provide either or both of:

- Broad context that guides the enrichment worker.
- Completed `enrichedSummary` values that avoid another AI call.

Directly supplied enriched summaries are bound to current input hashes and stored with provenance.

## Persisted Context

Each directory may contain saved architectural context. This context survives later operations and participates in validity hashes.

Context may originate from:

- A user prompt
- A previous agent generation
- Context injected by the coding agent
- Existing generated summaries

Standalone enrichment persists one broad root context unchanged across the subtree. It does not persist model-expanded effective context at each level; local parent summaries and roles are assembled only for the next prompt. Raw user instructions and raw coding-agent handoffs are not written into `.BOTTOMUP.json`.

Actual source evidence has the highest authority. A user correction may override a previous AI-generated summary, because an AI summary is not itself source evidence. If user-provided architectural intent conflicts with actual source, the agent should report the conflict rather than silently discard either side.

### Context Inheritance

The current proposed inheritance model is:

- A directory's explicit context supplements inherited context rather than replacing it.
- Generation receives applicable root/ancestor context and local context.
- Summarization uses direct source summaries and immediate child compact summaries without contextual enrichment.
- Enrichment passes a child the broad root context plus its direct parent's compact summary and architectural role.
- Sibling details reach one another only through their common parent summary.

This keeps prompts local and lets context hashes invalidate only affected descendants.

## Initial Command Input Schemas

The command inputs use snake_case in structured tool calls and named kebab-case flags in the CLI. These schemas are the initial contract and may be refined during implementation without changing the settled command semantics.

### Shared Inputs

```ts
type BottomupCommonWriteInput = {
  // Required named path. Workspace-relative; "." means workspace root.
  path: string;

  // Explicit logical root. Null uses nearest marked root, then workspace root.
  root: string | null;

  // Existing source-discovery behavior.
  respect_gitignore: boolean; // default: true
  include_hidden: boolean; // default: false
  extra_ignore: string[]; // default: []

  // AI operation controls.
  model: string | null;
  prompt: string | null;

  // Knowledge explicitly handed off by the calling coding agent.
  // Tool/API input only; not exposed as a normal CLI text flag.
  agent_context: BottomupAgentContext | null;

  // Execution modes.
  draft: boolean; // default: false; web only
  plan: boolean; // default: false
};

type BottomupAgentContext = {
  // Broad architectural knowledge already held by the caller.
  context: string | null;

  // Trusted normalized knowledge for paths the caller already understands.
  files: Record<
    string,
    {
      source_summary?: string;
      enriched_summary?: string;
    }
  >;

  directories: Record<
    string,
    {
      source_summary?: string;
      enriched_summary?: string;
    }
  >;
};
```

`prompt` contains optional user instructions for the operation. `agent_context` is the structured bridge from the current coding-agent session to the fresh bottom-up worker session. Raw prompt and handoff content are draft inputs and are not persisted in `.BOTTOMUP.json`; only accepted normalized knowledge and required hashes/provenance are persisted.

CLI mapping:

```text
path               → --path <directory>
root               → --root <directory>
respect_gitignore  → enabled by default; --no-gitignore sets false
include_hidden     → --include-hidden
extra_ignore       → --ignore <comma-separated-patterns>
model              → --model <provider/model>
prompt             → --prompt <text>
draft              → --draft
plan               → --plan
```

### `bottomup.generate`

```ts
type BottomupGenerateInput = BottomupCommonWriteInput & {
  type: "bottomup.generate";

  // Descend into child directories. Default generation is one level.
  recursive: boolean; // default: false

  // One-level fast path: create source and enriched records together.
  enrich: boolean; // default: false

  // Explicit big-picture input for the combined enrichment fast path.
  // Requires enrich=true.
  context: string | null;
};
```

Additional CLI flags:

```text
recursive  → --recursive
enrich     → --enrich
context    → --context <text>
```

Validation:

- `recursive=true` and `draft=true` are incompatible.
- `recursive=true` and `enrich=true` may be combined when effective context is available. This is the context-supplied fast path and does not replace hierarchical summarization.
- A non-null `context` requires `enrich=true`.
- `enrich=true` may omit `context` only when valid saved context or a valid generated parent summary is available.
- `draft=true` requires a web interaction.
- `plan=true` performs no AI calls, writes, or draft creation; other execution-mode flags are reported but not executed.
- In one-level mode, supplied file knowledge must refer to direct files in `path` and supplied directory knowledge must refer to `path` itself.

Examples:

```bash
bottomup.generate --path plugins/todo/commands/create

bottomup.generate \
  --path plugins/todo/commands/create \
  --enrich \
  --context "Todo plugin architecture and this command's role" \
  --draft

bottomup.generate \
  --path plugins/todo \
  --root plugins/todo \
  --recursive
```

### `bottomup.summarize`

```ts
type BottomupSummarizeInput = BottomupCommonWriteInput & {
  type: "bottomup.summarize";

  // Reject missing or stale generated coverage instead of writing a
  // summary marked incomplete.
  no_partial: boolean; // default: false
};
```

Additional CLI flag:

```text
no_partial  → --no-partial
```

Validation:

- Summarization is recursive and hierarchical by definition; it has no `recursive` flag.
- `no_partial=false` stores the best available summary with structured incomplete coverage.
- `no_partial=true` fails before AI work if required generated coverage is missing or stale.
- `agent_context` may supply relevant learned directory knowledge, but summarization remains derived from accepted source-grounded records and must not consume enriched summaries as an input.

Examples:

```bash
bottomup.summarize --path plugins/todo
bottomup.summarize --path plugins/todo --no-partial --draft
```

### `bottomup.enrich`

```ts
type BottomupEnrichInput = BottomupCommonWriteInput & {
  type: "bottomup.enrich";

  // Skip missing/stale nodes instead of requiring complete coverage.
  allow_partial: boolean; // default: false

  // Regenerate even when enrichment input hashes are unchanged.
  force: boolean; // default: false

  // Optional explicit big-picture context. Standalone enrichment persists
  // this broad context without recursively expanding it at each level.
  context: string | null;
};
```

Additional CLI flags:

```text
allow_partial  → --allow-partial
force          → --force
context        → --context <text>
```

Validation:

- Complete generated and summarized coverage is required by default.
- `allow_partial=true` skips missing or stale nodes and records incomplete contextual inputs.
- `force=false` skips nodes whose enrichment input hashes are already current.
- `force=true` requests regeneration even when hashes match.
- Directly supplied `enriched_summary` values may avoid worker AI calls when they are valid for the current source and effective context inputs.

Examples:

```bash
bottomup.enrich --path plugins/todo

bottomup.enrich \
  --path plugins/todo \
  --context "Treat commands as the plugin's public operation boundary" \
  --draft

bottomup.enrich --path plugins/todo --allow-partial
```

### `bottomup.summary`

`summary` is read-only and does not use the shared AI-writing input.

```ts
type BottomupSummaryInput = {
  type: "bottomup.summary";
  path: string;
  root: string | null;

  format: "markdown" | "json"; // default: "markdown"

  // Number of stored parent/child levels to include around the requested
  // path. Null allows command defaults.
  parent_depth: number | null;
  child_depth: number | null;

  // Optional workspace-relative path for an exported projection.
  location: string | null;

  // Web-only preview with an optional save form.
  draft: boolean;
};
```

Ordinary reads default to one child level to keep agent context bounded. Web previews and explicit exports default to the complete descendant hierarchy unless `child_depth` is supplied. Their Markdown uses directory paths as nested headings and includes direct file records for every rendered directory.

CLI mapping:

```text
path          → --path <directory-or-file>
root          → --root <directory>
format        → --format markdown|json
parent_depth  → --parent-depth <number>
child_depth   → --child-depth <number>
location      → --location <workspace-relative-path>
draft         → --draft
```

Examples:

```bash
bottomup.summary --path plugins/todo
bottomup.summary --path plugins/todo/commands/create --parent-depth 2
bottomup.summary --path plugins/todo --format json
bottomup.summary --path plugins/todo --location plugins/todo/BOTTOMUP_SUMMARY.md
```

### Stateless Web Draft Actions

Draft state is returned to the web client and carried into the next action. It is not stored in a plugin database or project file.

```ts
type BottomupDraftState = {
  version: 1;
  operation:
    | BottomupGenerateInput
    | BottomupSummarizeInput
    | BottomupEnrichInput;

  // Hashes used to reject acceptance after concurrent source/index changes.
  base_hashes: Record<string, string>;

  // Complete proposed canonical contents keyed by workspace-relative path.
  proposed_files: Record<string, string>;

  // Reused only while revising this one draft conversation.
  agent_session_id: string;
};

type BottomupDraftReviseInput = {
  type: "bottomup.draft.revise";
  state: BottomupDraftState;
  prompt: string;
};

type BottomupDraftAcceptInput = {
  type: "bottomup.draft.accept";
  state: BottomupDraftState;
};
```

Decline is client-side disposal and requires no server state mutation. Revise returns replacement state plus a new unified diff. Accept validates the draft schema, workspace paths, source/index base hashes, and proposed JSON before atomically writing all proposed files.

## Hash-Based Validity

Staleness is derived from deterministic hashes rather than maintained with mutable stale flags.

### Source Validity

```text
sourceInputHash = hash(file contents, source schema/prompt version)
```

For a directory:

```text
directorySourceInputHash = hash(
  direct file records,
  immediate child source summaries,
  source schema/prompt version
)
```

### Summary Validity

```text
summaryInputHash = hash(
  immediate child summaries,
  direct source records,
  applicable context,
  summary schema/prompt version
)
```

### Enrichment Validity

```text
enrichmentInputHash = hash(
  current source summary,
  current compact summary input and value,
  direct parent effective context,
  applicable saved context,
  enrichment schema/prompt version
)
```

This gives automatic propagation:

1. A file changes.
2. Its source input hash no longer matches.
3. Its directory source input changes.
4. Ancestor summary inputs change.
5. Effective parent context changes.
6. Descendant enrichment inputs no longer match.

Schema or prompt versions participate in hashes so analysis behavior changes invalidate old results predictably. The model name does not participate by default. Merely switching models should not invalidate the index unless regeneration is explicitly requested.

## Session And Context Handoff

Bottom-up work must not depend on implicit access to the calling agent's live session.

The current implementation already starts independent sessions because `runAiPrompt` passes `sessionId: null`. The redesigned behavior keeps fresh sessions for independent AI operations.

Each generation, summarization, or enrichment unit receives all required inputs explicitly:

- Relevant source or stored records
- Immediate child summaries
- Applicable saved context
- Optional user instructions
- Structured knowledge injected by the calling agent
- Operation schema and instructions

Fresh sessions provide:

- Bounded context growth
- Predictable token usage
- Independent retries
- Safe future parallelism
- No coupling to the caller's backend or conversation

The bridge from the coding agent is explicit:

```text
current coding-agent session
        ↓ structured handoff
bottomup operation
        ↓
fresh bottom-up worker session
```

Raw handoff text is a draft input only. Accepted normalized knowledge is persisted; the raw conversation is not.

The exception is revision of an existing draft. Revisions reuse that draft's worker session because they are continuations of one review conversation. After acceptance, independent directory processing still uses fresh sessions with the accepted context supplied explicitly.

## Execution Plan

`generate`, `summarize`, and `enrich` support a common read-only `--plan` flag:

```bash
bottomup.generate \
  --path plugins/todo/commands/create \
  --plan
```

The plan performs no AI calls, writes no files, and creates no draft. It reports:

- Normalized requested path
- Resolved root
- Whether the root was explicit, inferred from the nearest marked ancestor, or provided by workspace fallback
- One-level or recursive generation mode
- Effective ignore and scope configuration
- Current, stale, missing, and ungenerated records
- Estimated AI operations
- JSON files that may be affected
- Option incompatibilities or completeness blockers

Example with an inferred root:

```text
Operation: generate
Path: plugins/todo/commands/create
Resolved root: plugins/todo
Root source: nearest marked ancestor
Mode: one level

Coverage:
  Direct files: 4
  Current: 2
  Stale: 1
  Missing: 1

Expected work:
  AI generation calls: up to 1
  Proposed JSON files: 1
```

Example with workspace fallback:

```text
Resolved root: .
Root source: workspace fallback

Warning: No marked bottom-up root was found between
plugins/todo/commands/create and the workspace root.

Rerun with:
  --root plugins/todo
```

The resolved root and execution scope also appear in normal drafts so the user can detect an incorrect scope before acceptance.

## Draft Workflow

Command paths are named arguments. The AI-writing commands support explicit web draft mode as follows:

```text
bottomup.generate --path <path> --draft               one level only
bottomup.summarize --path <path> --draft
bottomup.enrich --path <path> --draft
```

Recursive generation never supports drafts. A one-level `generate --draft` proposes changes for one directory record and requires one acceptance. It does not create a multi-step acceptance cycle.

Drafting is not the default. Without `--draft`, generate, summarize, and enrich apply their successful results immediately.

`--draft` is supported only through the web interface, whose folder-menu shortcuts pass it explicitly. A non-web invocation with `--draft` fails because there is no interactive review lifecycle to carry the draft state.

The folder overflow menu in the UI can expose:

```text
Generate...
Summarize...
Enrich...
```

The operation UI shows:

```text
Existing saved context
(read-only)

Optional instructions
[textarea]

[Generate / Summarize / Enrich]
```

When invoked by a coding agent, the command also receives structured knowledge prepared from that agent's current understanding. This injected handoff may be absent for a user-initiated UI operation.

The initial operation uses a fresh worker session and creates a draft containing all proposed `.BOTTOMUP.json` changes outside the working tree.

Drafts have no durable database or filesystem storage. Draft state exists only in the web interaction and is carried into each subsequent action. A revision request carries the current proposal, its base hashes, the worker session identifier, and the new revision instructions. The returned replacement state is then carried into the next revise, accept, or decline action. Reloading or abandoning the interaction may discard the draft.

The review UI then shows:

```text
Existing knowledge ↔ proposed knowledge

Revision instructions
[textarea]

[Revise] [Accept] [Decline]
```

Behavior:

- **Revise:** send corrections through the draft's existing worker session, update the proposal, and show a new diff.
- **Accept:** atomically write all proposed `.BOTTOMUP.json` records.
- **Decline:** discard the proposal without modifying index files.

The review uses the usual unified Git diff format for the proposed `.BOTTOMUP.json` files. Ordinary `git diff` cannot compare an unwritten in-memory proposal directly, but the implementation may materialize transient old/new files and call `git diff --no-index`, or generate an equivalent unified diff in memory. No proposed file is written into the workspace before acceptance.

Manual editing of proposed records is deferred. Users guide changes through revision prompts for now, and the accepted result remains agent-produced.

### Acceptance Safety

The draft records the source and index hashes on which it was based. If relevant source files change before acceptance, acceptance fails for the entire draft and lists the changed paths.

The system must not partially apply unaffected records. The user can regenerate the draft against current source.

## Agent Skill Workflow

A bottom-up skill should teach agents to use the index before broad source exploration.

### Summary-First Discovery

Before reading source files, the agent should:

1. Resolve the applicable bottom-up root.
2. Call `bottomup.summary` for the root or nearest relevant directory.
3. Read compact parent and local knowledge.
4. Drill into source only where stored knowledge is absent, stale, or insufficient.

This keeps context usage proportional to the task instead of loading the entire index or source tree.

### End-Of-Task Update

Bottom-up updates are not automatic and are not mandatory.

When a task appears complete and semantic source changes were made, the agent should:

1. Ask whether the user wants to update bottom-up knowledge.
2. Explain that it can reuse knowledge learned during the current session.
3. If approved and a web review flow is available, prepare structured context and learned summaries and invoke one-level `generate --draft` for the affected directory, or the appropriate summarize/enrich command with `--draft`.
4. If no web review flow is available, obtain confirmation before invoking the corresponding immediate non-draft command.
5. Let the user review, revise, accept, or decline any resulting draft.
6. Mention the bottom-up update status in the final task summary.

The agent should not prompt for formatting-only, comment-only, or otherwise non-semantic changes. If the user declines or does not complete the review, the final summary should note that bottom-up knowledge was not updated.

Generated index files remain tool-owned. The coding agent supplies knowledge to the tool instead of manually editing `.BOTTOMUP.json`.

## Efficiency Principles

The design reduces token cost through several complementary mechanisms:

- Agents read compact summaries before source.
- Generation is scoped and incremental.
- Current file hashes reuse valid records.
- Coding agents inject knowledge they already learned.
- Trusted supplied file and enrichment summaries avoid redundant AI calls.
- Summarization is hierarchical rather than flattened.
- Each AI prompt receives immediate local inputs rather than the entire repository.
- Source and contextual invalidation are independent.
- Enrichment runs only when its contextual inputs require it.
- Fresh sessions prevent unrelated context from accumulating.
- Draft review prevents low-quality generated knowledge from entering the canonical index.

## Example End-To-End Flow

An agent implements a new Todo create command.

```text
1. Agent reads bottomup.summary --path plugins/todo.
2. Agent reads only the relevant source files.
3. Agent implements and verifies the feature.
4. Agent asks whether to update bottom-up knowledge.
5. User approves.
6. Agent calls bottomup.generate --path plugins/todo/commands/create --draft
   with learned file knowledge and feature context.
7. Fresh worker session creates proposed JSON records.
8. User reviews the semantic diff.
9. User revises or accepts.
10. Accept atomically writes the records.
11. bottomup.summarize --path plugins/todo --draft recursively refreshes compact summaries.
12. User reviews and accepts the summary draft.
13. bottomup.enrich --path plugins/todo --draft uses complete summaries and saved context.
14. User reviews and accepts enrichment.
```

These stages may be run separately. Generation does not automatically force summarization or enrichment.

## Iterative And Deferred Decisions

The initial implementation can proceed without settling these details:

- The exact `.BOTTOMUP.json` schema will evolve through implementation and testing.
- The proposed context inheritance rules may gain exceptions after practical use reveals a need.
- Numeric size and token budgets are deferred.
- Optional Markdown export arguments and save behavior are deferred.
- Parallelism and concurrency limits are deferred, though the fresh-session design should not prevent adding them later.
- A local-only index mode remains optional and deferred; indexes are tracked by default.

Source discovery and coverage use the existing `respect_gitignore` behavior rather than introducing a new ignore configuration model for the initial implementation.
