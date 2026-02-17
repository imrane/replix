#!/usr/bin/env bash
set -euo pipefail

# Security-focused pre-commit checks
if command -v git >/dev/null 2>&1; then
  if git diff --cached --name-only | grep -E '(\.env|secrets|credentials)' >/dev/null 2>&1; then
    echo "[security-hook] warning: sensitive-looking files staged"
  fi
fi

if command -v semgrep >/dev/null 2>&1; then
  echo "[security-hook] running semgrep quick scan"
  semgrep --config auto --error || true
else
  echo "[security-hook] semgrep not installed, skipping"
fi
