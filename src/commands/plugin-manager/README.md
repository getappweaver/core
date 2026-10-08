# Plugin manager commands

The built-in plugin manager handles installation, local creation, release status,
and publication. See the [plugin system documentation](../../../docs/PLUGIN_SYSTEM.md)
for the shared plugin architecture.

## Release inspection

`/plugins releases` resolves eligible installed plugins independently using
`Promise.allSettled`. Successful inspections remain visible when another plugin
fails. Both text and web output report inspection failures with the plugin alias
and the error message; failed inspections are counted separately from plugins
hidden because their publishing author is unavailable.

Release Git inspection requires the plugin directory to be the repository root,
including linked worktrees. It rejects folders that inherit a parent repository
and reports repositories without a first commit as not ready for inspection.
These checks also apply to publication through the shared release Git inspector.
