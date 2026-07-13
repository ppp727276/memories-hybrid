# Architecture

## Overview

Memories Hybrid is a dual-layer memory system:

### Layer 1: Capture (Deterministic)
`memory()` tool calls → MEMORY.md + JSONL log → vault inbox

### Layer 2: Enrichment (LLM)
Bridge reads signals → Forge pipeline (L0→L1→L2→L3) → persona.md

### Layer 3: Compounding (Deterministic)
Dream reads inbox → preferences → active.md → context injection

## Pipeline Detail

### Forge Engine (L0→L1→L2→L3)

| Layer | Model | Function |
|-------|-------|----------|
| L0 | text-embedding-v3 | Conversation → vector |
| L1 | deepseek-v4-pro | Extract insights |
| L2 | deepseek-v4-pro | Synthesize scenes |
| L3 | deepseek-v4-pro | Generate persona |

### Dream Pass

1. Scan inbox/*.md signals
2. Match existing preferences → update confidence
3. Promote new signals → confirm/trial
4. Regenerate active.md

## Vault Structure

```
second-brain-memory/
├── Brain/active.md              ← injected into context
├── Brain/inbox/                 ← raw signals
├── Brain/preferences/           ← confirmed preferences
├── Brain/personas/              ← bridge enrichment output
├── Brain/log/                   ← event log (bridge reads this)
└── Brain/.snapshots/            ← dream rollback points
```

## Data Flow

```
Session → memory() → MEMORY.md (516 chars)
                  → JSONL log
                     ↓
Bridge (6h) → Forge → persona.md
                     ↓
Dream (1h) → preferences → active.md (4496 chars)
                     ↓
Next session: MEMORY.md + active.md → context
```

## Conflict Resolution

When MEMORY.md and active.md contradict:
- active.md (confirmed preferences) wins
- MEMORY.md is raw capture, active.md is processed knowledge

