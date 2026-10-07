# Memory / Second Brain

Status: design in progress. The code-module decisions below are agreed;
broader memory features and implementation details remain open. The template
exists in `plugins/memory`; Milestone 1 code and CLI integration are implemented.
Verification results and remaining limitations are recorded under that milestone.

## Why

AppWeaver knowledge is scattered: workspace code, markdown docs, bottom-up
`.BOTTOMUP.json`, app DBs (todo, bookmarks, journal, jobs), core DB
(`dm-bot.sqlite`: `state`, `sessions`, `session_messages`), and later
pdf/docx. Agents re-discover the same context every run. A local second brain
gives one place to ask "what do we know about X?" with citations back to the
source.

If we had it:
- `search "job scheduler retry"` finds code + docs + todos + past conversations.
- `ask "where must I update if branding changes?"` answers with
  `docs/BRANDING.md#places-to-keep-in-sync` citations.
- Apps link to each other: `todo#123 --child-of--> meeting#122`,
  `bookmark --about--> topic`, traversable up to 3 hops.
- All local-first: SQLite + FTS5, no external API dependency.

## Settled

1. **Push, not pull.** Supplier calls memory right after its own commit via
   `bun src/cli.ts memory <tool> '<json>'`. Memory owns how to upsert.
   Example: todo app adds item, then calls
   `memory update-graph` with the new triplet.
2. **Explicit supplier identity.** Payload carries `sourceId` + `kind`
   (`app-db`, `md-chunk`, `core-db`...). No core-derived caller magic, no
   provider-registry lookup in v1.
3. **Git sync is commit-only, per-repo.** Automatic indexing is opt-in for each
    project. Its post-commit hook invokes shared `parse`; the command owns initial
   indexing, change detection, and rebuilding. Compare against the last
   successfully indexed baseline, not just `HEAD~1`, so missed runs can catch up.
   No dirty/untracked source indexing in v1.
4. **Query is `memory` plugin `ai.ts` tools** with zod schemas, callable via
   `src/cli.ts` like `file bottomup.summary`. The first code module exposes
   `code.parse`, `code.search`, `code.inspect`, and `code.expand`. General
    search now combines code and Markdown indexes; general ask and supplier ingestion
    remain later features.
5. **Triplet model.** `Subject --relation--> Object`, e.g.
   `prepare presentation#123 --child-of--> tomorrow's meeting#122`.
   Exact relations from apps (parent/child, tags, links) need no LLM.

## Open / deferred

- **Consumer contract:** whether `memory.query:v1` becomes a core contract in
  `src/capabilities/` (multiple memory implementations) or stays app-private.
  Decide after the initial code module establishes useful features and shapes.
- **Vectors:** local embedding/runtime choice remains deferred. Markdown now uses
  heading sections and bounded block-oriented chunks with local FTS5, per design Q&A.
- **pdf/docx:** extractor choice deferred to a later ingestion milestone.
- **Core DB privacy:** allowlist for `sessions`/`session_messages`/`state`
  not yet defined. Never index secrets.
- **Cross-project code queries:** deferred. Explore how to connect references
  between separately indexed projects, identify shared symbols, and report
  coverage and freshness when projects have different indexed revisions.
  The first version does not search or traverse across projects.
  External references already provide typed follow-up actions for a separate
  project query; this is navigation, not automatic cross-project traversal.

## Code query scope (settled)

- `code.search`, `code.inspect`, and `code.expand` each require one explicitly
  specified project. All three are read-only, Zod-typed tools exposed through
  the Memory plugin's `ai.ts` and `src/cli.ts`.
- Each project's index is separate in the SQLite database inside
  `plugins/memory`. AppWeaver and its plugin repositories are separate projects.
- Dependencies outside the selected project may be read for TypeScript symbol
  resolution and represented as minimal external references. Queries may show
  those references but do not traverse another project's indexed graph.
- Results include source locations, index freshness, and coverage information.
  `code.inspect` returns signatures, documentation comments, and relationships,
  without full source bodies; agents can read or grep the source separately.

## Code module design (settled)

### Purpose and first targets

Build a deterministic structural map that helps agents locate declarations,
references, callers, and dependencies before reading implementations. Start
with NR (`plugins/nr`), then apply the same workflow to AppWeaver itself.
The graph supports discovery, not a substitute for understanding source behavior.

### Workspace and project selection

- Obtain the workspace from core through
  `ctx.workspace.getActiveTarget()` and `ctx.workspace.rootFor(target)`.
  Capture the effective root once per operation.
- Use `project`, not `path`, as the input. It is the root of a whole TypeScript
  application; relative values resolve against the core-provided workspace.
- Require both `package.json` and `tsconfig.json` at that project root and follow
  the configuration's `extends` chain. Inheritance does not merge project indexes.
  Missing or invalid required configuration blocks parsing.
- Index eligible `.ts` and `.tsx` files within the project. Respect TypeScript
  file selection and `.gitignore`, including nested rules and negations.
- Follow Git semantics: tracked files are not excluded solely because a later
  ignore rule matches them. Ignored, untracked files are not indexed.
- Treat nested plugin repositories as separate projects. AppWeaver's ignored
  `plugins/` directory is not recursively indexed as part of AppWeaver.
- Include eligible test files, label them, and support filtering test code in
  queries. Indexing tests does not execute them.

### Parser and dependencies

Use the TypeScript compiler API with cross-file resolution from the start:
AST traversal plus a project `Program` and type checker. Honor compiler options
and import aliases instead of guessing resolution from import strings.

Packages found in the root installation during design research:

| Package | Version | Assessment |
| --- | --- | --- |
| `typescript` | 5.9.3 | Selected: native TS/TSX AST and semantic analysis |
| `@typescript-eslint/typescript-estree` | 8.67.0 | Alternative for ESTree output |
| `@typescript-eslint/parser` | 8.67.0 | ESLint-oriented wrapper; unnecessary here |
| `espree` | 10.4.0 | JavaScript/JSX parser, not TypeScript syntax |

