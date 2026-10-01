---
name: session-title
description: Use when an AppWeaver conversation begins or changes topic to keep its session title short and accurate through the AppWeaver CLI.
---

# Session titles

The active AppWeaver runtime context gives you the exact **AppWeaver session ID**, current title, and AppWeaver root. Use that ID, never a shared "current session" pointer.

- After the first meaningful user request in an untitled session, choose a specific title of at most **30 characters** and set it without interrupting the task.
- If the topic has genuinely changed and an automatically chosen title no longer describes the latest conversation, update it. Do not rename for minor follow-ups or just to rephrase a good title.
- AppWeaver refuses automatic changes to a title the user set manually. If the CLI says `manual-title`, leave it alone. Do not use `mode: "manual"` on the agent's initiative.

From any workspace, use the AppWeaver root from the runtime context:

```bash
bun "<AppWeaver root>/src/cli.ts" session rename '{"sessionId":"<AppWeaver session ID>","title":"<specific title, at most 30 characters>","mode":"auto"}'
```

The result has `status` (`updated`, `unchanged`, or `manual-title`) and `title`. Avoid repeated calls if the existing title still fits. Keep title maintenance incidental to the user's actual request.

Successful title changes notify connected AppWeaver clients immediately. The context menu updates its current and recent session titles while the agent continues working; no extra refresh command is needed.
