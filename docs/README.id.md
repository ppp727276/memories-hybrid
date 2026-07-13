# Memories Hybrid

**Satu otak, satu vault.** Capture memory deterministik + pipeline enrichment LLM.

Gabungan [Open Second Brain](https://github.com/itechmeat/open-second-brain) (memory berbasis vault) dengan [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) (enrichment LLM) menjadi sistem memory hybrid terpadu.

## Arsitektur

```
memory() tool → MEMORY.md (capture layer)
     ↓
on_memory_write hook → JSONL log
     ↓
Bridge (6 jam) → Forge pipeline
     ├── L0: Embedding (text-embedding-v3)
     ├── L1: Extraction (LLM)
     ├── L2: Scene generation (LLM)
     └── L3: Persona generation (LLM)
     ↓
Dream (tiap jam) → Preferences → active.md
     ↓
Context injection: MEMORY.md + active.md
```

## Fitur

- **Capture deterministik** — setiap panggilan `memory()` tercatat di vault
- **Enrichment LLM** — pipeline 4 layer: embed → extract → synthesize → persona
- **Anti-halusinasi** — vault berupa markdown biasa, bisa dibaca/edit kapan aja
- **Multi-agent** — plugin OSB support Hermes, Claude, Codex, OpenClaw, dan lainnya
- **Token efisien** — ~5000 chars di-inject vs ~7000+ default
- **Compounding** — preferensi accumulating evidence, confidence naik seiring waktu
- **Memory shared** — memory dibagi antar profile, gak perlu perkenalan ulang

## Quick Start

```bash
git clone https://github.com/ppp727276/memories-hybrid
cd memories-hybrid
bash scripts/install.sh
```

Lalu:
1. Edit `bridge-config.json` — isi API key LLM kamu
2. Inisialisasi vault: `o2b init --vault ~/Documents/second-brain-memory`
3. Test: `npx tsx bridge/src/bridge.ts --config bridge-config.json --dry-run`
4. Jalan: `npx tsx bridge/src/bridge.ts --config bridge-config.json`

## Struktur Direktori

```
memories-hybrid/
├── bridge/              ← Kode orchestrator
│   └── src/
│       ├── bridge.ts         Pipeline orchestrator
│       ├── seed-runner.ts    Forge engine runner
│       ├── signal-converter.ts
│       └── types.ts
├── forge/               ← Enrichment engine (TencentDB)
│   └── src/core/seed/       Pipeline L0→L1→L2→L3
├── mind/                ← Plugin OSB (support multi-agent)
│   ├── .agents/             Definisi agent
│   ├── .claude-plugin/      Support Claude
│   ├── .codex-plugin/       Support Codex
│   ├── openclaw/            Support OpenClaw
│   ├── plugins/             Plugin agent
│   ├── src/                 Source core
│   └── scripts/             o2b CLI
├── scripts/             ← Tools
│   ├── install.sh           Install satu perintah
│   ├── backup.sh            Backup vault (robocopy)
│   └── prune-memory.py      Auto-prune MEMORY.md
├── patches/             ← Patch engine
│   └── engine.patch         Fix waitForAllIdle
├── docs/                ← Dokumentasi
│   ├── README.md
│   ├── README.id.md
│   ├── ARCHITECTURE.md
│   └── yourtask.md
└── bridge-config.example.json
```

## Cron Jobs (disarankan)

| Job | Schedule | Fungsi |
|---|---|---|
| Bridge | `0 */6 * * *` | Signal → enrichment → persona |
| Dream | `15 * * * *` | Inbox → preferences → active.md |
| Backup | `0 2 * * *` | Vault → direktori backup |
| Prune | `0 3 * * 0` | Pangkas MEMORY.md (mingguan) |

## Kebutuhan

- Node.js v22+
- Bun >= 1.1.0
- Hermes Agent
- LLM API (OpenAI-compatible)

## Berdasarkan

- [Open Second Brain](https://github.com/itechmeat/open-second-brain) — memory provider berbasis vault
- [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) — pipeline enrichment LLM

## Lisensi

MIT