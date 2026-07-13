# Memories Hybrid

**One brain, one vault.** Deterministic memory capture + LLM enrichment pipeline.

Combines [Open Second Brain](https://github.com/itechmeat/open-second-brain) (vault-based memory) with [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) (LLM enrichment) into a unified hybrid memory system.

## Architecture

```
memory() tool → MEMORY.md (capture layer)
     ↓
on_memory_write hook → JSONL log
     ↓
Bridge (6h) → Forge pipeline
     ├── L0: Embedding (text-embedding-v3)
     ├── L1: Extraction (LLM)
     ├── L2: Scene generation (LLM)
     └── L3: Persona generation (LLM)
     ↓
Dream (hourly) → Preferences → active.md
     ↓
Context injection: MEMORY.md + active.md
```

## Features

- **Deterministic capture** — every `memory()` call logged to vault
- **LLM enrichment** — 4-layer pipeline: embed → extract → synthesize → persona
- **Anti-hallucination** — vault is plain markdown, you can read/edit anytime
- **Multi-agent** — OSB plugin supports Hermes, Claude, Codex, OpenClaw, and more
- **Token efficient** — ~5000 chars injected vs ~7000+ default
- **Compounding** — preferences accumulate evidence over time, confidence grows
- **Profile shared** — memory shared across profiles, no re-introductions

## Quick Start

```bash
git clone https://github.com/ppp727276/memories-hybrid
cd memories-hybrid
bash scripts/install.sh
```

Then:
1. Edit `bridge-config.json` — set your LLM API key
2. Initialize vault: `o2b init --vault ~/Documents/second-brain-memory`
3. Test: `npx tsx bridge/src/bridge.ts --config bridge-config.json --dry-run`
4. Run: `npx tsx bridge/src/bridge.ts --config bridge-config.json`

## Directory Structure

```
memories-hybrid/
├── bridge/              ← Orchestrator code
│   └── src/
│       ├── bridge.ts         Pipeline orchestrator
│       ├── seed-runner.ts    Forge engine runner
│       ├── signal-converter.ts
│       └── types.ts
├── forge/               ← Enrichment engine (TencentDB)
│   └── src/core/seed/       L0→L1→L2→L3 pipeline
├── mind/                ← OSB plugin (multi-agent support)
│   ├── .agents/             Agent definitions
│   ├── .claude-plugin/      Claude support
│   ├── .codex-plugin/       Codex support
│   ├── openclaw/            OpenClaw support
│   ├── plugins/             Agent plugins
│   ├── src/                 Core source
│   └── scripts/             o2b CLI
├── scripts/             ← Tools
│   ├── install.sh           One-command install
│   ├── backup.sh            Vault backup (robocopy)
│   └── prune-memory.py      Auto-prune MEMORY.md
├── patches/             ← Engine patches
│   ├── llm-runner-force-nonstream.patch
│   └── pipeline-manager-l3-flush.patch
├── docs/                ← Documentation
│   ├── README.md
│   ├── README.id.md
│   ├── ARCHITECTURE.md
│   └── INSTRUCTION.md
└── bridge-config.example.json
```

## Cron Jobs (recommended)

| Job | Schedule | Function |
|---|---|---|
| Bridge | `0 */6 * * *` | Signal → enrichment → persona |
| Dream | `15 * * * *` | Inbox → preferences → active.md |
| Backup | `0 2 * * *` | Vault → backup directory |
| Prune | `0 3 * * 0` | Trim MEMORY.md (weekly) |

## Requirements

- Node.js v22+
- Bun >= 1.1.0
- Hermes Agent
- LLM API (OpenAI-compatible)

## Based On

- [Open Second Brain](https://github.com/itechmeat/open-second-brain) — vault-based memory provider
- [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) — LLM enrichment pipeline

## License

MIT