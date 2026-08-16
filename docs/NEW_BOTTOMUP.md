Yes — with that clarification, I think I understand the architecture much better. And I would **change several things from my previous proposal**, especially around `topdown`, `context`, and the hash structure.

The key distinction I now see is:

> **`bottomup` is incremental source analysis. `topdown` is contextual re-analysis.**

They are not really opposite traversal commands.

## 1. The pipeline I'd use

I think your intended flow is:

```text
                         source files
                              │
                              ▼
                       ┌─────────────┐
                       │  bottomup   │
                       │             │
                       │ check hash  │
                       └──────┬──────┘
                              │
                    changed/new files
                              │
                              ▼
                         analyze()
                              │
                              ▼
                    file-level summaries
                              │
                              ▼
                    parent folder summary
                              │
                              ▼
                         ... upward
                              │
                              ▼
                       requested root
```

Then **topdown** is a separate pass:

```text
              existing bottomup knowledge
                         │
                         ▼
                     topdown(root)
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       upper-folder context     existing summaries
              │                     │
              └──────────┬──────────┘
                         ▼
                    analyze again
                         │
                         ▼
                 updated file context
```

That distinction is excellent.

### Bottomup

> "What does this file/folder contain?"

### Topdown

> "Now that I know what the surrounding system/folder means, what does this file mean **in that context**?"

That second question is substantially more interesting than simply traversing the tree in the other direction.

---

# 2. I would define the two passes very explicitly

### `bottomup`

**Purpose:** establish/update the raw knowledge graph.

For each file:

```text
hash(file)
   │
   ├── unchanged → reuse existing analysis
   │
   └── changed/new
          │
          ├── supplied AI context?
          │       └── use it as initial knowledge
          │
          └── otherwise analyze
```

Then once children are known:

```text
file summaries
      ↓
folder analysis
      ↓
parent folder
      ↓
...
```

So the recursive behavior belongs entirely inside the tool.

The AI shouldn't have to orchestrate:

```text
analyze A
analyze B
analyze C
then analyze directory
then analyze parent
...
```

That's exactly the sort of orchestration that your tool should own.

---

# 3. `topdown` is more subtle than I originally understood

Your description makes much more sense:

> even if file hashes are up-to-date, we have a summary/context and update the analysis for each file.

So imagine:

```text
src/
  auth/
    login.ts
    session.ts
    oauth.ts
```

After bottomup:

```text
login.ts
  "Validates credentials and creates JWT."

session.ts
  "Stores refresh-token sessions."

oauth.ts
  "Handles OAuth callback."

auth/
  "Authentication subsystem."
```

Now topdown starts at `auth/`.

It has:

```text
auth/
  Authentication subsystem.
```

and passes that **upper-level context down**:

```text
auth context
     │
     ├──────────────┬───────────────┐
     ▼              ▼               ▼
 login.ts       session.ts       oauth.ts
     │              │               │
     ▼              ▼               ▼
reanalyze       reanalyze        reanalyze
with context    with context     with context
```

So the new `login.ts` analysis might become:

> `login.ts` validates credentials and creates JWTs. It is the authentication entry point for the subsystem and feeds tokens into the session/auth middleware flow.

Even though `login.ts` **didn't change**.

That's the key.

### Bottomup answers:

> What is this?

### Topdown answers:

> What is this **given what I now know about its parent/system**?

That's a really useful distinction.

---

# 4. And your supplied `context` fits both passes differently

This is where I think your idea becomes especially strong.

Suppose the AI already has this:

```json
{
  "context": {
    "src/auth/login.ts": "Validates credentials and creates JWT.",
    "src/auth/session.ts": "Stores refresh-token sessions in Redis.",
    "src/auth/oauth.ts": "Handles OAuth callback and exchanges code.",
    "src/auth/middleware.ts": "Validates JWT on protected API routes."
  }
}
```

You run:

```text
bottomup(src/auth, context)
```

The tool does:

```text
login.ts
  hash = abc
  changed/new?
     ↓
   yes
     ↓
  supplied context exists
     ↓
  use context instead of asking AI to analyze
```

So:

```text
AI context → file summary
```

Then bottomup can construct the parent knowledge.

This is effectively **context seeding**.

---

# 5. But topdown can use context even when nothing changed

That's the other half.

Suppose:

```text
login.ts
hash = abc
summary = S1
```

Nothing changed.

`bottomup` says:

```text
unchanged → don't analyze
```

But `topdown` says:

```text
parent context changed/available
        ↓
reanalyze login.ts with parent context
        ↓
S2
```

So:

```text
                 file hash
                    │
           ┌────────┴─────────┐
           │                  │
       unchanged            changed
           │                  │
     bottomup skips       bottomup analyzes
           │                  │
           └────────┬─────────┘
                    │
                    ▼
                 topdown
                    │
              always contextual
                 analysis
```

That makes the distinction very clean.

---

# 6. I would therefore avoid `--if-changed`

My previous suggestion of `--if-changed` becomes unnecessary.

