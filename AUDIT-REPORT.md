# Capricorn v2 — Audit & Hardening Report

**Date:** 2026-07-16
**Auditor:** Shade (Rprad operator)
**Commit:** `815ddf8` — `fix: harden MCP storage and vault sync`
**Branch:** `capricorn` → `origin/capricorn`

---

## 1. Pre-Audit State

Audit dilakukan **sebelum install** dengan metode:

| Method | Status |
|---|---|
| `fox-hack` skill | Tidak tersedia |
| T3MP3ST framework | Doctor PASS, LLM keys unset → agent audit tidak bisa jalan |
| Static code review | 46 source + 20 test files dibaca |
| `bun run typecheck` | PASS |
| `bun test` | 114 pass, 0 fail |
| `bun run build` | PASS |
| `smoke:phase3/4/osb` | PASS |

---

## 2. Temuan Awal (Pre-Fix)

### P0 — System Integrity

| ID | Issue | Lokasi | Dampak |
|---|---|---|---|
| P0-1 | `setup` command menulis `bun.exe mcp` — Bun menganggap `mcp` sebagai script, bukan subcommand | `src/cli/index.ts:161` | MCP server tidak bisa dijalankan oleh agent |
| P0-2 | Orphan rows: `forget` tidak cascade ke `insights` dan `preference_evidence` | `src/storage/memory.ts:107` | Data sampah menumpuk, FK constraint violation |
| P0-3 | `PRAGMA foreign_keys = ON` tidak dieksekusi | `src/storage/db.ts:288` | FK cascade tidak pernah aktif meskipun schema sudah benar |
| P0-4 | Migrasi DB tidak atomic — DDL sukses, ledger migration gagal/crash | `src/storage/db.ts:306-310` | DB setengah migrasi, tidak bisa recover otomatis |
| P0-5 | `DreamPipeline.parseSignalFile()` return `{ id: undefined }` tanpa guard | `src/intelligence/dream.ts:132` | Memory dengan ID null, evidence corrupt |
| P0-6 | `forge/package.json` postinstall merujuk script yang tidak ada, error disembunyikan | `forge/package.json:32` | Supply-chain integrity gagal |

### P1 — Correctness / Edge Cases

| ID | Issue | Lokasi | Dampak |
|---|---|---|---|
| P1-1 | MCP server: buffer/request/concurrency tanpa limit | `src/mcp/server.ts:25-52` | Memory/CPU exhaustion |
| P1-2 | MCP tools: `top_k`, `limit`, `batch_size` tanpa batas atas | `src/mcp/tools.ts:25-118` | SQLite/LLM exhaustion |
| P1-3 | Vault sync: `conflicts` selalu `0`; edit vault dengan ID existing diabaikan | `src/storage/sync.ts:19` | DB-vault divergence, user edit hilang |
| P1-4 | Vault frontmatter: metadata tidak di-escape — newline/colon bisa corrupt | `src/storage/vault.ts:17-30` | Malformed signal, field injection |
| P1-5 | `remember()`: DB insert sukses, vault write gagal — split-brain | `src/storage/index.ts:44-48` | DB dan vault tidak konsisten |
| P1-6 | Duplicate `parseSignalFile()` di `dream.ts` dan `sync.ts` — 2 implementasi identik | Dua file | Bug fix di satu tidak propagate |
| P1-7 | 11 silent catch blocks — error ditelan tanpa log | Berbagai file | Debugging impossible |

### P2 — Polish

| ID | Issue |
|---|---|
| P2-1 | `archived_at` / `ttl_days` field sudah ada di schema tapi belum ada cron cleanup |
| P2-2 | `tsconfig.json` stale excludes (`bridge`, `forge`, `mind` — sudah dihapus) |
| P2-3 | `prompt-ops record` CLI passes empty strings untuk `input`/`output` |

---

## 3. Fix yang Diterapkan

### 3.1 MCP Setup — Bun Path Detection

**File:** `src/cli/index.ts:161-163`

```ts
// Sebelum:
const isBinary = process.execPath.endsWith(".exe")
// → Bun sendiri adalah .exe di Windows, deteksi salah

// Sesudah:
const isBinary = !process.argv[1] || process.argv[1].toLowerCase().endsWith(".exe")
// → Deteksi compiled binary, bukan Bun runtime
```

### 3.2 MCP Server — Bounds & Concurrency

**File:** `src/mcp/server.ts:26-65`

- `MAX_LINE = 1_000_000` (1MB) — buffer overflow protection
- `MAX_CONCURRENT = 8` — concurrency cap
- `active++` / `active--` pada setiap request
- Response `-32600` (request too large) dan `-32000` (server busy)

### 3.3 MCP Tools — Input Bounds

**File:** `src/mcp/tools.ts:5-10`

```ts
const MAX_LIMIT = 100;
const MAX_BATCH = 100;
function bounded(value, fallback, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), max) : fallback;
}
```

Diterapkan pada: `top_k`, `limit`, `batch_size`, `maxChars`, `ingest` array.

### 3.4 SQLite — Foreign Keys + Atomic Migrations

**File:** `src/storage/db.ts:288-317`

```ts
// openDatabase()
const db = new Database(dbPath, { create: true });
db.exec("PRAGMA foreign_keys = ON;");  // ← BARU

// migrate()
db.exec("BEGIN");
try {
  db.exec(migration.sql);
  runSql(db, "INSERT INTO schema_migrations ...");
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
```

### 3.5 Vault — YAML-Safe Frontmatter

**File:** `src/storage/vault.ts:5,18-19`

