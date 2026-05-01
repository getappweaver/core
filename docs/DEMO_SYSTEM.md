# Demo And Story System

This document describes the planned demo/story architecture for AppWeaver. The goal is to show important workflows with the real web UI while keeping user data safe and keeping stories reusable as in-app tutorials.

## Goals

- Stories should be authored once and usable in the real app, static demo app, onboarding, and plugin tutorials.
- Stories should use real widgets, forms, prompts, and WebActions instead of hand-built marketing mockups.
- Guided workflows should be deterministic enough for demos and tutorials.
- Mutating stories must not touch the user's real plugin data.
- The static landing demo must keep working without a backend.

## Source Of Truth

Stories are authored locally beside the module that owns the workflow:

- Plugin stories live in plugin-level modules such as `plugins/todo/stories.ts` and are exposed through `plugin.stories`.
- Core command stories should live beside the relevant core command module.
- AI capability stories should live beside the AI capability/definition that owns them.

Generated JSON is not the source of truth. It is only a static export for the no-backend demo app.

## Real App Runtime

The real app discovers stories by traversing the same runtime structures used by command/help/palette systems:

- registered plugins
- core command definitions
- AI capability definitions

The `/story` built-in command is the user-facing entry point:

- `/story list` lists available stories.
- `/story start <story-id>` starts a selected story.

Story cards render in the normal timeline. We do not plan to use a timeline singleton for story cards.

## Static Demo Runtime

The static demo has no backend, so it still needs generated data:

- `apps/landing/public/demo/commands.json`
- `apps/landing/public/demo/stories.json`
- `apps/landing/public/demo/command-stories.json`
- `apps/landing/public/demo/bootstrap.json`

These files should remain committed artifacts so the static demo works predictably.

The generated files are produced from the same authored story modules used by the real app.

The static demo should eventually stop using a split-screen story navigator. Instead, it should open the normal app UI and use query params to start story mode:

- `/demo/app/?stories=1` shows the story list.
- `/demo/app/?story=<story-id>` starts one story.
- `/demo/app/?storyIndex=0` starts the first story in catalog order.

The demo may also expose a highlighted header shortcut for stories/demo mode.

## Presentation Model

Stories use normal timeline cards for the transcript:

- story list card
- story instruction card
- normal widget cards
- normal prompt cards
- normal command result cards
- completion card with next/list/quit actions

When a story requires an exact user action, the app enters walkthrough mode.

## Walkthrough Mode

Walkthrough mode is a client runtime layer, not just WebNode markup.

It should:

- highlight the required target UI element
- block interaction with unrelated UI
- keep story quit controls available
- fill targeted forms/inputs with deterministic values when a story step requests it
- observe the expected action/event
- advance the story when the expected action happens
- prevent unsupported or out-of-order interactions from mutating story state

The first implementation should support both:

- header widget targets, such as the Todo list widget button
- WebNode/action targets, such as an `Add child...` menu item inside a widget

Example targets:

```ts
{ type: 'header_widget', command: 'todo', subcommand: 'list' }
{ type: 'web_node_action', command: 'todo', subcommand: 'add', options: { under: 101 } }
```

The walkthrough overlay state should live in an app-level client runtime, for example a `StoryRuntimeProvider` in the web app.

## Sandbox Data

Mutating stories must use sandbox data.

When a story starts:

- the app enters story mode
- a story sandbox is created from deterministic data inside the story definition
- story interactions use the sandbox instead of the real plugin DB

When a story quits or completes:

- the sandbox is discarded
- normal app transport/data is restored
- real plugin data is shown again

For the Todo plugin, a story can define initial sandbox state such as:

```ts
{
  todo: {
    items: [/* deterministic todos */],
    nextId: 104
  }
}
```

Story sandbox seeds should be defined inside the story definition. Larger fixture modules can be introduced later if story data grows too large.

## Story Transport

When a story is active, the core should replace the normal story-relevant transport with a sandbox/stub transport for the duration of the story.

This is similar to the static demo stubs, but controlled by the core story runtime:

