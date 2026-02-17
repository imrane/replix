---
description: Perform a security audit and return a ranked remediation backlog.
argument-hint: "[repo path or component]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git diff*)
  - Bash(semgrep*)
  - Bash(trivy*)
---

Run a security audit over the target scope.

Output:
- risk matrix (critical/high/medium/low)
- owner + fix estimate
- quick wins for next 24h
