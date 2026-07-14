# Progress — Capricorn v2

## Phase 1 — Storage Engine Core (DONE)

Phase 1 delivers the Capricorn v2 storage engine: SQLite + FTS5 + vault sync.

### Deliverables

- `src/types.ts` — `Memory`, `MemoryInput`, `CapricornConfig`, `SearchResult`, `StatsResult` types.
- `src/config.ts` — config load/merge, `CAPRICORN_CONFIG` override, default paths.
- `src/utils/id.ts` — deterministic-ish ID generator (`mem_<timestamp>_<rand>`).
- `src/utils/sqlite.ts` — typed wrapper around `bun:sqlite`.
- `src/storage/db.ts` — SQLite init, migrations, schema versions, `memories_fts` (trigram), `memories` table.
- `src/storage/memory.ts` — `MemoryStore` (remember, recall, search, forget, stats).
- `src/storage/vault.ts` — `VaultWriter` writes signals to `Brain/inbox/sig-*.md`.
- `src/storage/index.ts` — `CapricornStorage` orchestrates DB + vault, computes real DB + vault sizes for stats.
- `src/cli/index.ts` — CLI commands: `init`, `remember`, `recall`, `search`, `forget`, `stats`, `context`, `setup hermes`.
- `src/mcp/server.ts` + `tool-defs.ts` + `tools.ts` — MCP stdio server with JSON-RPC 2.0 tools.
- `src/mcp/tools.test.ts` — MCP round-trip test.
- `src/index.ts` — package entrypoint.

### Key Fixes from Audit

- Windows path resolution via `fileURLToPath`.
- Real `stats()` via `CapricornStorage` wrapper (DB + vault sizes from filesystem).
- FTS5 `trigram` tokenizer for substring + CJK support.
- Backup agent MCP config (hermes/claude/codex/cursor/windsurf) before overwrite.
- Reject empty `content`.
- `brain_feedback` enum validation.

### Verification

- `bun run typecheck` — pass.
- `bun run test` — 75 pass.
- Manual end-to-end CLI smoke test passed.

### Commits

- `89da8ac` — `fix: audit findings — Phase 1 blockers + HIGH`

---

## Phase 2 — Vector Search + Multi-Agent Setup (DONE)

Phase 2 adds vector search, hybrid FTS+vector recall, multi-agent MCP setup, and ingest.

### Deliverables

- `src/storage/db.ts` — added `memories_vec` table (BLOB embeddings).
- `src/embeddings.ts` — `Embedder` interface + providers:
  - `api`: OpenAI-compatible embedding API
  - `none`: no-op embedder
  - `local`: deterministic seeded-hash embedder (offline fallback, no ONNX dep).
- `src/storage/memory.ts` — added:
  - `recallByVector(embedding, topK, project)`
  - `recallHybrid(queryText, embedding, topK, project)` with RRF fusion
- `src/storage/index.ts` — `CapricornStorage` accepts config, embeds on `remember`, falls back to keyword-only if embedding fails.
- `src/cli/index.ts` —
  - `recall` / `search` now async
  - `setup <hermes|claude|codex|cursor|windsurf>`
  - `ingest <file>` command
- `src/mcp/tools.ts` / `server.ts` — async handlers for recall/search/forget/remember.
- `src/storage/vector.test.ts` — vector similarity + RRF tests.
- `src/storage/ingest.test.ts` — multi-line ingest test.
- `src/storage/memory.test.ts` — updated to pass config with `vector_provider: "none"`.

### Verification

- `bun run typecheck` — pass.
- `bun run test` — 78 pass, 0 fail.
- Smoke test (`init` → `remember` → `recall` → `stats`) passed.
- `setup claude` and `setup windsurf` verified.

### Notes

- MCP server launch requires `bun` in PATH. Node fallback is planned for Phase 4 distribution.

### Commits

- `655150e` — `feat: Phase 2 — vector search + multi-agent setup + RRF`
- `a629343` — `fix: Phase 2 test config type completeness`

---

## Phase 3 — Enrichment Pipeline (DONE)

Phase 3 ports the v1 enrichment pipeline to v2: Forge L1→L3, Dream preference compounding, validation layer, confidence scoring, two-way vault sync, and cron-ready CLI commands.

### Deliverables

- `src/intelligence/llm.ts` — OpenAI-compatible LLM runner with graceful degradation stub.
- `src/intelligence/forge.ts` — `ForgePipeline` class implementing L1 extraction, L2 scene synthesis, L3 persona generation.
- `src/intelligence/dream.ts` — `DreamPipeline` class: inbox scan, preference matching, confidence updates, tier promotion/retirement, `active.md` generation.
- `src/intelligence/confidence.ts` — `source_weight`, decay, confidence delta, clamping.
- `src/intelligence/validate.ts` — HyperTune (coherence/relevance/quality) + HaluGard G2-G4 (claim verify, contradiction, drift) validation layer.
- `src/intelligence/similarity.ts` — shared cosine similarity helper.
- `src/intelligence/sync.ts` — `VaultSync` two-way sync between vault markdown and SQLite.
- `src/intelligence/index.ts` — public exports.
- `src/types.ts` — added `Insight`, `Preference`, `PreferenceEvidence`, `Persona`, `ValidationResult`, `SourceType`.
- `src/storage/db.ts` — migration 002: `enrichment_state` table + `source_type`/`source_weight` columns on `preference_evidence`.
- `src/storage/memory.ts` — enrichment helpers: unprocessed memory queue, insight/preference/evidence/persona CRUD.
- `src/cli/index.ts` — added `bridge`, `dream`, `sync` commands.
- `src/mcp/tools.ts` / `tool-defs.ts` — added `capricorn.bridge`, `capricorn.dream`, `capricorn.sync` tools.
- Tests: `src/intelligence/confidence.test.ts`, `src/intelligence/sync.test.ts`, `src/intelligence/forge.test.ts`, `src/intelligence/dream.test.ts`, `src/intelligence/validate.test.ts`.

