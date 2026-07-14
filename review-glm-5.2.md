## Summary
- Overall status: NEEDS_FIX
- P0 blockers: 0
- P1 must-fix: 2
- P2 polish: 3

## Findings

### HAL-1 — Cron jobs claimed done
- Claim: PRD.md:66 marks `[x] Cron jobs (bridge 6h, dream 1h)` as done; PROGRESS.md:87 claims "cron-ready CLI commands".
- Evidence: `grep` for `cron|setInterval|setTimeout|schedule` across `src/` returns only `schedule: string` config fields (config.ts:20,29) and schedule strings in test fixtures. No scheduler, daemon, or timer logic exists. The `bridge`/`dream`/`sync` commands (cli/index.ts:169-198) are manual one-shot invocations. "Cron-ready" is accurate; "Cron jobs" marked [x] is not.
- Severity: P1
- Fix: Uncheck PRD.md:66 or implement an actual scheduler. Minimal fix: change `[x]` to `[ ]` and note commands are cron-ready (manual hook).

### GAP-1 — Vault sync import discards signal id
- Missing: id round-trip integrity in `VaultSync.importFromVault`.
- Where: src/intelligence/sync.ts:34 calls `this.storage.memory.remember(memory)` passing a full `Memory`, but `MemoryStore.remember` (memory.ts:19-33) expects `MemoryInput` and generates a NEW id via `generateId("mem")`, ignoring `memory.id`. The frontmatter `id` (parsed at sync.ts:80-82) is checked via `getById(memory.id)` at line 33 but the stored row gets a different id. Imported signals cannot be re-synced or deduplicated by original id.
- Severity: P1
- Fix: Add an `importMemory(memory: Memory)` method to `MemoryStore` that preserves the incoming id, or upsert on conflict. Add a round-trip test that creates an inbox signal file, syncs, and asserts the stored id matches.

### GAP-2 — No tests for Forge or Dream pipelines
- Missing: tests for `ForgePipeline` (forge.ts) and `DreamPipeline` (dream.ts).
- Where: PROGRESS.md:104 lists only `confidence.test.ts` and `sync.test.ts` as Phase 3 tests — accurate, but the two core pipeline classes (105-line forge.ts, 168-line dream.ts) have zero test coverage. `sync.test.ts:37` only asserts `exported >= 0` and never creates inbox signal files, so the import path is untested.
- Severity: P2
- Fix: Add forge.test.ts (stub LLM runner, assert L1/L2/L3 insights + enrichment_state marked done) and dream.test.ts (seed preferences + inbox signals, assert promotion/retirement + active.md generation).

### GAP-3 — HaluGard G2 claim-verify is an undisclosed stub
- Missing: disclosure that G2 is a placeholder.
- Where: src/intelligence/validate.ts:57-60 — `claimVerify` returns `output.length > 20`. PROGRESS.md:95 claims "HaluGard G2-G4 (claim verify, contradiction, drift)". The note at line 115 discloses heuristic fallback for embeddings but not that G2 itself is a length check.
- Severity: P2
- Fix: Add a note to PROGRESS.md:115 stating G2 claim-verify is a placeholder pending SQLite evidence search.

### CONFLICT-1 — validate() accepts embed param but never uses it
- Inconsistency: `validate(input, embed?)` signature implies embedding-based similarity, but `embed` is never called.
- Between: PROGRESS.md:115 ("interface accepts an optional embed function") and src/intelligence/validate.ts:34-44 where `computeCoherence` and `computeRelevance` accept `embed` then return heuristic results unconditionally (line 39 comment: "kept synchronous for stub path"). `contradictionCheck` (line 65) and `driftDetect` (line 73) DO use `embed` via `semanticSimilarity`, so the param is partially wired — only the HyperTune sub-scores ignore it.
- Severity: P2
- Fix: Either wire `embed` into coherence/relevance (await the embed call) or document that HyperTune sub-scores are always heuristic while HaluGard gates support embeddings.

## Verification Log
- git status: 9 modified files + untracked `src/intelligence/` (10 files). Matches PROGRESS Phase 3 deliverables.
- bun run typecheck: PASS
- bun run test: PASS (84/84 tests, 152 expect calls, 10 files)
- bun run build: PASS (cli.mjs 46.66 KB, index.mjs 22.0 KB)
- All 10 claimed intelligence files exist on disk (forge, dream, validate, confidence, similarity, sync, llm, index, + 2 tests)
- Migration 002 (db.ts:110-126) references tables (insights, preferences, preference_evidence, personas) defined in migration 1 (db.ts:57-93) — ALTER TABLE is safe.

## Final Verdict
NEEDS_FIX. The code builds, typechecks, and all 84 tests pass; all 10 claimed intelligence files exist and contain the described classes. However, the agent's claim cannot be fully trusted: PRD.md:66 marks "Cron jobs" as done when no scheduler exists (HAL-1), and `VaultSync.importFromVault` silently discards signal ids due to a `MemoryInput` type mismatch (GAP-1) — a latent correctness bug masked by shallow test coverage. Top priority: uncheck the cron claim in PRD.md and add an id-preserving import path with a round-trip test. The remaining P2 items (pipeline test gaps, G2 stub disclosure, unused embed param) are polish and do not block trust in the delivered code.
