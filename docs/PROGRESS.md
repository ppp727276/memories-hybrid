# Progress — Capricorn v2

> **Status: Final Product.** All planned phases (1–6) implemented. See [PRD](PRD.md) for feature breakdown.

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

- MCP server launch requires `bun` in PATH. Node fallback remains a future distribution enhancement.

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
- `src/storage/sync.ts` — `VaultSync` two-way sync between vault markdown and SQLite.
- `src/intelligence/index.ts` — public exports.
- `src/types.ts` — added `Insight`, `Preference`, `PreferenceEvidence`, `Persona`, `ValidationResult`, `SourceType`.
- `src/storage/db.ts` — migration 002: `enrichment_state` table + `source_type`/`source_weight` columns on `preference_evidence` + `review_queue` table for validation-layer holdbacks.
- `src/storage/memory.ts` — enrichment helpers: unprocessed memory queue, insight/preference/evidence/persona CRUD, review queue CRUD.
- `src/cli/index.ts` — added `bridge`, `dream`, `sync`, and `review` commands.
- `src/mcp/tools.ts` / `tool-defs.ts` — added `capricorn.bridge`, `capricorn.dream`, `capricorn.sync`, and `capricorn.review` tools.
- Tests: `src/intelligence/confidence.test.ts`, `src/storage/sync.test.ts`, `src/intelligence/forge.test.ts`, `src/intelligence/dream.test.ts`, `src/intelligence/validate.test.ts`.

### Verification

- `bun run typecheck` — pass.
- `bun run test` — 107 pass, 0 fail.
- `bun run build` — pass.
- `bun run smoke:phase3` — pass (automated CLI smoke: bridge → dream → sync).

### Notes

- Forge enrichment is disabled when `CAPRICORN_LLM_BASE_URL` is unset and `intelligence.forge.llm_provider` is `"none"`; the pipeline marks unprocessed memories as skipped without crashing.
- Validation layer currently uses heuristic similarity when real embeddings are unavailable; the interface accepts an optional `embed` function for future 384d local embedder integration. HaluGard G2 claim-verify is a placeholder (length heuristic) pending SQLite evidence search.
- Validation layer now acts as a **hard gate**: all enrichment outputs pass through `validate()` and `decide()` before persistence. Low-confidence or flagged outputs are routed to the `review_queue` instead of main storage.
- Forge L3 persona/insight validation is now a hard gate: outputs with decision `review-queue` are not written to storage; `merge-warning` outputs are stored with warning metadata.
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
- Added `stored.content` assertion to `src/storage/sync.test.ts`.
- Updated `README.md` Phase status and corrected "L0→L3" to "L1→L3".
- Fixed CLI `dream` help text and noted `context` outputs JSON.
- Added `scripts/smoke-phase3.ts` and `bun run smoke:phase3` for automated Phase 3 smoke testing.
- Updated validation layer to a hard gate in `src/intelligence/forge.ts` and `src/intelligence/dream.ts`.
- Moved `VaultSync` from `src/intelligence/sync.ts` to `src/storage/sync.ts` and updated all imports.
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
- `bun run test` — 107 pass, 0 fail.
- `bun run build` — pass.
- `bun run smoke:phase3` — pass.
- `bun run smoke:phase4` — pass.

### Notes

- Local embedder is a deterministic fallback, not a real ONNX model. Real EmbeddingGemma/Q4 integration remains a future enhancement.
- Temporal relations are implemented as a read-only chronological view (`relations <id>`), not a persisted graph DB.
- Cron scheduler runs one-shot jobs; it does not yet persist state across restarts or support timezone offsets.

### Commits

- `955cc9b` — `feat: Phase 4 final distribution + advanced intelligence`
- `ed01d72` — `docs: sync all docs for Phase 4 completion`

---

## Phase 5 — Prompt Optimization (DONE)

- Lightweight TypeScript prompt-ops engine in `src/intelligence/prompt-ops.ts`
- SQLite tables: `prompt_variants`, `prompt_outcomes`, `eval_cases`
- Thompson-style bandit selection with dueling variant support
- CLI: `capricorn prompt-ops <list|report|create|duel|record>`
- MCP tool: `capricorn.prompt_ops`
- Eval dataset capture via `eval_cases` table and MCP/CLI record paths

### Verification

- `bun run typecheck` — pass.
- `bun run test` — 107 pass, 0 fail.
- `bun run build` — pass.
- `bun run smoke:phase3` — pass.
- `bun run smoke:phase4` — pass.

### Notes

- Does not use Meta's Python prompt-ops; implemented natively in TypeScript to avoid Python dependency.
- Dueling bandits use Beta posterior sampling; fallback to normal approximation for large win/loss counts.

### Commits

- `1ea14e3` — `feat: Phase 5 prompt-ops optimization engine`

---

## Phase 6 — OSB Bridge Integration (DONE)

Bring original `memories-hybrid` v1 capabilities into Capricorn v2:

- `src/bridge/osb.ts` — ingestion, checkpoint, persona merge
- `src/bridge/osb.test.ts` — unit test
- `capricorn bridge-osb [--dry-run]` CLI
- MCP tool `capricorn.bridgeOsb`
- Smoke test `bun run smoke:osb`

Verification:

- `bun run test` — 107 pass, 0 fail
- `bun run smoke:osb` — OSB BRIDGE SMOKE PASS

### Commits

- `513b132` — `feat: Phase 6 OSB bridge integration (signal ingestion, checkpoint, persona merge)`

### Phase 7+ — Advanced local models, multi-vault, cloud sync, web dashboard

---

> Final product = Phase 1–6. Phase 7+ is future enhancement.

## Code — DFD Alignment (DONE)

Refactor Capricorn v2 code to match finalized DFD architecture.

### Changes

- Moved `VaultSync` from `src/intelligence/` to `src/storage/` (DFD places sync responsibility in Storage Engine).
- Enforced Validation Layer as gatekeeper: `ForgePipeline` and `DreamPipeline` now call `validate()` + `decide()` before any persistence.
- Added `Decision` type with three outputs: `auto-merge`, `merge-warning`, `review-queue`.
- Added `review_queue` table and `MemoryStore` methods for queued items.
- Updated `docs/PROGRESS.md` references to `src/storage/sync.ts`.

### Verification

- `bun run typecheck` — pass
- `bun run test` — 107 pass, 0 fail
- `bun run build` — pass

---

## Directory Cleanup (DONE)

Remove old standalone packages and temporary files before GitHub push. This is purely cleanup; it does not change Capricorn v2 architecture.

### Changes

- Removed top-level `bridge/` and `mind/` directories (old standalone packages, not referenced by `src/`).
- Removed `review-*.md` and `docs/review-*.md` scratch files.
- Retained `forge/` directory for active red-team tests/utilities (109 tracked files).
- Restored `docs/capricorn-dfd.html` to document current architecture.
- Updated `.gitignore` to remove obsolete `bridge/`, `mind/`, `tencentdb/`, and `bridge-config*.json` entries.
