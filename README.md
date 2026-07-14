# Capricorn v2

**"Mereka ingat, aku paham."** Storage Engine + Intelligence Engine for AI agents.

> **Status: pre-alpha.** Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅. Phase 4 pending. See [PRD](docs/PRD.md) for status.

---

## Quick Start (Phase 1 — unreleased)

```bash
# Development (current)
git clone <repo>
cd capricorn
bun install && bun run typecheck

# Production (Phase 4 — not yet available)
npm install -g capricorn
capricorn init
capricorn setup hermes
```

---

## Why Capricorn?

AI agents forget. Existing tools (Uteke, Engram, Mnemosyne) remember raw data. Capricorn **understands** — enrichment pipeline, compounding preferences, persona generation, anti-hallucination by design.

| | Capricorn | Uteke | Mnemosyne | Engram |
|---|---|---|---|---|
| **LLM Enrichment** | ✅ L1→L3 (L0 via Phase 2 embeddings) | ❌ | ⚠️ | ❌ |
| **Compounding Prefs** | ✅ | ❌ | ❌ | ❌ |
| **Persona Generation** | ✅ | ❌ | ❌ | ❌ |
| **Anti-hallucination** | ✅ | ❌ | ❌ | ❌ |

---

## Docs

- [PRD](docs/PRD.md) — Requirements, roadmap, status
- [Architecture](docs/ARCHITECTURE.md) — Full system design + glossary
- [Architecture (HTML)](docs/ARCHITECTURE.html) — Visual overview

---

## Based On

- [Open Second Brain](https://github.com/itechmeat/open-second-brain)
- [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)
- [HyperTune](https://github.com/geeknik/HyperTune)
- [HaluGard](https://github.com/ppp727276/halugard)

---

## License

MIT