# Hybrid Memory Instructions

## Prerequisites

- **Bun >= 1.1.0** on PATH. Open Second Brain CLI (`o2b`) requires Bun.
- Node.js v22+ and `npx`.
- OSB vault already initialized.

## Install

```bash
cd memories-hybrid
npm install
cd forge && npm install
cd ../mind && bun install
```

Or use one-command:
```bash
bash scripts/install.sh
```

## Configure

1. Copy template config:
```bash
cp bridge-config.example.json bridge-config.json
```

2. Edit `bridge-config.json`:
   - `vaultPath`: path ke OSB vault (default `~/Documents/second-brain-memory`).
   - `personaTargetPath`: target `persona-core.md`.
   - `pluginConfig.llm.apiKey`: ganti placeholder dengan API key.
   - `pluginConfig.embedding.apiKey`: ganti placeholder dengan API key.

   **Security:** jangan commit `bridge-config.json` ke git. Simpan API key di environment variable atau Hermes secret, lalu ganti placeholder saat deploy.

## OSB Vault Setup

If vault belum di-init:

```bash
o2b init --vault ~/Documents/second-brain-memory \
  --agent-name "hybrid-bridge" \
  --timezone "Asia/Jakarta"
```

Verify vault health:

```bash
o2b doctor --vault ~/Documents/second-brain-memory
```

## Run

### Dry run (tidak jalankan seed, hanya generate input)
```bash
npx tsx bridge/src/bridge.ts --config bridge-config.json --dry-run
```

### Run bridge
```bash
npx tsx bridge/src/bridge.ts --config bridge-config.json
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
  -H "Authorization: Bearer $OMNI_API_KEY" \
  -d '{"model": "queen/text-embedding-v3", "input": "test"}'
```

## Backup

```bash
bash scripts/backup.sh
```

Backup target: `~/backups/second-brain-memory/<YYYY-MM-DD>`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `persona.md` tidak muncul | seed-runtime belum tunggu L2/L3 | Patch `waitForAllIdle()` sudah applied |
| Signal diproses berulang kali | Checkpoint corrupt / kosong | Hapus `.hybrid-bridge-checkpoint.json` |
| Frozen edits hilang | Marker tidak sesuai format | Pastikan `<!-- status: frozen -->` ... `<!-- status: end -->` |
| Robocopy flag error | MSYS path conversion | Script sudah pakai `MSYS_NO_PATHCONV=1` |