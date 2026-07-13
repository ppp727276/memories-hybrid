# Hybrid Memory PRD

## Problem
Open Second Brain (OSB) menyimpan banyak signal mentah di `Brain/inbox/`, tapi sintesis menjadi persona terstruktur manual atau tidak pernah terjadi. Persona-core.md cepat menjadi statis dan tidak merefleksikan pengetahuan baru.

## Tujuan Produk
Bangun bridge otomatis yang mengambil signal OSB, menjalankannya melalui pipeline TencentDB L0→L1→L2→L3, dan menulis kembali persona yang diperkaya ke OSB vault.

## User Story
Sebagai user Hermes + OSB, saya ingen persona saya diperbarui otomatis setiap beberapa jam berdasarkan signal terbaru, tanpa kehilangan edit manual yang sudah saya freeze.

## Requirements

### Functional
1. **Signal Ingestion**: Bridge baca semua `.md` dari `Brain/inbox/` dengan frontmatter YAML.
2. **Idempotency**: Checkpoint hash MD5 per file. Signal yang sama tidak diproses ulang.
3. **Seed Execution**: Jalankan TencentDB seed pipeline secara standalone melalui `npx tsx src/seed-runner.ts`.
4. **L1+L2+L3 Completion**: Tunggu semua layer selesai sebelum pipeline di-destroy.
5. **Persona Merge**: Merge hasil `persona.md` ke `persona-core.md`, preserve blok `<!-- status: frozen -->`.
6. **Config-Driven**: Semua path, LLM, embedding, pipeline timing lewat JSON config.

### Non-Functional
1. **Cron-able**: Satu command one-shot yang aman dijalankan via Hermes cron.
2. **Stealth/No Trace**: Tidak menyimpan state di luar vault dan output dir.
3. **Recoverable**: Kalau seed gagal, checkpoint tidak di-update.
4. **Tunable**: Timing L2/L3 dan trigger persona bisa diatur lewat config.

## Success Metrics
- `persona-core.md` tertulis ulang setelah run sukses.
- Signal yang sama tidak diproses dua kali (checkpoint hash match).
- Frozen user edits tetap ada di `persona-core.md` setelah merge.
- `persona.md` muncul di output dir setelah seed runner exit code 0.

## Out of Scope (MVP)
- Real-time sync per signal.
- Conflict resolution UI.
- Multi-vault support.
- GUI.

## Risiko & Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Patch perlu di-reapply tiap update TencentDB | Simpan patch di `patches/seed-runtime.patch` |
| Embedding provider down | Config `embedding.enabled: false` fallback |
| LLM cost tinggi | Cron interval 6 jam, triggerEveryN tuning |
| Frozen edits tertimpa | Parser `<!-- status: frozen -->` preserve |