Declare `typescript` as a Memory runtime dependency. A compatible root-installed
copy may be shared through normal package resolution, but transitive development
dependencies alone are not a runtime availability guarantee. Keep the analyzer
under `plugins/memory`; core supplies workspace services and generic contracts.
No external API, embedding service, or database server is needed.

### Stored metadata and graph

Use plugin-local SQLite through `bun:sqlite`, separating projects and workspaces
by identity in the same database. Store derived compact metadata:

- Symbol name, qualified name, kind, signatures, documentation comments.
- File and declaration locations, test-file labels, indexed revision.
- Structural relationships and their source evidence.
- Project analysis inputs/version, coverage, and freshness metadata.

Do not persist the full AST or full implementation bodies for this module.
Metadata is generated during parsing, not reparsed on every query, and updated
atomically with relationships. Source code remains authoritative.

Candidate node kinds include files, functions, classes, methods, interfaces,
type aliases, and significant variables/properties. Candidate relations include
`declares`, `imports`, `exports`, `reexports`, `extends`, `implements`,
`references`, `calls`, and `typed-as`. Exact extraction coverage and identity
rules still need specification. Never invent a target for dynamic expressions.

### Parsing, idempotency, and errors

- Manual parsing stops on staged or unstaged changes and relevant untracked
  source files, asks the user to commit first, and leaves the index untouched.
  `fresh` does not bypass this requirement.
- Analyze committed content and report the indexed revision. Dependencies and
  inherited configuration also need provenance so results cannot silently mix
  an indexed commit with dirty dependency inputs (see open details below).
- No previous index: analyze the whole project. Changed analysis inputs:
  re-analyze the whole project. Unchanged inputs: skip unnecessary analysis.
  Fine-grained incremental analysis is deferred.
- The input check covers source files, relevant dependencies, configuration,
  file-selection rules, and analyzer version, not just the project commit.
- `fresh: true` forces rebuilding the selected project's derived index;
  unrelated projects remain intact. Exact CLI flags/schema remain to be finalized.
- Save immediately after successful analysis, with no draft review. This is an
  agreed exception for the rebuildable index to the template's mutation flow.
- Atomically replace the project's owned facts, including obsolete facts;
  deterministic identities and uniqueness rules prevent duplicate logical nodes
  and edges. Upsert alone is insufficient for removed declarations/relations.
- Error diagnostics, including syntax/type errors and unresolved imports,
  block the run. Preserve the previous successful index and its baseline.
  Warnings are reported without blocking.
- Blocking diagnostics cover the project and dependencies used to analyze it,
  plus required configuration; unrelated errors elsewhere do not block it.
- Unresolvable dynamic targets are static-analysis limitations, not necessarily
  compiler errors. Report them as unresolved rather than claiming exact edges.
- The opt-in post-commit hook uses the same command. A failed index run reports
  diagnostics and preserves the index; the already-created Git commit remains.

### Tools

All tools use Zod-typed arguments through plugin `ai.ts` and `src/cli.ts`.
Invocation shape (design example, not an implemented command):

```bash
bun src/cli.ts memory code.parse '{"project":"plugins/nr","fresh":true}'
```

| Tool | Behavior |
| --- | --- |
| `code.parse` | Analyze one whole project and immediately save its index |
| `code.search` | Search names, signatures, and documentation; prioritize exact name matches |
| `code.inspect` | Return compact symbol metadata, location, and direct relationships |
| `code.expand` | Traverse incoming/outgoing relationships, capped at three hops |

The three query tools are read-only and require one specified project. Search
results indicate matching fields. No body-return option is planned. Queries
describe the last successful indexed snapshot and report freshness and coverage,
including external-reference boundaries.

### Remaining code-module details

- Final node/edge schemas, declaration identities (anonymous symbols, overloads,
  merged declarations), relation extraction coverage, and evidence ownership.
- Exact query arguments, pagination, ranking/tokenization, result-size budgets,
  cycle handling, and traversal limits beyond the three-hop ceiling.
- Dependency snapshots for NR's core imports and extended configuration: how to
  detect dirty external inputs and associate them with revisions without making
  queries cross-project. Package/environment inputs must also be tracked.
- Project identity across workspace moves, branch switches, and worktrees;
  concurrency control so overlapping runs cannot overwrite newer snapshots.
- Interaction between `tsconfig` root files and imported local files excluded
  from root-file selection, including local declaration files.
- Freshness reporting cost and exact unchanged-input fingerprint strategy.
- Hook installation/chaining with existing release hooks, explicit project
  resolution from hook context, and the settings modal's final visual structure.

## Current sketch

Suppliers (todo, file hook, core adapter) push `{ sourceId, chunks, triples }`.
Memory stores `nodes`, `edges`, `nodes_fts` in its own SQLite, traverses with
`WITH RECURSIVE ... depth <= 3`.

Earlier illustrative proposal for `docs/BRANDING.md` (Markdown choices are superseded by the agreed design below):
- Split by Markdown headings and search title/body with FTS5.
- Preserve structural links and source evidence. Semantic facts such as
  `BRANDING.md --synced-in--> README.md` need explicit extraction rules or an
  optional local model; generic tables/lists do not establish those semantics
  automatically.
- Research optional local embeddings and `sqlite-vec` separately. Vector storage
  does not generate embeddings. No embedding column is committed yet.

## Implementation checklist

This supersedes the earlier P0–P5 sketch. Unchecked items are unimplemented or
unverified; the existing scaffold is a starting point, not a completed milestone.

### Milestone 1 — Manual indexing and queries for NR

#### Investigation findings

- [x] Inspect the Memory scaffold, NR configuration/Git state, current CLI
      execution contracts, and core workspace services; record the plan below.

These are static-inspection findings, not a successful compiler/indexing run:

1. **Memory scaffold draft removal.** `plugins/memory/db.ts` opens
   `plugins/memory/db.sqlite` with foreign keys and WAL. Draft/review commands
   and draft table creation were removed so remaining CRUD operations apply
   immediately. Existing scaffold data and namespaced code-index tables are preserved;
   the dormant empty `memory_drafts` table is not dropped automatically.
