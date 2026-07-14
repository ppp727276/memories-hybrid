# Capricorn v2 — Docs

**"Mereka ingat, aku paham."** Storage Engine + Intelligence Engine.

> **Status: pre-alpha.** Phase 1 implementation starting.

---

## Quick Start (Phase 1 — unreleased)

```bash
# Development
git clone <repo>
cd capricorn
bun install && bun run typecheck

# Production (Phase 4 — not yet available)
npm install -g capricorn
capricorn init
capricorn setup hermes
```

---

## Architecture

```
Agent ──MCP──→ Capricorn
                ├── Storage Engine (sync)
                │   └── SQLite + FTS5 + Vector + Vault (markdown)
                ├── Intelligence Engine (async)
                │   ├── Forge L0→L3 (enrichment)
                │   └── Dream (compounding)
                └── Validation Layer (0 token)
                    ├── HyperTune scoring
                    └── HaluGard G2-G4
```

---

## Docs Index

- [PRD](PRD.md) — Requirements, roadmap, status, testing strategy
- [Architecture](ARCHITECTURE.md) — Full system design + glossary
- [Architecture (HTML)](ARCHITECTURE.html) — Visual overview

---

## Features

| Feature | Capricorn | Uteke | Mnemosyne | Engram |
|---|---|---|---|---|
| **Storage** | SQLite + vault (md) | SQLite | SQLite | SQLite |
| **Search** | Hybrid: FTS5 + vector + RRF | Hybrid | Hybrid | FTS5 only |
| **LLM Enrichment** | ✅ L0→L1→L2→L3 | ❌ | ⚠️ shallow | ❌ |
| **Compounding Prefs** | ✅ confidence | ❌ | ❌ | ❌ |
| **Persona Generation** | ✅ | ❌ | ❌ | ❌ |
| **Anti-hallucination** | ✅ readable vault | ❌ | ❌ | ❌ |
| **Validation layer** | ✅ 0 token | ❌ | ❌ | ❌ |

---

## Based On

- [Open Second Brain](https://github.com/itechmeat/open-second-brain)
- [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)
- [HyperTune](https://github.com/geeknik/HyperTune)
- [HaluGard](https://github.com/ppp727276/halugard)

---

## License

MIT