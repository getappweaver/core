---
direct_hash: 5ca4359f5fd1f8a073842ee1e635273d69be9f84d5fa04ee7c582a82f0cfde1c
subtree_hash: 8fb1aaa52bafe1f0e0508c2f233c22bc0a090c9fc6922c16865e22d4368bab7a
files:
  plugin.ts: 3f7f7e3bdc166f69252268afb0ced3c7d88c0034f8e598e0284fba126e7f98eb
  registry.ts: 9fac418d6ed91cd3aa8dc6e27072e010eb230d42f378b3434398bdccec663535
children:
---

# core

## Purpose
Core plugin system: defines the BotPlugin interface and lifecycle (onInit/handler), PluginContext with shared utilities (pool, runAgent, sendReply, promptFn, etc.), and a registry for dispatching commands to plugins by alias.

## Files
- `plugin.ts` - Plugin types: BotPlugin interface, PluginContext, PluginInvocationContext, prompt payload helpers, and parsePluginPackageJson validation
- `registry.ts` - In-memory plugin registry: registerPlugin, getPluginByAlias, listRegisteredPlugins, dispatchPluginCommand, getPluginHelpTexts

## Notes
- Plugins define command routing via handler(args, context)
- PluginContext defaults are UI hints; authoritative state lives in plugin-local SQLite
- Command dispatch returns null when no plugin matches alias