That's already the semantic difference between the commands:

```text
bottomup = change-aware
topdown   = context-aware
```

That's much better.

---

# 7. `summarize` and `context`

I agree with your instinct that these should be separated.

I'd define them like this:

### `summarize`

**Creates or updates knowledge.**

```text
input
  ↓
AI
  ↓
summary
```

It is an operation that causes an AI call.

### `context`

**Retrieves existing knowledge.**

```text
path
  ↓
stored summary/context
  ↓
return it
```

No AI call.

So:

```text
summarize = write
context   = read
```

That's a very clean API.

And `topdown` can internally use `summarize`:

```text
topdown
  ↓
get parent context
  ↓
for children:
    summarize(child, parentContext)
```

---

# 8. I'd probably call the stored thing `context`, not `summary`

Because the thing can evolve beyond a simple prose summary.

For example:

```json
{
  "path": "src/auth/login.ts",
  "hash": "sha256:...",
  "context": "Validates credentials and creates JWT.",
  "lastUpdatedAt": "2026-08-09T..."
}
```

Then `context` is the general semantic representation of a source node.

The command:

```text
context src/auth/login.ts
```

returns that.

And:

```text
summarize src/auth/login.ts
```

creates/updates it.

This avoids the weirdness of:

```text
context → summary
```

where the names sound like the same thing.

---

# 9. JSON vs Markdown: I strongly prefer JSON internally

For the underlying persistent representation, I'd choose **JSON**.

Markdown is great for humans; JSON is much better for your runtime.

You need things like:

```json
{
  "path": "src/auth/login.ts",
  "hash": "sha256:abc...",
  "context": "...",
  "lastUpdatedAt": "2026-08-09T18:20:00Z",
  "provenance": {
    "type": "ai",
    "model": "..."
  }
}
```

You can also later add:

```json
{
  "dependencies": [],
  "symbols": [],
  "relationships": [],
  "children": [],
  "version": 1
}
```

without having to parse your own prose.

### But I wouldn't necessarily abandon Markdown entirely.

I could see a nice architecture being:

```text
.appweaver/
  context/
    src/
      auth/
        login.json
        session.json
        oauth.json
        _index.json
```

while optionally generating:

```text
src/auth/BOTTOMUP.md
```

for humans.

So:

```text
JSON = canonical machine representation
Markdown = optional human projection
```

I think that's much stronger.

---

# 10. The hash structure: here's where I would simplify my previous Merkle-tree idea

You asked why a Merkle tree would actually help.

For your use case, **you probably don't need a formal Merkle tree**.

What you *do* need is a deterministic way to know:

> "Is the folder-level context potentially stale because one of its descendants changed?"

You can achieve that very simply.

Suppose:

```text
auth/
  login.ts    hash A
  session.ts  hash B
  oauth.ts    hash C
```

Store something like:

```json
{
  "children": {
    "login.ts": "A",
    "session.ts": "B",
    "oauth.ts": "C"
  }
}
```

Then when bottomup runs:

```text
actual files
    ↓
hash
    ↓
compare children hashes
```

If `session.ts` changes:

```text
B → D
```

you immediately know:

```text
auth context may need rebuilding
```

Then because `auth` changed:

```text
src context may need rebuilding
```

and so on.

That is **Merkle-like invalidation**, but you don't need to expose or even call it a Merkle tree.

---

# 11. The really important thing is separating two kinds of invalidation

This is where your design becomes interesting.

### Source invalidation

```text
file hash changed
```

means:

> bottomup analysis is stale.

### Context invalidation

```text
parent context changed
```

means:

> topdown analysis may be stale.

These are **different dimensions**.

For example:

```text
login.ts
fileHash = A
context = S1
```

Parent context changes:

```text
auth context
S1 → S2
```

The file remains:

```text
fileHash = A
```

but its contextual analysis may change:

```text
context:
S1 → S3
```

So you shouldn't tie the validity of the context exclusively to the file hash.

I'd store something like:

```json
{
  "fileHash": "A",
  "context": "...",
  "parentContextHash": "P1",
  "lastUpdatedAt": "..."
}
```

Now you can distinguish:

```text
fileHash unchanged
parentContextHash unchanged
→ analysis valid

fileHash unchanged
parentContextHash changed
→ topdown analysis stale

fileHash changed
→ bottomup analysis stale
```

**This is probably the most important data-model change I'd make.**

---

# 12. This also makes topdown very efficient

Suppose:

```text
login.ts
fileHash = A
parentContextHash = P1
```

Run topdown.

Parent context is still `P1`.

Therefore:

```text
nothing to do
```

But if the parent context becomes:

```text
P1 → P2
```

then:

```text
login.ts
A + P1
```

is no longer the latest contextual analysis.

So topdown re-runs it:

```text
login.ts
A + P2 → new context
```

This gives you exactly the behavior you're describing without unnecessarily reanalyzing everything.

---

# 13. The supplied AI context can participate in this cleanly

Your input:

