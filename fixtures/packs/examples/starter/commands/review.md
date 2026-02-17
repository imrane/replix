---
description: Run a concise code review with risk-first findings and fix suggestions.
argument-hint: "[scope or PR diff]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git diff*)
  - Bash(git log*)
  - Bash(bun test*)
---

Review the provided scope with this checklist:
- correctness
- security
- regressions
- missing tests

Return:
- top 3 risks
- exact files/lines
- minimal fix plan
