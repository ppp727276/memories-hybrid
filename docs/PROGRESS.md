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
- `src/storage/index.ts` — `CapricornStorage` orchestrates DB + vault.
- `src/cli/index.ts` — CLI commands: `init`, `remember`, `recall`, `search`, `forget`, `stats`, `context`, `setup hermes`.
- `src/mcp/server.ts` + `tool-defs.ts` + `tools.ts` — MCP stdio server with JSON-RPC 2.0 tools.
- `src/index.ts` — package entrypoint.

### Key Fixes from Audit

- Windows path resolution via `fileURLToPath`.
- Real `stats()` (DB + vault sizes from filesystem).
- FTS5 `trigram` tokenizer for substring + CJK support.
- Backup `~/.hermes/mcp.json` before overwrite.
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
  - `local`: placeholder for local embedder
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

### Commits

- `655150e` — `feat: Phase 2 — vector search + multi-agent setup + RRF`
- `a629343` — `fix: Phase 2 test config type completeness`

---

## Phase 3 — Pending

Per `docs/PRD.md`, Phase 3 covers:

- Forge L0→L3 intelligence pipeline
- Dream compounding / preference generation cron
- HyperTune + HaluGard validation layer integration
- Multi-agent context protocol

Not started yet.