```ts
// Sebelum: string interpolation rawan injection
`id: ${memory.id}\nsource: ${memory.source}\n...`

// Sesudah: YAML.stringify()
import YAML from "yaml";
const metadata = YAML.stringify({ id, source, session_id, project, tags, created_at });
const frontmatter = ["---", metadata, "---", "", memory.content, ""].join("\n");
```

### 3.6 Vault Sync — Conflict Detection

**File:** `src/storage/sync.ts:17-19,38-40`

```ts
// Sebelum: conflicts selalu 0
return { imported: imported.length, exported, conflicts: 0 };

// Sesudah: deteksi + log
if (existing.content !== memory.content || ...) {
  conflicts++;
  console.warn(`capricorn: vault sync conflict for ${memory.id}; DB preserved`);
}
```

### 3.7 Storage — DB-Vault Rollback

**File:** `src/storage/index.ts:44-53`

```ts
// Sebelum: DB insert, vault write gagal → split-brain
const memory = this.memory.remember(input, embedding);
vaultPath = this.vault.writeSignal(memory);

// Sesudah: vault gagal → rollback DB
try {
  vaultPath = this.vault.writeSignal(memory);
  this.memory.markVaultSynced(memory.id, vaultPath);
} catch {
  this.memory.forget(memory.id);  // rollback
  throw new Error("vault write failed, DB write rolled back");
}
```

### 3.8 Dream — FK Parent Row

**File:** `src/intelligence/dream.ts:33-35`

```ts
// Sebelum: evidence FK ke signal yang belum ada di memories
this.applyEvidence(match, signal);

// Sesudah: import dulu sebelum evidence
if (!this.storage.memory.getById(signal.id)) {
  this.storage.memory.importMemory(signal);
}
```

### 3.9 Shared Signal Parser

**File:** `src/utils/signal.ts`

- Parser YAML-based (menggantikan 2 implementasi manual)
- Guards: `id` required, `created_at` fallback, `tags` type-safe
- Digunakan oleh: `VaultSync`, `DreamPipeline`, `OsbBridge`

### 3.10 Forge Postinstall

**File:** `forge/package.json:32`

```json
// Sebelum:
"postinstall": "bash scripts/openclaw-after-tool-call-messages.patch.sh 2>/dev/null || true"

// Sesudah:
"postinstall": "node -e \"console.log('forge postinstall: no patch step configured')\""
```

---

## 4. Post-Fix Verification

```text
git status              CLEAN
git diff --check        PASS
bun run typecheck       PASS
bun test                114 pass, 0 fail
bun run build           PASS
smoke:phase3            PASS
smoke:phase4            PASS
smoke:osb               PASS
bun pm pack --dry-run   5 files, 0.51MB (root artifact bersih)
```

---

## 5. Sisa yang Diketahui

### 31 Catch Blocks

| Kategori | Jumlah | Status |
|---|---|---|
| Sudah ada logging/rollback | 12 | Sync, vault, DB, MCP, forge |
| Intentional silent fallback | 19 | Embedding → FTS5, fileSize → 0, parseTags → `[]`, logger → skip |

**Kesimpulan:** Tidak ada yang membahayakan. Semua silent catch adalah defensive fallback yang benar.

### 2x `as any` Cast

- `embeddings.ts:108,111` — Bun ORT binding typings terbatas
- Tidak ada alternatif tanpa fork Bun types

### Yang Belum Terbukti

| Area | Risiko |
|---|---|
| Dependency CVE scan | `bun pm audit` tidak tersedia; OSV-Scanner belum dijalankan |
| MCP stress/fuzz | 1MB+ request, 9+ concurrent, invalid JSON, negative values |
| Multi-process SQLite | Crash recovery, WAL contention |
| Windows binary E2E | `bun build --compile` + `setup` + MCP full flow |
| LLM provider nyata | Credential failure, rate-limit, hallucination cascade |
| Vault symlink/race | Permission denied, concurrent edit, symlink traversal |
| Clean-clone install | Remote → clone → install → test full flow |

---

## 6. Penilaian

### Skor Saat Ini

| Dimensi | Skor | Catatan |
|---|---|---|
| Architecture | 7.5/10 | Modular, tapi scope terlalu lebar |
| Code maturity | 7/10 | Test discipline bagus, error handling improved |
| Security baseline | 7/10 | No command-exec surface, FK enforced, bounds added |
| Data integrity | 6.5/10 | Rollback + conflict detection, tapi DB-vault masih dual source |
| Production readiness | 6/10 | Butuh stress test, dependency scan, crash recovery |

### Untuk Mencapai Rata-rata 8

```
1. Clean-clone install dari remote → verified
2. Dependency scan (OSV-Scanner) → clean
3. MCP stress test (1MB, 9 concurrent, invalid input) → no crash
4. Windows binary E2E (compile + setup + MCP tools) → PASS
5. SQLite crash recovery (kill -9 mid-write, restart) → no corruption
6. LLM provider fallback test (credential fail, rate-limit) → graceful degrade
7. Bump version → 0.2.0-rc.1
8. Tag signed commit
```

---

## 7. Rekomendasi Final

**Status saat ini:** Layak **staging/isolated install**. Bukan production.

**Langkah selanjutnya:**
1. Clean-clone + install di environment terisolasi
2. Jangan arahkan ke vault utama
3. Uji semua MCP tools dari Hermes
4. Jalankan 8 item hardening di atas
5. Jika semua pass → release tag, install ke vault utama

**Jangan tambah fitur intelligence sampai hardening selesai.**

---

*Audit by Shade. Operator: Rprad (Jack / SuhuuDev).*