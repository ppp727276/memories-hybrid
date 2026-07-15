# Capricorn v2 — PRD

**"Mereka ingat, aku paham."** Storage Engine + Intelligence Engine.

> **Status: Final Product.** Phase 1 through Phase 6 implemented. See [PROGRESS](PROGRESS.md) for details.

---

## Problem

AI agents forget everything between sessions. Existing memory tools (Uteke, Engram, Mnemosyne) are storage engines — they remember raw data. None understand what the data means, synthesize insights, or compound knowledge over time.

**Capricorn solves this:** dual-engine architecture that stores AND understands.

---

## Current Status

| Phase | Status | Target |
|---|---|---|
| **Phase 1** | ✅ Done | FTS5-only core |
| **Phase 2** | ✅ Done | Vector search + multi-agent setup |
| **Phase 3** | ✅ Done | Enrichment pipeline port |
| **Phase 4** | ✅ Done | Distribution + benchmarks + advanced intelligence |
| **Phase 5** | ✅ Done | Prompt-ops integration |
| **Phase 6** | ✅ Done | OSB Bridge Integration |

---

## Goals

### P0 — Must Have (Phase 1) — FTS5-only core

- [x] `capricorn init` — initialize vault + database
- [x] `capricorn remember` — store memories (SQLite + FTS5 + vault write-through)
- [x] `capricorn recall` — keyword search via FTS5
- [x] `capricorn forget` — delete memories
- [x] `capricorn stats` — memory statistics
- [x] `capricorn context` — distilled context for agent injection
- [x] `capricorn setup hermes` — auto-configure MCP
- [x] MCP server (stdio, JSON-RPC 2.0)
- [x] SQLite schema + migrations
- [x] Vault write-through (markdown mirror)
- [x] Schema migration tests + MCP round-trip tests

### P1 — Should Have (Phase 2) — Vector search

- [x] Vector search (API default: text-embedding-v3, 1024d)
- [x] RRF fusion (hybrid: FTS5 + vector)
- [x] `capricorn setup claude|codex|cursor|windsurf`
- [x] Offline mode (FTS5 fallback when no vector)
- [x] `capricorn search` — full-text search
- [x] `capricorn ingest` — bulk import
- [x] Local embedder fallback (deterministic, no ONNX dep) — Phase 4

### P2 — Nice to Have (Phase 3) — Enrichment

- [x] Forge pipeline port (L1→L3 from v1)
- [x] Dream port (preference compounding)
- [x] Validation layer (HyperTune + HaluGard G2-G4) with `review_queue` for human review
- [x] Confidence scoring with source_weight
- [x] Two-way sync vault ↔ SQLite
- [x] Cron scheduler daemon (`capricorn cron`)

### P3 — Future (Phase 4) — Distribution

- [x] `npm publish`
- [x] Binary distribution (Bun compile)
- [x] Benchmark harness (self-recall + latency)
- [x] Semantic conflict detection
- [x] Temporal relations view
- [x] `capricorn explain <id>`
- [x] `capricorn enrich` — on-demand enrichment

### P4 — Research (Phase 5) — Prompt optimization

- [x] Prompt-ops integration for Capricorn context + HaluGard gates + HyperTune scorer (lightweight TS implementation)
- [x] Build eval datasets from session logs and labeled outputs (eval_cases table + CLI/MCP capture)
- [x] Offline prompt optimization pipeline (dueling bandits / Thompson sampling)

### P5 — Enhancement (Phase 6) — OSB Bridge Integration

- [x] Ingest signals from `Brain/inbox/*.md` with frontmatter YAML parsing
- [x] MD5-based checkpoint/idempotency per signal
- [x] `capricorn bridge-osb` one-shot command for Hermes cron
- [x] Persona merge into `persona-core.md` with `<!-- status: frozen -->` preservation
- [x] Config-driven paths, LLM, embedding, and cron timing via `capricorn.config.json` (or `CAPRICORN_CONFIG` env override)
- [x] Smoke test: signal → enrichment → persona written

---

## Non-Goals

- **Not** a Hermes hook/bridge — standalone MCP server
- **Not** a command guard — use dcg for that
- **Not** a real-time hallucination detector — use HaluGard standalone for that
- **No** cloud sync (v2)
- **No** vector search in P0 — FTS5 only to keep scope minimal

---

## Success Metrics

