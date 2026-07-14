# Capricorn v2 — Final Product

**"Mereka ingat, aku paham."** Storage Engine + Intelligence Engine for AI agents.

> **Status: Final Product.** Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅ · Phase 5 ✅. See [PRD](docs/PRD.md) for details.

---

## Quick Start

```bash
# Development
git clone <repo>
cd capricorn
bun install && bun run typecheck

# Production
npm install -g capricorn
capricorn init
capricorn setup hermes
```

---

## Why Capricorn?

AI agents forget. Existing memory tools (Uteke, Engram, Mnemosyne) remember raw data. Capricorn **understands** — enrichment pipeline, compounding preferences, persona generation, anti-hallucination by design.

| | Capricorn | Uteke | Mnemosyne | Engram |
|---|---|---|---|---|
| **Storage** | SQLite + vault (md) | SQLite | SQLite | SQLite |
| **Search** | Hybrid: FTS5 + vector + RRF | Hybrid | Hybrid | FTS5 only |
| **LLM Enrichment** | ✅ L1→L3 | ❌ | ⚠️ | ❌ |
| **Compounding Prefs** | ✅ confidence | ❌ | ❌ | ❌ |
| **Persona Generation** | ✅ | ❌ | ❌ | ❌ |
| **Anti-hallucination** | ✅ readable vault | ❌ | ❌ | ❌ |
| **Validation layer** | ✅ 0 token | ❌ | ❌ | ❌ |
| **Prompt Optimization** | ✅ dueling bandits | ❌ | ❌ | ❌ |

---

## Docs

- [PRD](docs/PRD.md) — Requirements, roadmap, status
- [PROGRESS](docs/PROGRESS.md) — Implementation status
- [Architecture](docs/ARCHITECTURE.md) — Full system design + glossary
- [Architecture (HTML)](docs/ARCHITECTURE.html) — Visual overview

---

## Based On

- [Open Second Brain](https://github.com/itechmeat/open-second-brain)
- [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)
- [HyperTune](https://github.com/geeknik/HyperTune)
- [HaluGard](https://github.com/ppp727276/halugard)
- [prompt-ops](https://github.com/meta-llama/prompt-ops) — prompt optimization reference

---

## License

MIT