2. **CLI registration needs modernization.** `plugins/memory/ai.ts` exports
   `ToolCallSchema`/`executeTool`, but no `aiDefinition`. Both `src/cli.ts` and
   `scripts/generate-tools.ts` require that object; generation requires its
   `toolCallSchema` to be a Zod discriminated union. `plugins/nr/ai.ts` is a
   current example. `MemoryPlugin` also needs its `aiDefinition` attached for
   registered in-process tool invocation.
3. **The template uses obsolete agent types.** Memory's `init.ts` reads
   `context.runAgent`, while current `PluginInvocationContext` exposes `agent`.
   Its adapter types import `RunAgentFn`, which is absent from the current core
   plugin contract. Adapt the old natural-language handler to `PluginAgentService`
   without introducing a second agent runtime or changing its draft semantics.
4. **Workspace service exists, but not in AI tool props.** `PluginContext.workspace`
   provides `getActiveTarget`/`rootFor`; `AiExecuteToolProps` has no workspace field.
   CLI imports `ai.ts` directly and does not initialize `MemoryPluginContext`.
   Do not depend on that module global or copy File's direct core-DB workspace
   lookup. The implemented approach now uses the generic core helper
   `src/core/workspace.ts::resolveActiveWorkspaceRoot` for standalone tools;
   app commands use `PluginContext.workspace` directly. No AI-tool props change
   or Memory-specific core routing was necessary.
5. **NR inherits a workspace-wide configuration.** Its root `tsconfig.json` only
   extends `../../tsconfig.json`. Inherited `include` patterns refer to AppWeaver's
   `src`, `scripts`, `plugins`, and `generated` directories. Parsing that config
   unchanged as a root-file list would select far more than NR. Keep TypeScript's
   effective options and correctly based aliases, but intersect index root files
   with the requested project boundary and Git eligibility.
6. **Git boundaries are useful here.** NR's `.gitignore` excludes SQLite files;
   AppWeaver's excludes `plugins/` and most `generated/` content. Evaluate rules in
   the owning repository: parent `plugins/` exclusion must not exclude NR when
   NR is the explicitly selected project. Imported ignored/generated files may
   still be required for resolution, with evidence/provenance but no full indexing.
7. **Baseline status:** NR had a clean working tree at commit
   `4f1965457d9e1d3a1f339c6e5c6f4e0b2b60d53c`. Memory's scaffold files were
   untracked, and root `docs/MEMORY.md` was untracked. These observations do not
   authorize committing them. Generated plugin registration was empty during
   inspection; validate installed-plugin selection before regenerating tooling.
8. **No compiler-readiness claim yet.** NR imports core code, so strict diagnostic
   policy can block its first index on errors in the dependency closure. Do not
   silently relax that policy or repair unrelated code without investigating the
   actual diagnostics. No tests, compilation, or Memory DB mutation ran during
   this investigation.

#### Technical implementation plan

The following is the technical plan and its reconciled implementation notes.
The service is implemented; verification and remaining limits are listed below.

**A. Separate transport from the deterministic code service.**

Proposed plugin layout:

```text
plugins/memory/
  code/
    schemas.ts       # Zod inputs/results, node/relation vocabulary
    project.ts       # core workspace -> canonical project/repository
    git.ts           # committed trees, ignore selection, dirty inputs
    snapshot.ts      # compiler host and input provenance/fingerprints
    analyzer.ts      # TypeScript Program, diagnostics, extraction
    identity.ts      # deterministic declaration/reference identities
    store.ts         # schema migrations and atomic snapshot publication
    queries.ts       # search/inspect/bounded traversal
    service.ts       # parse lifecycle shared by all entrypoints
  commands/code-parse/{definition,adapter}.ts
  commands/code-search/{definition,adapter}.ts
  commands/code-inspect/{definition,adapter}.ts
  commands/code-expand/{definition,adapter}.ts
  commands/ai/{schemas,execute-tool,agent-instructions}.ts
```

Command adapters and `aiDefinition.executeTool` call the same service. The code
analyzer never imports or executes target project modules and never calls an LLM.
Add `typescript` to Memory's runtime dependencies, using the compatible existing
root installation; do not add a graph database package or ignore-pattern package.

**B. Supply workspace context generically.**

Implemented `src/core/workspace.ts::resolveActiveWorkspaceRoot`, using core's
existing workspace state and canonical AppWeaver/parent paths. Standalone tools
call it directly; app adapters use their stored core workspace service. This
supersedes the earlier proposed `AiExecuteToolProps` extension. Core can already
invoke registered Memory tools in-process without model inference. No direct
core import from `plugins/memory` or Memory-specific CLI branch was added.
Capture workspace root/target once, canonicalize project paths with `realpath`,
and reject project paths outside the authorized workspace, including symlink
escapes. Pass the captured root to services, not a global current-directory guess.

**C. Capture a reproducible Git/TypeScript snapshot.**

1. Resolve `project` to an existing directory with root `tsconfig.json`, owning
   Git repository, and a committed revision. Refuse a repository without commits.
2. Use Git's NUL-delimited status/tree/file commands and argument arrays, not shell
   interpolation or a hand-written ignore matcher. Select committed TS/TSX files
   in the project, with nested repository boundaries and test labels. Untracked
   non-ignored TS/TSX and changed project source/configuration trigger the agreed
   commit-first failure. Indexed content comes from Git blobs, not current files.
3. Load committed `tsconfig` and its `extends` chain through TypeScript's config
   APIs. Preserve option path bases, then narrow root files to the project.
   Config-selected local files and imported local declarations form the proposed
   index closure when Git-eligible and inside the project; outside files are
   resolution inputs/minimal references only. Document this distinction in coverage.
4. Implement a custom `CompilerHost`/config filesystem view. Workspace-owned
   dependency source and config reads use captured revisions of their owning repos,
   with blob caching; installed package declarations and compiler libraries are
   local environment inputs whose hashes/version are recorded. Do not mix Git
   source reads with working-tree module discovery: existence, directory listings,
   and resolution metadata must use the snapshot view too.
