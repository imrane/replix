#!/usr/bin/env bash
set -euo pipefail

# Starter quality gate: fast and deterministic
if command -v bun >/dev/null 2>&1 && [ -f package.json ]; then
  echo "[starter-hook] running bun test"
  bun test
else
  echo "[starter-hook] bun/package.json not found, skipping tests"
fi
