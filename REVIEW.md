# Capricorn v2 — Audit Review

**Date:** 2026-07-15
**Scope:** Full source + docs + config + security surface
**Method:** `architecture-review` + `fox-hack` recon/vuln methodology
**Tools:** 35 source files read, 77 catch blocks traced, 37 file ops traced, 3 type casts found

---

## P0 — System Integrity

### 1. [GAP] `docs/architecture-reference.md` deleted but still referenced by 2 docs

`docs/ARCHITECTURE.md:18` — "| **[architecture-reference.md](architecture-reference.md)** | Interfaces, flows, migration, comparison, glossary, prompt-ops | 6-15 |"
`docs/PRD.md:174` — "- [Glossary](architecture-reference.md#14-glossary) — Term definitions"

File is deleted on disk (313 lines, not committed). Two docs reference it. Broken links.

### 2. [GAP] `install.sh` references non-existent `capricorn serve` command

`scripts/install.sh:51` — `echo "  3. Start MCP server: capricorn serve"`

CLI has no `serve` command. MCP server is started via `bun run src/mcp/server.ts` or `import.meta.main`.

### 3. [GAP] `install.sh` references non-existent `--vault` flag

`scripts/install.sh:49` — `capricorn init --vault ~/Documents/second-brain-memory`

CLI `init` handler (`cli/index.ts:48-57`) does not parse `--vault` flag. Silently ignored.

### 4. [GAP] `install.sh` uses `npm install` but project uses `bun`

`scripts/install.sh:34` — `npm install`

Project uses `bun.lock` (not `package-lock.json`). `npm install` creates conflicting lock file.

### 5. [GAP] Orphaned rows: `forget` doesn't cascade to `insights` or `preference_evidence`

`src/storage/memory.ts:107` — `DELETE FROM memories WHERE id = ?`

Schema inconsistency:
- `memories_vec` → `ON DELETE CASCADE` ✓
- `enrichment_state` → `ON DELETE CASCADE` ✓
- `insights` → `REFERENCES memories(id)` — **NO CASCADE** ✗
- `preference_evidence` → `REFERENCES memories(id)` — **NO CASCADE** ✗

Forgetting a memory leaves orphaned rows in `insights` and `preference_evidence`.

### 6. [GAP] `DreamPipeline.parseSignalFile()` returns `id: undefined` when frontmatter missing `id`

`src/intelligence/dream.ts:132-133` — `{ id: frontmatter.id, ... }` without null check.

`VaultSync.parseSignalFile()` at `sync.ts:85` has the guard (`if (!frontmatter.id) return null`). Dream version doesn't. Creates memory with `id: undefined`.

### 7. [SEC] `quoteFts5()` — FTS5 injection via special tokens

`src/storage/memory.ts:376-378` — `quoteFts5()` only escapes `"`. FTS5 MATCH syntax has tokens: `AND`, `OR`, `NOT`, `NEAR`, `^`, `*`, `(`, `)`. 

**Verdict:** SAFE. The double-quote wrapping (`"..."`) converts the query to a phrase search, which disables FTS5 syntax parsing. Only `"` needs escaping. The `*` suffix is intentional for prefix matching. Parameterized query (`MATCH ?`) prevents SQL injection. No exploit path.

### 8. [SEC] Path traversal via `ingest` CLI command

`src/cli/index.ts:145` — `readFileSync(file, "utf8")` where `file` is user-supplied positional arg.

Allows reading any file on the system. **Verdict:** ACCEPTED. CLI tool, user is the operator. Intentional read access. Not exposed via MCP. No fix needed.

### 9. [SEC] `slugify()` prevents path traversal in vault filenames

`src/utils/id.ts:7-14` — `slugify()` strips non-alphanumeric: `../` → `--`. Safe.

### 10. [SEC] No hardcoded secrets found

`llm.ts:21` — `?? "capricorn"` is a placeholder, not a real secret.
`llm.ts:20` — `?? "http://localhost:20128/v1"` is localhost, not a secret.

---

## P1 — Correctness / Edge Cases

### 11. [GAP] Duplicate `parseSignalFile()` — `dream.ts` and `sync.ts`

`src/intelligence/dream.ts:107-143` ≡ `src/storage/sync.ts:61-97`

Two identical YAML frontmatter parsers. Bug fix in one won't propagate. Extract to `src/utils/signal.ts`.

### 12. [GAP] `OsbBridge` uses `this.storage.db` directly — tight coupling

`src/bridge/osb.ts:130-134` — `queryGet(this.storage.db, "SELECT md5 FROM osb_signal_checkpoints...")`

Bridge accesses raw `Database` object, bypassing `MemoryStore`. No checkpoint abstraction in MemoryStore.

### 13. [GAP] `VaultSync.exportToVault()` — semantic mismatch

`src/storage/sync.ts:48` — `this.storage.memory.getUnprocessedMemories(1000)`

Exports only unenriched memories, not unvaulted memories. If a memory was enriched but never written to vault (e.g., vault write failed), it won't be exported.

### 14. [GAP] `validate()` claim verification is no-op