5. Record every consumed source, configuration, and module-resolution input,
   including package metadata, lockfiles relevant to the environment, ignore/file
   selection inputs, and analyzer/compiler version. Verify dirty consumed external
   inputs and recheck captured revisions before publication; fail rather than
   silently indexing inconsistent inputs. Do not block on unrelated dirty docs.
6. Unchanged checks validate the previous input manifest and current file inventory,
   including resolution-affecting additions/deletions. If validity is uncertain,
   re-analyze the whole project. `fresh` always bypasses this optimization.

The snapshot host is the main complexity risk: NR's inherited config and imports
cross Git repositories. Implement it explicitly rather than label live compiler
output as committed content. Project references/multiple configs require either
explicit support or a diagnostic in Milestone 1, not silent partial indexing.

**D. Extract supported facts with explicit evidence.**

Build one `ts.Program` over selected roots and dependencies with no emit. Collect
config/options/global diagnostics and syntax/semantic diagnostics for the relevant
closure, respecting configured compiler checks such as `skipLibCheck`. Any error
blocks publication; warnings and dynamic-target limitations remain distinguishable.

Use two passes: declaration metadata/identities, then relationship extraction.
Resolve aliases with the type checker; associate references and calls with their
lexical owners and resolved declarations. Preserve overload declaration locations
under a common symbol where appropriate; merged symbols can have multiple source
locations. Proposed initial relations are `declares`, `imports`, `exports`,
`reexports`, `extends`, `implements`, `references`, `calls`, and explicit
`typed-as`. Report unsupported/dynamic forms without speculative edges.

Identity keys combine canonical project identity, relative file, declaration kind,
and lexical qualified name, with a deterministic disambiguator where needed.
Avoid line-number-only identities. Anonymous nodes may use structural positions
and can change identity on edits; expose that limitation. External targets stay
project-local reference nodes, even if another project's index already exists.
Capture signatures and attached documentation without serializing initializer or
function bodies. Bound generated inferred types to avoid huge signatures and
record truncation when needed.

**E. Persist one replaceable snapshot per project.**

Implemented namespaced tables: `memory_code_schema`, `memory_code_projects`,
`memory_code_nodes`, `memory_code_edges`, and `memory_code_fts`. Compact typed
locations/evidence are stored as JSON on nodes/edges, and input provenance and
negative lookup records as a project manifest, rather than introducing separate
tables for each field. Search is project-filtered FTS5 over names, signatures,
and documentation. Use schema-versioned migrations;
project-scoped unique constraints prevent duplicate facts, and evidence has file
and source-range ownership. Logical edges deduplicate separately from call/reference
occurrences. Store analysis status/provenance, not full ASTs or bodies.

Analyze outside the write transaction. In a short `BEGIN IMMEDIATE` transaction,
check the previously observed project generation, replace only that project's
derived tables and FTS entries, and advance its input manifest/revision/generation.
Foreign-key cleanup removes obsolete evidence/facts. On error, rollback and retain
the old successful snapshot. If another run published first, reject the stale run
instead of overwriting it. WAL allows queries to read the old snapshot during work.

**F. Define bounded, project-scoped tools.**

Proposed arguments, to be encoded as explicit Zod schemas:

| Tool | Arguments |
| --- | --- |
| `code.parse` | `project`, `fresh` |
| `code.search` | `project`, `query`, nullable kind/file filters, test filter, bounded limit/cursor |
| `code.inspect` | `project`, node ID, bounded relationship limit/cursor |
| `code.expand` | `project`, node ID, direction, relation filters, depth 1–3, node/edge budgets |

Search combines exact name priority, normalized identifier matching (including
camelCase/underscore segments), and escaped FTS text queries. Return match fields
and stable tie-breaking. Inspection returns metadata and direct edges/evidence;
expansion uses visited-node deduplication and budgets in addition to depth, with
explicit truncation. Use one SQLite read snapshot per query. No arbitrary SQL,
cross-project graph traversal, or source-body option.

Every success result is validated by its output schema. Code tools render compact
text by default or full JSON with `format: "json"`, through the existing
string-returning CLI contract. Include indexed revision,
coverage/external boundaries, and freshness. Cheap checks can report HEAD drift;
do not claim dependency freshness without manifest validation (use unknown when
not checked). Failed parsing must yield diagnostics and a nonzero CLI exit, not
only a success-exit error string. The CLI's current catch/exit path can carry a
structured diagnostic error message; align app command handling with the same
service result without adding a Memory-specific CLI branch.

**G. Integrate and verify in small increments.**

Modernize the scaffold's agent/AI contracts first; add typed schemas/service and
SQLite migrations; build snapshot selection and compiler analysis; then wire the
four tools, command help, and generated skill/CLI registration. Preserve existing
draft CRUD data/behavior unless a separate removal is agreed. Inspect generation
diffs so unrelated plugins/skills are not silently dropped or enabled.

Run targeted ESLint with `--fix` for plugin changes and appropriate broader lint
for shared core type changes. NR's first actual parse is an explicit DB-mutating
verification step; record returned diagnostics and counts when that execution is
requested. Do not check off NR exit criteria based on static inspection, and do
not add/run tests without user request. No browser verification is needed here.
Backend/core changes require a deliberate host restart before app testing; never
touch `restart.requested` from the active AppWeaver chat.

#### Readiness and next implementation step

Implemented service layout is `code/{schemas,project,snapshot,analyzer,store,
queries,service}.ts`, with identity logic inside the analyzer and shared code
command definitions in `commands/code/definition.ts`. The draft/review commands
and tables were removed, and remaining CRUD operations execute directly against
SQLite. Memory's scaffold was modernized locally; the template generator was
updated to make draft scaffolding optional.

Current limits: project identity is its canonical root path; project moves and
multiple referenced tsconfigs need later work. Snapshot file matching uses
TypeScript's runtime `matchFiles` export, guarded at runtime, with the installed
5.9.3 compiler. Workspace-owned committed files use Git blobs; ignored generated
dependencies and installed package declarations are explicitly hashed auxiliary
inputs. Queries report dependency freshness as unknown rather than re-running
analysis. Callbacks/computed/anonymous targets without a supported declaration
are limitations, not invented call edges. Evidence is capped at 20 locations with
counts/truncation; signatures at 2,000 characters each (up to 10), docs at 4,000.