### Verification

- `bun run typecheck` — pass.
- `bun run test` — 94 pass, 0 fail.
- `bun run build` — pass.
- `bun run smoke:phase3` — pass (automated CLI smoke: bridge → dream → sync).

### Notes

- Forge enrichment is disabled when `CAPRICORN_LLM_BASE_URL` is unset and `intelligence.forge.llm_provider` is `"none"`; the pipeline marks unprocessed memories as skipped without crashing.
- Validation layer currently uses heuristic similarity when real embeddings are unavailable; the interface accepts an optional `embed` function for future 384d local embedder integration. HaluGard G2 claim-verify is a placeholder (length heuristic) pending SQLite evidence search.
- Forge L3 persona/insight validation is advisory-only: validation flags are attached to insight metadata but never block storage. A hard gate is planned for Phase 4.
- Cron scheduler daemon implemented in `src/scheduler.ts` via `capricorn cron`.

### Post-Review Fixes

- Restored `docs/audit-prompt.md` (accidentally emptied).
- Corrected PRD status text from "Phase 3 pending" to "Phase 1 through Phase 3 implemented".
- Fixed `capricorn.context` to read confirmed preferences and latest persona from DB instead of returning a stub.
- Removed duplicate `sourceWeight`; storage layer now imports from `src/intelligence/confidence.ts`.
- Wired optional `embed` function into validation coherence/relevance checks.
- Fixed `VaultSync` to preserve original vault signal IDs via `MemoryStore.importMemory`.
- Fixed `DreamPipeline` single-pass confidence computation; trials now seed initial evidence.
- Fixed `DreamPipeline` frontmatter parser so body content is no longer swallowed after the second `---`.
- Added `stored.content` assertion to `src/intelligence/sync.test.ts`.
- Updated `README.md` Phase status and corrected "L0→L3" to "L1→L3".
- Fixed CLI `dream` help text and noted `context` outputs JSON.
- Added `scripts/smoke-phase3.ts` and `bun run smoke:phase3` for automated Phase 3 smoke testing.
- Documented Forge L3 validation as advisory-only.
- Removed committed review files (`review-*.md`) and added them to `.gitignore`.
- Fixed `src/intelligence/forge.ts` duplicate L3 insight write that caused SQLite UNIQUE constraint failure.

### Commits

- `aa72649` — `feat: Phase 3 enrichment pipeline + review fixes`
- `76f2e12` — `fix: close all remaining Phase 3 review findings`

---

## Phase 4 — Distribution + Advanced Intelligence (DONE)

Phase 4 completes the Capricorn v2 final release: distribution packaging, cron daemon, local embedder, benchmarks, conflict detection, temporal relations, and additional CLI commands.

### Deliverables

- `src/scheduler.ts` — `CapricornScheduler` daemon with minimal cron matching for `bridge`, `dream`, and `sync`.
- `src/cli/index.ts` — new commands: `cron`, `explain <id>`, `enrich <id>`, `benchmark`, `conflicts`, `relations <id>`.
- `src/embeddings.ts` — deterministic `LocalEmbedder` fallback (seeded hash-based vectors) for offline use.
- `src/benchmark.ts` — `BenchmarkRunner` for self-recall / latency metrics.
- `src/intelligence/conflict.ts` — semantic conflict detection via antonym pairs.
- `package.json` — `build:binary`, `prepublishOnly`, `smoke:phase4` scripts; `bin`, `main`, `exports` already configured for npm.
- `scripts/smoke-phase4.ts` — automated Phase 4 smoke test (bridge → dream → sync → local embedder).

### Verification

- `bun run typecheck` — pass.
- `bun run test` — 94 pass, 0 fail.
- `bun run build` — pass.
- `bun run smoke:phase3` — pass.
- `bun run smoke:phase4` — pass.

### Notes

- Local embedder is a deterministic fallback, not a real ONNX model. Real EmbeddingGemma/Q4 integration remains a future enhancement.
- Temporal relations are implemented as a read-only chronological view (`relations <id>`), not a persisted graph DB.
- Cron scheduler runs one-shot jobs; it does not yet persist state across restarts or support timezone offsets.

### Commits

- `76f2e12` — `fix: close all remaining Phase 3 review findings`
- `d160a61` — `docs: update PROGRESS.md post-verification`

---

## Phase 5 — Research (Future)

Prompt-ops integration for offline prompt optimization. See `docs/prompt-ops-integration.md`.