| Metric | Target | How |
|---|---|---|
| Install time | < 60 seconds | `npm install -g capricorn && capricorn init` |
| Recall latency | < 100ms (FTS5) | SQLite + FTS5 local |
| Context injection | < 3000 chars | `capricorn.context` distilled block |
| Offline capable | FTS5 recall works without API | Graceful degradation |
| Anti-hallucination | Human-auditable vault | All memories mirrored to markdown |
| Prompt optimization | A/B dueling via bandits | `capricorn prompt-ops` |

---

## Testing Strategy

| Layer | Tests | Priority |
|---|---|---|
| **Schema** | Migration up/down, edge cases (null, duplicate, concurrent) | P0 |
| **MCP** | Round-trip: remember → recall → forget → stats | P0 |
| **FTS5** | Keyword search accuracy, CJK tokenization, special chars | P0 |
| **Vault** | Write-through consistency, path safety, read-only FS | P0 |
| **Vector** | Embedding accuracy, RRF fusion, offline fallback | P1 |
| **Enrichment** | Forge pipeline output quality, validation layer | P2 |
| **Benchmark** | Self-recall + latency | P3 |
| **Prompt-ops** | Variant selection, dueling, outcome scoring | P3 |

---

## User Stories

### Agent Developer

1. "As an agent developer, I want my agent to remember user preferences across sessions so I don't reintroduce myself."
2. "As an agent developer, I want to search memories by meaning, not just keywords."
3. "As an agent developer, I want to audit what my agent remembers to verify no hallucination."

### End User

1. "As a user, I want my agent to understand me, not just remember raw facts."
2. "As a user, I want to read what the agent knows about me in plain text."
3. "As a user, I want to correct the agent when it's wrong and have that correction stick."

---

## Technical Constraints

- **Runtime:** Bun (primary — CLI, SQLite native via `bun:sqlite`, TS, binary compile). Node.js v22+ (secondary — for CI/testing compatibility).
- **Storage:** SQLite (bun:sqlite), vault markdown (plain text)
- **Embedding:** text-embedding-v3 API (1024d, default), local deterministic fallback (768d hash-based)
- **Validation:** all-MiniLM-L6-v2 (384d, local, 0 token) — separate from storage embeddings
- **LLM:** OpenAI-compatible API (deepseek-v4-pro via OmniRoute)
- **MCP:** stdio transport, JSON-RPC 2.0
- **Platform:** Windows 10 primary, macOS/Linux secondary

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| LLM API down | Enrichment stops | Graceful degradation — recall still works via FTS5 |
| SQLite corruption | All data lost | Vault backup (markdown) + daily backup script |
| Token cost overrun | Bridge too expensive | Batch limits, cron schedule, local embeddings optional |
| HaluGard dataset gap | Validation layer weak | Shadow mode first, collect data passively |
| Solo developer | Slow progress | P0 scope ≤ 2 weeks, freeze P2/P3 until P0 ships, AI pair-programming |
| Two-way sync race | Human edit lost | Last-write-wins + conflict markers + `capricorn resolve` |

---

## References

- [Architecture](ARCHITECTURE.md) — Full system design
- [Glossary](architecture-reference.md#14-glossary) — Term definitions

---

## Phase 6+ — Future Roadmap

### Phase 6 — OSB Bridge Integration (Backport v1)

Capricorn v2 final product is a standalone engine. Phase 6 brings parity with the original `memories-hybrid` v1 by adding an OSB signal bridge on top of the existing engine.

- [x] Ingest signals from `Brain/inbox/*.md` with frontmatter YAML parsing
- [x] MD5-based checkpoint/idempotency per signal
- [x] `capricorn bridge-osb` one-shot command for Hermes cron
- [x] Persona merge into `persona-core.md` with `<!-- status: frozen -->` preservation
- [x] Config-driven paths, LLM, embedding, and cron timing via `capricorn.config.json` (or `CAPRICORN_CONFIG` env override)
- [x] Smoke test: signal → enrichment → persona written

### Phase 7 — Advanced Local Models

- [ ] ONNX local embedder (EmbeddingGemma Q4, 768d) — real offline embedding
- [ ] Validation-only local model (all-MiniLM-L6-v2 already used for 0-token validation)
- [ ] Optional quantization and runtime selection

### Phase 8 — Distribution & Scale

- [ ] Multi-vault support
- [ ] Cloud sync (optional, v3)
- [ ] Web dashboard for memory audit
- [ ] Conflict resolution UI
- [ ] LongMemEval / BEAM benchmark integration

---

> Final product = Phase 1–5. Phase 6+ is enhancement and v1 parity, not required for the core product to be considered complete.
