# Hybrid Memory Instructions

## Prerequisites

- **Bun >= 1.1.0** on PATH. Open Second Brain CLI (`o2b`) requires Bun.
- Node.js v22+ and `npx`.
- OSB vault already initialized.

## Install

```bash
cd C:/Users/rprad/Documents/project/memories_hybrid/tencentdb
npm install

cd C:/Users/rprad/Documents/project/memories_hybrid
npm install
```

## Configure

1. Copy template config:
```bash
cp bridge-config.example.json bridge-config.json
```

2. Edit `bridge-config.json`:
   - `vaultPath`: path ke OSB vault.
   - `tencentdbPath`: path ke folder `tencentdb`.
   - `personaTargetPath`: target `persona-core.md`.
   - `pluginConfig.llm.apiKey`: ganti placeholder dengan OmniRoute API key.
   - `pluginConfig.embedding.apiKey`: ganti placeholder dengan OmniRoute API key.

   **Security:** jangan commit `bridge-config.json` ke git. Simpan API key di environment variable atau Hermes secret, lalu ganti placeholder saat deploy.

## OSB Vault Setup

If vault belum di-init:

```bash
o2b init --vault C:/Users/rprad/Documents/second-brain-memory \
  --agent-name "hybrid-bridge" \
  --timezone "Asia/Jakarta"
```

Verify vault health:

```bash
o2b doctor --vault C:/Users/rprad/Documents/second-brain-memory --repo C:/Users/rprad/AppData/Local/hermes/plugins/open-second-brain
```

## Run

### Dry run (tidak jalankan seed, hanya generate input)
```bash
npx tsx src/bridge.ts --config bridge-config.json --dry-run
```

### Run bridge
```bash
npx tsx src/bridge.ts --config bridge-config.json
```

### Typecheck
```bash
npm run typecheck
```

## Verify

1. Setelah run sukses, cek `persona-core.md` di vault.
2. Cek output dir (`seed-output` default) berisi `persona.md`.
3. Cek checkpoint `.hybrid-bridge-checkpoint.json` di vault root.
4. Cek frozen edits masih ada di `persona-core.md`.
5. Verify `/v1/embeddings` support (jika embedding enabled):
```bash
curl http://127.0.0.1:20128/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OMNI_ROUTE_API_KEY" \
  -d '{"model": "queen/text-embedding-v3", "input": "test"}'
```

## Backup

```bash
bash scripts/backup.sh
```

Backup target: `C:/Users/rprad/backups/second-brain-memory/<YYYY-MM-DD>`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Missing script: tdai-seed` | bridge lama spawn `npm run tdai-seed` | Sudah di-fix: bridge sekarang spawn `npx tsx src/seed-runner.ts` |
| `persona.md` tidak muncul | seed-runtime belum tunggu L2/L3 | Sudah di-patch `waitForAllIdle()` |
| Signal diproses berulang kali | Checkpoint corrupt / kosong | Hapus `.hybrid-bridge-checkpoint.json` |
| Frozen edits hilang | Marker tidak sesuai format | Pastikan `<!-- status: frozen -->` ... `<!-- status: end -->` |
| Robocopy flag error | MSYS path conversion | Script sudah pakai `MSYS_NO_PATHCONV=1` |

## Re-apply Patch (setelah update TencentDB)

Kalau TencentDB di-update, apply ulang:

```bash
cd C:/Users/rprad/Documents/project/memories_hybrid
patch -p1 -d tencentdb < patches/seed-runtime.patch
```

Atau patch manual sesuai diff di `patches/seed-runtime.patch`.
