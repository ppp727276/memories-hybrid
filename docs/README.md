# Capricorn v2 — Docs

**"Mereka ingat, aku paham."** Storage Engine + Intelligence Engine.

> **Status:** Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅. See [PROGRESS.md](PROGRESS.md).

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

## CLI Commands

| Command | Description |
|---|---|
| `capricorn init` | Initialize vault + database |
| `capricorn remember "..."` | Store a memory |
| `capricorn recall <query>` | Search memories |
| `capricorn bridge` | Run Forge enrichment |
| `capricorn dream` | Run Dream preference compounding |
| `capricorn sync` | Two-way vault ↔ SQLite sync |
| `capricorn cron` | Start background scheduler |
| `capricorn explain <id>` | Show memory + insights |
| `capricorn enrich <id>` | On-demand enrichment |
| `capricorn benchmark` | Self-recall + latency benchmark |
| `capricorn conflicts` | Find contradictory preferences |
| `capricorn relations <id>` | Show temporal relations |

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
- [PROGRESS](PROGRESS.md) — Implementation status
- [Architecture](ARCHITECTURE.md) — Full system design + glossary
- [Prompt-ops Integration](prompt-ops-integration.md) — Phase 5 research candidate
- [Audit Prompt](audit-prompt.md) — Prompt for external agent QA review

---

## Features

| Feature | Capricorn | Uteke | Mnemosyne | Engram |
|---|---|---|---|---|
| **Storage** | SQLite + vault (md) | SQLite | SQLite | SQLite |
| **Search** | Hybrid: FTS5 + vector + RRF | Hybrid | Hybrid | FTS5 only |
| **LLM Enrichment** | ✅ L1→L3 | ❌ | ⚠️ | ❌ |
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
- [prompt-ops](https://github.com/meta-llama/prompt-ops) — prompt optimization research candidate

---

## License

MIT