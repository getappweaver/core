# AppWeaver Plugin Development

This directory is an independent plugin repository generated from AppWeaver's full draft/review scaffold.

- Read `README.md` and `__BOTTOMUP.md` before changing behavior.
- Keep `__BOTTOMUP.md` current when files, responsibilities, persistence, commands, or rendering change.
- Preserve the draft/accept/decline flow for mutating operations unless the product explicitly requires another review model.
- Keep plugin-specific code in this repository. Do not add plugin-specific branches or imports to AppWeaver `src/` or `web/`.
- Update `package.json` metadata and `appweaver.capabilities` as the product becomes concrete.
- Put the final SVG icon inside this repository and set `appweaver.icon` to its relative path.
- Run targeted ESLint for files changed during development. Do not add or run tests unless the user requests them.
- Run `bun run plugin:generate` from the AppWeaver root after changing `ai.ts`, command definitions, or generated registration inputs.
- Use `/plugins releases` from the AppWeaver UI to review Git and publication readiness.

Before the first release, ensure the implementation, package metadata, icon, capability declarations, documentation, and changelog-worthy commit history describe the same product. The release wizard handles repository registration, tag verification, Blossom icon upload, and catalog publication.
