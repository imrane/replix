#!/usr/bin/env bash
set -euo pipefail

# Data quality pre-commit checks
if command -v sqlfluff >/dev/null 2>&1; then
  echo "[dataops-hook] linting SQL"
  sqlfluff lint sql/ || true
else
  echo "[dataops-hook] sqlfluff not installed, skipping"
fi

echo "[dataops-hook] done"