#### Compact output refinement

Agreed after comparing verbose search JSON: all four code tools accept
`format: "text" | "json"`, defaulting to text, with the equivalent `--format`
app-command option. Typed result schemas and the stored index remain the common
source for both renderings; no reindex is required for presentation changes.

- Text search omits signatures/comments while continuing to search those fields.
  It returns names, kinds, full callable IDs, locations, matching fields, and
  external-reference markers. Short-ID lookup is not introduced.
- Text inspection supplies signatures/docs and direct relationships; expansion
  uses a numbered node table and compact subject/relation/object lines. Numbers
  are local display references; subsequent calls use the full IDs in that table.
- Headers preserve project/index revision, freshness and coverage. Text displays
  the first evidence location and counts; JSON retains all stored evidence.
- External follow-ups remain copyable, shell-quoted CLI commands, deduplicated
  with F-labels, and visibly distinguish read-only queries from indexing writes.
- Pagination and truncation remain explicit, including a continuation command.
  Diagnostic failures use text by default, retaining nonzero CLI exit behavior;
  JSON keeps the structured diagnostic error.
- [x] Implement and verify both renderings and regenerated tool/help definitions.
  The same NR `NostrResolutionService` search returned 13 text lines versus 133
  formatted JSON lines (1,178 versus 4,130 bytes before JSON pretty-printing).
  One-off read-only checks confirmed callable IDs, search detail omission,
  inspect/expand relationships, truncation/continuation, and both diagnostic
  formats. Targeted lint and the scoped compiler check passed. No reindexing
  or automated tests were needed for this presentation change.
- [x] Re-run both formats through the actual CLI and compare all three returned
  names/IDs. Text remained 1,178 bytes and JSON 4,130 bytes (71% reduction).
  Suppress informational logging in `src/cli.ts` using the existing logger switch,
  so capability-registration initialization no longer prefixes tool output.
  Confirmed JSON stdout parses directly and neither format contains the info line;
  targeted CLI lint passed. This CLI-process setting is not persisted.

#### Generated agent skill

The durable skill source is `plugins/memory/ai.ts` (`agentInstructions`,
`skillNotes`, `skillRules`, and `aiDefinition`). `bun run plugin:generate` produces
`.appweaver/skills/appweaver-memory/SKILL.md`; do not edit that generated file.

Guidance now specifies project selection, search -> inspect -> bounded expansion
-> source reading, external navigation, missing/stale indexes, full IDs,
pagination, and indexing diagnostics. The text/JSON decision table recommends
text for discovery and JSON for scripts/full stored metadata, with the measured
NR comparison and an explicit note that byte reduction is not a token measurement.
Plain-row CRUD is distinguished from the code graph tools.

- [x] Lint the updated skill source, regenerate, and inspect the generated guide.
  Verified the workflow, text/JSON table, measured comparison, full-ID rules,
  continuation guidance, and current feature boundaries in the generated file.
  Skill enable/disable state was not changed by the agent. After the user's bot
  restart, `.claude/skills/skill-status/SKILL.md` lists Memory as enabled and its
  generated guide is available under `.claude/skills/appweaver-memory/`.

#### Real task: NR Timeline Authors

- [x] Use the enabled skill on a real feature request: add Timeline author groups
  for signal-matched authors with posts in selected slots.
- [x] Query the existing NR index in text format before source exploration.
  `timeline` located `commands/list/renderers/timeline.ts`; file inspection found
  `timelineNodes`, and bounded calls expansion found the shared `sectionNode`.
  Searches also located author-signal rendering and `getNrListData`. Source reads
  then established the slot filtering, reviewed-author semantics, and hydration.
- [x] Implement the feature in NR; targeted lint, scoped TypeScript, and a one-off
  in-memory DB-to-renderer check passed. Authenticated UI verification is pending.
- [ ] Investigate graph ownership/coverage for calls inside variable initializers:
  `getNrListData` calls expansion returned only `sortGroupsByScore`, despite feed
  query and scoring calls in its implementation. This demonstrates that a sparse
  function neighborhood must not be treated as complete dependency coverage.

Other observations: literal `treeItem` usage is not itself a declaration search
hit, and broad `timeline` searches include many property matches. Exact file/kind
filters and inspecting a file declaration helped narrow the task. File-plugin
JSON bottom-up summaries were missing for this subtree, so they did not supply
additional context. This is qualitative evidence of discovery usefulness, not a
measured token/time comparison. The index still describes the committed baseline;
the new feature must be committed before it can be indexed.

#### Milestone 1 verification record

##### Call-target coverage follow-up

The NR snapshot's 16 unresolved calls were reviewed: nine invoked functions
returned by transaction wrappers, two direct inline-function invocations, and five
injected callbacks. The transaction method and body calls were already represented;
the wrapper-result invocation lacked a concrete target. Inline functions are
statically identifiable; callback implementations require separate data-flow work.

- [x] Register direct IIFE function nodes and their invocation/body edges.
- [x] Separate callback-invocation and returned-function-call limitations without
      inventing concrete runtime targets; retain generic unresolved diagnostics.
- [x] Advance analyzer version to 4 so successful parsing rebuilds existing indexes.
- [x] Render collapsed, grouped project diagnostics instead of raw JSON, with
      readable messages/locations, legacy-code support, and malformed-record fallback.
- [x] Verify graph coverage, diagnostic categories, identities, and widget output:
      virtual-source checks passed for direct/type-asserted/named IIFEs, named
      recursion, invocation/body edges, callback/returned-function distinctions,
      and whitespace-stable identities. Read-only/in-memory widget checks passed.
- [x] Targeted lint and scoped TypeScript passed (42 Memory files, zero diagnostics).
- [x] Regenerate skill guidance after adding the new coverage terminology.
- [ ] Rebuild NR's real stored index after relevant inputs are committed/clean.
      Its current working tree still contains uncommitted Authors changes. Existing
      indexes were preserved, and production cleanliness guards were not bypassed.


