# {{PASCAL_ALIAS}} plugin ({{ALIAS}})

{{DESCRIPTION}}

**Command:** `/{{ALIAS}}`

---

Replace this README with documentation for your plugin:

- **Commands** — List each `/{{ALIAS}} <subcommand>` and what it does.
- **Data model** — What you store (tables, main entity), and where (db.sqlite).
- **Draft/confirm flow** — If you use drafts (e.g. AI proposes, user accepts/revises/declines), describe it here. When generated with `create_draft_commands: false`, mutations execute directly without draft storage or review commands.
- **CLI tools** — If the plugin exposes CLI tool calls (via `aiDefinition`: `toolCallSchema` and `executeTool`), list them and how they are used.

See PLUGINS.md in the repo root for the full plugin author guide.

After you change structure or behavior, use the appweaver-file `bottomup.generate`, `bottomup.summarize`, and `bottomup.enrich` tools to refresh `.BOTTOMUP.json` knowledge.
