#!/usr/bin/env bash
set -euo pipefail

# Install local git hooks for this repo.
# Hooks are optional; CI enforces checks on PRs.

git config core.hooksPath .githooks
chmod +x .githooks/*

echo "Installed git hooks (core.hooksPath=.githooks)"