- [x] Targeted ESLint with `--fix` on Memory and the core workspace helper.
- [x] Narrow TypeScript compiler check: zero diagnostics in Memory/helper files.
- [x] Regenerate CLI/skill definitions with `bun run plugin:generate`.
- [x] Remove draft commands, adapters, table creation, and formatters from Memory; verify immediate CRUD and clean skill generation.
- [x] Actual CLI NR parse saved its first index; repeat returned `unchanged` and
      preserved its generation/counts. No blocking compiler errors were reported.
      Final analyzer revision 3 indexed 97 files, 7,699 nodes, 21,736 edges,
      and 450 external references at NR commit
      `4f1965457d9e1d3a1f339c6e5c6f4e0b2b60d53c`. A forced fresh rebuild also
      completed; subsequent manifest validation returned `unchanged`.
- [x] NR search resolved `NostrResolutionService` to core's
      `src/nostr/resolution-service.ts:59`, with type-only import edges, revision
      provenance, and a typed follow-up parse suggestion while core is unindexed.
- [x] One-off in-memory checks exercised search, inspection, bounded expansion,
      idempotency, FK-triggered rollback preservation, obsolete-fact removal,
      and rejection of stale concurrent publication.
- [x] One-off checks confirmed code command flag parsing, rejection of consumed
      uncommitted core inputs, and a commit-first diagnostic for a project with
      no initial Git commit. No source files were modified for these checks.
- [ ] A full real-project edit/commit/error/rebuild lifecycle remains unverified;
      no NR source files were changed for verification and no automated tests
      were added or run. Dirty-input and diagnostic guards are implemented.
- [ ] Authenticated app command behavior awaits user verification after a host
      restart. `restart.requested` was not touched.

The persistent index is in `plugins/memory/db.sqlite`. CLI verification is usable
immediately; loading the updated plugin/helper in the running app needs a host
restart. Bottom-up `.BOTTOMUP.json` refresh remains a user choice.

- [x] Finalize initial code graph identities, supported relations, and typed tool schemas.
- [x] Integrate core workspace resolution and whole-project `project` selection.
- [x] Implement committed-file selection, Git cleanliness checks, ignore rules,
      and required `tsconfig`/`extends` loading.
- [x] Define and capture dependency/configuration provenance and analysis inputs.
- [x] Add plugin-local SQLite schema/migrations for projects, files, compact
      metadata, relationships/evidence, and search indexing.
- [x] Implement TS/TSX cross-file extraction, test labels, and blocking diagnostics.
- [x] Implement whole-project analysis, unchanged-input skipping, fresh rebuilds,
      atomic replacement, stale-fact removal, and duplicate prevention.
- [x] Expose `code.parse`, `code.search`, `code.inspect`, and `code.expand` through
      command definitions, `ai.ts`, generated CLI tooling, and agent guidance.
- [x] Verify NR CLI indexing, representative discovery queries, and repeated runs;
      verify deletion/rollback/concurrency in memory and lint/type-check new code.
- [ ] Verify real NR source-change/deletion/compiler-failure lifecycle and app
      commands, without introducing unrequested tests or changing NR just for checks.

Exit criteria: a clean committed NR project can be indexed and queried with
accurate locations and scoped relationships; failures do not replace its index;
repeated runs do not duplicate facts. No full source bodies are returned.

### Milestone 2 — AppWeaver as a separate project

- [ ] Apply the same manual workflow to AppWeaver, respecting ignored plugin repos.
- [ ] Confirm useful resolution of aliases, core symbols, and TSX declarations.
- [ ] Check project isolation, external-reference boundaries, and practical
      resource usage on the larger project when verification is requested.

Exit criteria: NR and AppWeaver coexist in the database and can be queried
independently without duplicate ownership or accidental cross-project traversal.

### Milestone 3 — Settings and opt-in automation

- [x] Agree the first `/memory projects` widget: indexed active-workspace projects,
      expandable rows, counts, index/HEAD hashes, timestamps, hook/last-run status,
      Refresh, Reindex, and explicit hook preview/enable/disable actions.
- [x] Implement `/memory projects` widget and read-only projects tool. HEAD equality
      determines Current/Outdated; unavailable HEAD is Unknown, with uncommitted
      inputs reported separately. Workspace/symlink boundaries filter the listing.
- [x] Implement explicit CLI/app `code.hook` preview/install/status/remove and
      per-repository automation state, including query headers/JSON metadata.
- [x] Expose indexed-project status and explicit preview/enable/disable hook
      controls in the projects widget, plus Refresh and forced Reindex actions.
- [ ] Add unindexed-project discovery and any broader project settings UI.
- [x] Implement repository-local hooksPath overlays delegating existing hooks,
      with post-commit indexing after release work and a nested-amendment guard.
- [x] Verify hook preview/install/idempotency/status/remove in an isolated,
      initially uncommitted Git fixture; simulate nested original hook execution,
      confirm failed indexing records status without changing original success,
      and confirm removal restores the previous local hooksPath. Fixture files
      were removed; no commits or existing-project hook installations were made.
- [x] Verify automation text/JSON metadata on Journal queries; automation remains off.
- [x] Targeted lint, scoped Memory TypeScript (41 files, zero diagnostics), and
      Git whitespace checks passed.
- [x] Regenerate CLI registry and Memory skill with `bun run plugin:generate`.
      Initial attempts were blocked by Journal AI's static import of its plugin
      initializer. Deferred that context lookup until scheduled publication runs
      (an injected pool still takes precedence), removing the initialization cycle.
      Actual CLI preview on Journal and JSON status on Job passed; both remain off.
      Generated Memory skill includes explicit opt-in guidance and code.hook schema.
- [ ] Confirm initial indexing, skipped runs, catch-up after missed commits,
      and diagnostic reporting while preserving successful Git commits.

Exit criteria: enabled projects index after commits using the manual command's
same rules; disabled projects retain manual operation.

#### Hook implementation and consent

`plugins/memory/code/hooks.ts` implements explicit opt-in tooling; indexing alone
never installs hooks. Preview/status are read-only. Install records prior local
Git configuration and creates `.git/appweaver-memory-hooks` (or the corresponding
Git metadata directory), then sets only local `core.hooksPath`. Shared/global hook
files are never edited. Standard hook names delegate to their original paths;
post-commit invokes existing work before the fixed, shell-quoted Bun runner.
Nested release amendments skip duplicate Memory runs but preserve original hooks.

