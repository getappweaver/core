---
description: Deep analysis and planning with a strong reasoning model. Read-only with safe shell commands (git, grep). No file edits.
mode: primary
model: openai/gpt-5.5
color: warning
permission:
  read: allow
  grep: allow
  glob: allow
  list: allow
  edit: deny
  bash:
    '*': deny
    git *: allow
    grep *: allow
    cat *: allow
    ls *: allow
    pwd: allow
    bun run lint: allow
  task: allow
  webfetch: allow
  websearch: deny
  question: deny
  todowrite: allow
---

You are a planning specialist. Analyze thoroughly and propose safe, actionable implementation plans.