```json
{
  "context": {
    "src/auth/login.ts": "...",
    "src/auth/session.ts": "..."
  }
}
```

is effectively saying:

> "Here is semantic knowledge I already possess about these files."

Bottomup can verify:

```text
path exists?
hash actual file
```

and store:

```json
{
  "fileHash": "actual-hash",
  "context": "AI-provided context",
  "provenance": {
    "type": "ai",
    "lastUpdatedAt": "..."
  }
}
```

No need to analyze.

This is a **huge optimization for the exact architecture you're building**, because the agent can hand knowledge accumulated during its normal reasoning back into the index.

---

# 14. Dynamic schema generation is a good idea

I agree with this too.

If the tool knows:

```text
changed files:
  src/auth/login.ts
  src/auth/session.ts
  src/auth/oauth.ts
```

the generated tool schema/instructions could effectively tell the AI:

```text
For changed files, you may provide existing context.

context:
  src/auth/login.ts: string
  src/auth/session.ts: string
  src/auth/oauth.ts: string
```

The AI then only has to provide context for files it already understands.

It doesn't have to manufacture context for files it hasn't seen.

And the tool remains responsible for:

```text
filesystem traversal
hashing
dependency/order
recursive processing
persistence
```

Exactly as you want.

---

# 15. I would make the recursion deterministic

This is important if the AI is providing context.

For:

```text
bottomup src/auth
```

the tool should internally do something like:

```text
1. enumerate files
2. hash all files
3. identify changed/new files
4. resolve supplied context for changed files
5. analyze missing ones
6. persist leaf contexts
7. analyze auth/ using children
8. persist auth/
9. return result
```

The model doesn't need to know that this happened.

The tool is effectively a **small deterministic workflow engine**.

---

# 16. Then `topdown` becomes:

```text
topdown src/auth
```

Internally:

```text
1. load auth context
2. enumerate children
3. for each child:
      provide auth context
      summarize child
4. persist child context
5. recurse into directories
```

And if you want to optimize it further:

```text
parent context hash unchanged?
    ↓
don't need to topdown this subtree
```

So topdown isn't necessarily:

> "always regenerate everything."

It's:

> **"regenerate based on contextual invalidation rather than source invalidation."**

That's a much better definition.

---

# 17. I'd end up with a model roughly like this

```ts
type ContextNode = {
  path: string;

  // Actual source state
  fileHash?: string;

  // Semantic state
  context?: string;

  // What parent context was used to generate this context
  parentContextHash?: string;

  // Provenance / bookkeeping
  provenance?: {
    type: "ai" | "human";
    lastUpdatedAt: string;
  };

  // For directories
  children?: Record<string, ContextNode>;
};
```

Although I'd probably keep the filesystem tree and context records separate internally rather than recursively nesting all of this.

---

## The conceptual model I'd use now

```text
                     SOURCE
                       │
                     hashes
                       │
                       ▼
                  ┌──────────┐
                  │ BOTTOMUP │
                  └────┬─────┘
                       │
              source-grounded context
                       │
                       ▼
              ┌─────────────────┐
              │ context index   │
              └────────┬────────┘
                       │
                 parent context
                       │
                       ▼
                  ┌─────────┐
                  │ TOPDOWN │
                  └────┬────┘
                       │
             context-aware context
                       │
                       ▼
                 richer index
```

And the AI integration:

```text
AI already knows something
          │
          ▼
      bottomup
          │
    actual file hash
          │
          ▼
  bind knowledge to source
          │
          ▼
     don't analyze again
```

So I think your four commands are converging nicely toward:

**`bottomup`** — establish/update source-grounded context, only analyzing changed/new things.

**`topdown`** — propagate higher-level context downward and re-analyze even unchanged files when their contextual understanding can improve.

**`summarize`** — the primitive that actually asks the AI to create/update context.

**`context`** — read existing stored context; no AI call.

And the two invalidation axes are:

```text
fileHash changed
    → bottomup invalidation

parentContextHash changed
    → topdown invalidation
```

That is much cleaner than the generic "summary cache" model I was describing earlier.


# Answers

5. maybe a rule to run topdown should be the file hashes are already stale (nothing changed before the last run of bottomup) but can receive the context to enrich. If context is not provided

6. yes

7.

8. maybe we can rename the commands with more meaningful ones. bottomup.generate, bottomup.enrich (instead of topdown), bottomup.summarize (generates the summaries), bottomup.summary (reads summaries, context)

9. or can have .BOTTOMUP.json that's invisible by default alongside __BOTTOMUP.md files
.BOTTOMUP.json won't be visible to anyone except the tool itself

10. got it. I believe we should have something like that already

11. yes, need to consider

12. topdown suppose to get it via the summary (deterministic) or the context from existing agent (probably not deterministic). In the second case it would regenerate.

17. so the idea is, if bottomup receives a context upfront we mitigate a lot of AI token usage. But I think the provided context should be the "big picture", not each specific file, maybe a folder based dictionary would work. Then bottomup would still read the files and specifics of the files, with the knowledge each pieces place on the "big picture" 