- allowed story commands and WebActions are handled by the sandbox transport
- unsupported interactions are blocked by walkthrough mode
- sandbox outputs use the same real renderers where possible
- quitting the story restores normal transport

This keeps story workflows safe and deterministic while preserving the real UI.

## Step Vocabulary

The initial guided story vocabulary should stay small:

- `instruction` - show guidance in the timeline/walkthrough UI
- `seed_sandbox` - initialize deterministic story state
- `focus_target` - highlight a UI target and block other UI
- `wait_for_action` - wait until the user performs an expected action
- `fill_form` - fill a deterministic value into a form/input
- `run_command` - execute a command as part of the story
- `complete` - finish the story and show next/list/quit actions

Example sketch:

```ts
{
  id: 'todo-list-bootstrap',
  title: 'Open the Todo list',
  sandbox: {
    todo: {
      items: bootstrapItems,
      nextId: 104,
    },
  },
  steps: [
    {
      type: 'instruction',
      text: 'Open the Todo widget from the header.',
    },
    {
      type: 'focus_target',
      target: { type: 'header_widget', command: 'todo', subcommand: 'list' },
    },
    {
      type: 'wait_for_action',
      match: { type: 'widget_opened', command: 'todo', subcommand: 'list' },
    },
    {
      type: 'complete',
    },
  ],
}
```

## Story Sequencing

Stories are ordered by catalog order for now.

Stories may optionally define `nextStoryId`. If present, completion should offer that story as the primary continuation instead of the next story from catalog order.

When a story completes, the runtime should append a completion card with:

- Continue with next story
- Back to story list
- Quit story mode

If `nextStoryId` is absent, the runtime falls back to catalog order.

## AI And Prompt Stories

AI/prompt-driven stories need a dedicated technical plan.

Open design questions include:

- how story sandboxes should represent AI draft state
- how deterministic AI responses should be produced without calling a live model
- how prompt answers, draft accept/decline/revise flows, and follow-up prompts should be constrained
- whether revise paths are unsupported, canned, or branch into separate stories
- how story-authored prompt text should be filled into the composer
- how story runtime should distinguish normal chat from story-controlled AI prompts

The first AI/prompt story should likely support only one golden path, such as:

- seed sandbox data
- fill a deterministic AI prompt
- user runs the prompt
- sandbox returns a deterministic draft
- user accepts or declines
- runtime shows completion/next-story actions

Full branch coverage is a non-goal for the first AI/prompt story implementation.

## Current State

Implemented pieces:

- Plugin-level `stories` provider on `BotPlugin`.
- Todo stories moved to `plugins/todo/stories.ts`.
- Demo generator reads plugin-level stories.
- `/story list` and `/story start <id>` exist as a first runtime pass.
- Story list/start currently render normal WebNode cards.
- Todo list widget supports inline Add child/sibling forms.
- Generic WebNode support exists for local reveal actions and text-field autofocus.

Not implemented yet:

- Client-side walkthrough runtime/provider.
- Blocking overlay and target highlighting.
- Story sandbox transport replacement.
- Deterministic sandbox execution for Todo commands.
- Automatic query-param story startup in the static demo app.
- Completion card with next/list/quit actions.
- Technical plan and runtime support for AI/prompt stories.

## Migration Plan

1. Keep current `/story list` and `/story start` command surface.
2. Add a client story runtime that can own active story state.
3. Add walkthrough overlay support for header widget targets.
4. Add WebNode/action target registration and highlighting.
5. Add sandbox transport replacement for active stories.
6. Implement Todo sandbox handlers for `list` and `add` first.
7. Convert `todo-list-bootstrap` to the minimal guided step vocabulary.
8. Add query-param startup for `/demo/app/`.
9. Replace the split-screen static demo with normal in-app story flow.
10. Expand Todo stories to include add-child and AI draft workflows.

## Non-Goals For Now

- Simulating every possible branch of a plugin workflow.
- Supporting arbitrary revise/duel paths in the first story runtime.
- Mutating real user plugin data during stories.
- Building a full side-panel tutorial system before validating timeline cards plus walkthrough overlay.