`hook-runner.ts` clears Git-local environment for dependency repository queries,
locks concurrent runs, invokes the same parser with the explicit project/workspace,
and records the attempted revision/result. Failed analysis preserves the index and
Git commit; missed/busy runs catch up through manual parsing or subsequent commits.
Removal restores the previous local setting and validates managed-file ownership;
edited/redirected hooks, unsupported worktree config and active runs are surfaced.
CLI text and JSON expose automation status and last run. Natural-language Memory
AI cannot install/remove hooks; agents must have an explicit per-project user request.

No automation is being enabled on the user's existing projects by implementing
this feature. Broader settings UI and full real release-commit lifecycle verification remain
separate work. Unsupported project/Git metadata/worktree cases are documented in
the plugin README.

#### Indexed-projects widget

`code/projects.ts` lists stored indexes within the current canonical workspace;
it does not walk for unindexed projects or trigger indexing/hook installation.
The widget uses generic WebNodes and scoped CSS entirely inside the Memory app.
Each expandable row exposes short index/HEAD revisions (full values on hover and
in JSON), browser-local timestamps, counts,
uncommitted-input status, hook state, last-run details, and stored diagnostics.
Missing directories stay visible with disabled actions; symlink escapes are hidden.

The `projects` AI/CLI tool returns text or JSON. App commands render the widget
by default. `projects.hook --project ...` renders a preview modal with the exact
command/delegation and explicitly labeled Enable/Disable actions. These reuse
`code.hook`; changed/unverifiable configurations are not overwritten. Reindex uses
`fresh: true` to publish a snapshot at the current HEAD even if relevant inputs
would otherwise be unchanged. Reindex and hook changes refresh the origin widget.

- [x] Targeted ESLint and scoped TypeScript passed (42 Memory files, zero diagnostics).
- [x] One-off in-memory checks passed: workspace isolation, hash match/mismatch,
      unavailable-project and empty states, WebNode validation, action wiring,
      and read-only hook preview. No real hooks or indexes were changed by the check.
- [x] Regenerate tooling and verify actual projects CLI text/JSON output. Job and
      NR currently match indexed HEAD; Journal is outdated. All report dirty inputs
      separately and automation off. Generated skill includes projects guidance.
- [ ] User verification of widget rendering/actions in authenticated UI after restart.

Timeline presentation follow-up: removed the projects header/singleton registration
so `/memory projects` produces a regular timeline card rather than a docked widget.
Reindex runs through the timeline action/refresh path; hook preview remains a modal
with origin-card refresh. Hash display uses eight characters without shortening
the underlying values used for HEAD comparison. A reusable generic `timestamp`
WebNode displays epoch milliseconds in browser-local time, keeping Memory-specific
logic inside the plugin. Indexed-at and automatic-run times use this primitive;
CLI text uses process-local time and JSON retains raw timestamps/full hashes.

- [x] Verify timeline registration, short hashes, local timestamps, and refresh actions:
      no dock registration; full hashes remain in tooltips/JSON; timestamp nodes
      validate; Reindex uses timeline execution with source-card refresh. A timezone
      check rendered epoch zero as Dec 31, 1969, 4 PM PST in America/Los_Angeles.
- [x] Targeted lint, scoped TypeScript (45 root files, zero diagnostics), and
      tool regeneration passed. Repository-wide lint was attempted but is blocked
      by 61 no-undef errors in PPQ vendored JavaScript plus an unused variable in
      `plugins/translate/service.ts`; these are outside the touched scope.

#### Actionable indexing outcomes

- [x] Persist latest parse attempt independently of the last successful snapshot,
      covering manual/widget/automatic parse paths and retaining failed diagnostics.
- [x] Show failed attempt reason, browser-local time, preservation notice and
      recovery advice on the project summary, with expandable full failure details.
- [x] Record successful/unchanged outcomes to clear previous failure state; guard
      against older concurrent attempts replacing the newest outcome.
- [x] Verify failure feedback, unchanged graph preservation and outcome transitions.
      One-off in-memory checks exercised an actual no-initial-commit parser failure,
      unchanged prior generation/node data, visible summary/advice/time/detail nodes,
      successful/unchanged outcomes, and stale-completion rejection.
- [x] Targeted lint, scoped TypeScript (43 Memory files, zero diagnostics), generated
      tooling, actual CLI listing, and whitespace checks passed. Existing indexes
      have no fabricated historical attempts; tracking starts with subsequent parses.
- [ ] User verification of failed reindex feedback in the authenticated UI after restart.

`code/attempts.ts` stores one latest attempt per project in an additive SQLite
table. IDs advance on each start, so old concurrent completions cannot update a
newer row. The shared parse service captures failures before rendering errors;
successful snapshot metadata and its limitation diagnostics remain independent.
Failed attempts are visible even when project rows are collapsed and persist after
Refresh. Complete failure details expand separately from successful-index limitations.

The NR analyzer-4 rebuild succeeded with 14 expected limitations: nine calls to
returned transaction functions and five injected callback invocations. These
describe graph coverage and do not make an indexing attempt fail. They remain
separate from errors belonging to a failed attempt. Past failures predating attempt
tracking are not fabricated from successful-index diagnostics.

### Markdown and shared discovery — Agreed design and implementation

The design Q&A is settled and implementation is authorized. Index committed `.md`
and `.markdown` anywhere in a project, including feature-local READMEs. Projects
share identities across indexes; TypeScript requires package.json + tsconfig.json,
while Markdown supports the default workspace without those files. More-specific
projects own their files; nested repositories never belong to the parent snapshot.

Every heading creates a section containing its direct text, with parent/child
relationships and an introductory section. Long sections have block-oriented search
chunks with exact source ranges; links target sections, not chunks. Standard inline,
reference-style and same-document links use GitHub heading anchors. Explicit links
between projects retain both identities/revisions; unavailable/missing targets remain
visible. Queries never automatically broaden their selected-project scope.

