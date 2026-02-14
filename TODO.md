# TODO

## P2: Better config filename than pack.json

**Problem**: `pack.json` is too generic and could collide with other tools.

**Options**:
- `nexus.json` ✅ (clear, scoped)
- `.nexus.json` (hidden)
- `skills.json` (descriptive but limits scope)
- `agents.json` (broader but vague)
- `claude.json` (tool-specific)

**Recommendation**: `nexus.json` (clear ownership, not hidden, easy to find)

---

## Next: Global Setup & Portability

See README section on global installation.