`src/intelligence/validate.ts:77-78` — `return output.length > 20;`

G2 claim verification is a length check. All LLM output passes. Effectively disabled.

### 15. [GAP] DB write succeeds but vault write fails — no rollback

`src/storage/index.ts:44-48` — `this.memory.remember()` succeeds, then `this.vault.writeSignal()` can throw. DB row persists without vault mirror.

### 16. [GAP] `relations` command fetches all 1000 rows, filters in-memory

`src/cli/index.ts:313-314` — `storage.memory.search("", 1000).filter(...)`

No temporal ordering, no actual relation computation. Returns all memories minus queried one.

### 17. [GAP] 11 silent catch blocks — errors swallowed without logging

| File | Line | Context |
|---|---|---|
| `config.ts` | 54 | Config file parse failure |
| `mcp/server.ts` | 43 | JSON parse error |
| `vault.ts` | 46, 50 | File read/delete failure |
| `sync.ts` | 37, 41, 54 | Directory read, file parse, file write failures |
| `dream.ts` | 97, 101 | Directory read, file parse failures |
| `osb.ts` | 104 | YAML parse failure |
| `scheduler.ts` | 118 | Cron job failure |

All swallow errors silently. Makes debugging impossible. No telemetry, no log, no `console.error`.

### 18. [GAP] `benchmark` UX — poor error for empty databases

`src/cli/index.ts:252` — `{ error: "no memories to benchmark" }` instead of meaningful message.

### 19. [TYPE] 3 `as unknown as` casts in `sqlite.ts` — bypass Bun type system

`src/utils/sqlite.ts:4,8,13` — `(db as unknown as { run/query: ... }).run/query(sql, ...)`

Bun's `Database` type doesn't expose `run()`/`query()` methods used by the typed wrapper. Casts work but are fragile if Bun changes internal API.

### 20. [TYPE] 1 non-null assertion `config.bridge!` in `OsbBridge`

`src/bridge/osb.ts` → called from `mcp/tools.ts:199` and `cli/index.ts:342` with `config.bridge!`. Safe because `mergeConfig()` always returns `bridge` but type says optional.

---

## P2 — Polish / Future

### 21. [GAP] `cron` command doesn't persist state across restarts

`src/scheduler.ts:83-85` — `lastRun` key is in-memory only. Already documented in PROGRESS.md.

### 22. [GAP] No `capricorn.config.json` example/template in repo

Config auto-generated by `saveConfig()` during `init`. No example for users to reference.

### 23. [GAP] `tsconfig.json` excludes `bridge` but `tsconfig.check.json` excludes `forge` — stale excludes

`tsconfig.json:20` — `"exclude": ["bridge", "forge", "mind"]`
`tsconfig.check.json:4` — `"exclude": ["forge"]`

`bridge/` and `mind/` top-level dirs were removed (commit `114ee5a`). Stale excludes. No runtime impact.

### 24. [GAP] `prompt-ops record` CLI passes empty `input`/`output` strings

`src/cli/index.ts:300` — `storage.promptOps.recordOutcome(variantId, "", "", score)`

MCP version supports `input`, `output`, `metadata`. CLI version passes empty strings.

### 25. [GAP] `schedule.ts` doesn't validate cron patterns

`src/scheduler.ts:26-34` — `cronMatch()` splits by `/\s+/`. Invalid patterns (fewer than 5 parts) return `false` silently.

---

## Verified Safe (No Exploit)

| Area | Check | Result |
|---|---|---|
| Command injection | `child_process`, `exec`, `spawn` | Not used in src/ |
| Hardcoded secrets | API keys, tokens, passwords | None found |
| FTS5 injection | `quoteFts5()` + parameterized MATCH | Safe — double-quote wrapping |
| Path traversal (vault) | `slugify()` strips non-alphanumeric | Safe |
| Path traversal (ingest) | CLI operator reads any file | Accepted — intentional |
| MCP auth | No auth on MCP stdio | Accepted — local process |
| LLM prompt injection | No sanitization of memory content in prompts | Accepted — enrichment pipeline, not user-facing |

---

## Summary

| Severity | Count | Category |
|---|---|---|
| **P0** | 6 | install.sh bugs, orphaned FKs, missing doc, undefined id |
| **P1** | 10 | duplicate code, silent catches, semantic mismatches, no-op validation |
| **P2** | 5 | polish, stale config, missing examples |
| **Total** | 21 | |

**Security verdict:** No exploitable vulnerabilities found. The attack surface is minimal (CLI operator + local MCP stdio). FTS5 queries are safe. Path operations use safe patterns. No command injection surface. No hardcoded secrets.

**P0 action items (fix immediately):**
1. Restore `architecture-reference.md` or remove all references
2. Fix `install.sh:51` — remove `capricorn serve` line
3. Fix `install.sh:49` — remove `--vault` flag or implement it
4. Fix `install.sh:34` — `npm install` → `bun install`
5. Add `ON DELETE CASCADE` to `insights.memory_id` and `preference_evidence.memory_id`
6. Add `if (!frontmatter.id) return null` in `DreamPipeline.parseSignalFile()`