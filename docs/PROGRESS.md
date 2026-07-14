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
  - `local`: stub embedder that throws "local embedder not implemented"
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

## Phase 3 — Pending

Per `docs/PRD.md`, Phase 3 covers:

- Forge pipeline port (L0→L3 from v1)
- Dream port (preference compounding)
- Validation layer (HyperTune + HaluGard)
- Confidence scoring with source_weight
- Two-way sync vault ↔ SQLite
- Cron jobs (bridge 6h, dream 1h)

Not started yet. v1 source code exists in `forge/` and `mind/` and awaits porting to the v2 architecture.