Use local weighted FTS5 over title/heading/tags/body, retaining original Markdown.
YAML frontmatter supplies title/tags; other fields and raw metadata are preserved.
Malformed metadata warns without hiding the body. Vector search, wikilinks, inferred
knowledge, and documentation-to-code target resolution are deferred.

`markdown.parse/search/inspect/expand` mirror specialized code tools. Shared `parse`
attempts applicable indexes independently and shared `search` combines bounded ranked
results with kind/project/revision/inspection IDs. A documentation-only project skips
code as not applicable. Commit hooks use shared parsing. Dirty relevant inputs reject
only their index; atomic generation-checked publication preserves the last successful
snapshot. Markdown parsing reuses unchanged blobs/parser versions, removes deleted
facts, and refreshes link resolution as targets change. Latest-only snapshots retain
provenance. One widget row contains separate code/Markdown outcomes and reindex actions.

- [x] Implement Git Markdown snapshot/ownership/exclusions and incremental parsing.
- [x] Implement sections/chunks, frontmatter, explicit link resolution and backlinks.
- [x] Implement versioned storage, independent attempts, atomic publication and FTS.
- [x] Expose specialized Markdown tools and shared parse/search via CLI/app/AI.
- [x] Integrate shared commit runner and separate index statuses/actions in widget.
- [x] Verify targeted lint/types and directly relevant one-off lifecycle checks.
- [x] Regenerate guidance and document final behavior/remaining limits.
- [ ] User verification of authenticated widget/actions after restart.

Implementation uses plugin-local `markdown/{schemas,parser,snapshot,store,queries,
service}.ts`, `discovery.ts`, and Markdown/shared command definitions. CommonMark/GFM
and GitHub slugging use dedicated AST/slug libraries; YAML is parsed without custom
executable tags. Runtime dependencies and the plugin lockfile are declared locally.
The existing hook wrapper/config format is unchanged; its runner now orchestrates
independent indexes, so installed wrappers continue to validate without reinstallation.

Verification: targeted ESLint passed and scoped TypeScript reported 51 files with
zero diagnostics. In-memory checks parsed actual committed Journal (three documents)
and File (two documents), then returned unchanged with reuse. NR correctly rejected
dirty `docs/DB_REFACTOR_PLAN.md`; Job rejected dirty package ownership configuration.
Virtual-source/in-memory publication checks covered malformed frontmatter, reference links,
duplicate/nested headings, fenced examples, chunk/text budgets, cross-project links
and incoming backlink metadata without content traversal, target heading changes,
deletion, generation conflicts and rollback preservation. Shared parsing published
Markdown despite code failure. Joint searches over copied existing code data and
committed Markdown verified both result kinds and cursor continuity. Generic WebNode
validation checked combined widget status/errors/actions; app flag parsing checked
repeated exclusions/relations. Actual shared CLI search reported available code and
missing Markdown separately, with usable IDs and continuation. Existing successful
production indexes were not reindexed by these checks; openDb applied additive tables.

Link resolution is derived at query time from one SQLite read snapshot rather than
stored as stale cross-project foreign keys. Parsed source references retain absolute
destinations and evidence; latest indexed targets supply resolution/backlinks and
source/target revision provenance. Shared search ranks per-index ordinals and advances
only consumed backend offsets. Markdown inspection is paginated, defaults to 12,000
characters, and retains one logical section even when chunked. Section IDs are
project/path/slug based; renames and duplicate-heading reordering may change them.
Git-root documentation-only projects are supported in addition to configured roots
and workspace fallback. Source files above two million characters require exclusion
or splitting. Real authenticated UI and release-hook execution remain user verification;
no automated tests were added/run and restart.requested was not touched.

### Later milestones — Design still open

- [ ] Define supplier/consumer capability contracts and reliable DB-change
      delivery. Separate source DB and Memory CLI writes are not one atomic
      transaction; retry/recovery semantics remain to be designed.
- [ ] Add structured bottom-up documentation ingestion (Markdown is implemented above).
  - [ ] Deferred from Markdown version 1 by design Q&A: resolve explicit Markdown
        links to indexed code files (for example, `A/README.md` linking to `./db.ts`),
        retaining unavailable-target status and allowing navigation to declarations.
        Preserve original link destinations now; code-file resolution and individual
        code-symbol references remain future work. Joint code/document search remains
        in the agreed version-1 scope.
- [ ] Add app/core data suppliers with explicit identities and core-data allowlists.
- [ ] Select local PDF/DOCX extractors and provenance/citation formats.
- [ ] Design general question answering and query skills beyond the code tools.
- [ ] Explore multi-project queries, vectors, and fine-grained incremental code analysis.

### Next work queue after agent guidance

Recommended order; this is planning, not authorization to execute every item:

1. **Close Milestone 1 verification gaps.** Exercise an actual committed-source
   edit/deletion, blocking compiler error, and recovery without losing the previous
   index. Verify authenticated app commands with a user-provided context after
   restart. These are outstanding checks, not a new parser feature.
2. **Milestone 2: apply the service to AppWeaver.** Index the clean committed root
   as a separate project, check alias/type-only references, project isolation,
   effective tsconfig TSX coverage, and resource usage. Harden the analyzer only
   against issues actually found. Respect current commit-first guards; do not
   automatically commit the existing work to make indexing possible.
3. **Milestone 3: project status/settings.** The indexed-projects widget and
   read-only projects tool are implemented with counts, index/HEAD freshness,
   diagnostics, last-run status, and explicit hook controls. Verify the widget in
   the authenticated UI; next agree unindexed-project discovery and broader settings.
4. **Milestone 3: post-commit automation.** Integrate the opt-in hook with existing
   release hooks, invoke the same parser using explicit project/revision context,
   and report failed/missed runs without undoing Git commits.
5. **Broader Memory ingestion.** Design reusable supplier/consumer contracts and
   reliable change delivery, then choose Markdown/bottom-up retrieval/extraction
   rules. App/core DB suppliers, PDF/DOCX, and general answering remain later work.
   Vectors and automatic cross-project traversal remain research/design items.
