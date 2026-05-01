---
direct_hash: 75e33af3144cc24b7982c0f3d42e4d528cf203c58bb1003073e6187cf485790a
subtree_hash: 3e0593cccf29a7538f647db45dd17a9020c0c9e1a8b6a5c7e995c14edd526f5d
files:
  cli-representation.ts: 9db6895cae023061dc273f2979809939c535cdd4232e11ae8b71352cdc1b9407
  definition.ts: 8da3589bd0598d6111a32eafffc0b08294775917f6f0c8d7dd5e84475bc2943b
  handler.ts: 8af122bbee67b5ca174d3915ed04843f8025463c91b0a5cd800f32871026639a
children:
---
# commands/ai

## Purpose
Root handler and CLI renderer for AI subcommands (mode, backend, model, models, provider). Coordinates subcommand definitions and delegates to nested handlers.

## Files
- `cli-representation.ts` - Dispatches to type-specific CLI renderers based on representation.kind (mode/backend/model/models)
- `definition.ts` - CommandDefinition tree assembling mode, backend, model, models, provider subcommands under 'ai'
- `handler.ts` - Root handler routing 'ai' subcommands to nested handlers; includes help and usage text

## Notes
- Coordinates with the providers/ subsystem to select which LLM backend powers agent conversations
- Defines command tree structure but delegates actual logic to subdirectories (mode/, backend/, model/, models/, provider/)
- Uses handleError wrapper for backend and models operations
- The mode, backend, and model selections control how flow/ executes agent conversations
