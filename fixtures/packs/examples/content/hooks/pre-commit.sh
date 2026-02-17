#!/usr/bin/env bash
set -euo pipefail

# Content quality guardrails
if command -v rg >/dev/null 2>&1; then
  if rg -n "\b(TODO|FIXME|lorem ipsum)\b" content/ docs/ >/dev/null 2>&1; then
    echo "[content-hook] unresolved placeholders found"
    exit 1
  fi
fi

echo "[content-hook] content checks passed"
