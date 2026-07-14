# Capricorn v2 — Architecture

**"Mereka ingat, aku paham."**

Storage Engine + Intelligence Engine. Dua layer, satu sistem.

---

## Modular Docs

Arsitektur dipecah menjadi 4 file untuk navigasi dan maintenance:

| File | Isi | Sections |
|---|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Index — overview + philosophy | 1-2 |
| **[architecture-storage.md](architecture-storage.md)** | Data model + storage engine | 3-4 |
| **[architecture-intelligence.md](architecture-intelligence.md)** | Intelligence engine + validation | 5 |
| **[architecture-reference.md](architecture-reference.md)** | Interfaces, flows, migration, comparison, glossary, prompt-ops | 6-15 |

---

## High-Level Architecture

```
Agent ──MCP──→ Capricorn
                ├── Storage Engine (sync)
                │   └── SQLite + FTS5 + Vector + Vault (markdown)
                ├── Intelligence Engine (async)
                │   ├── Forge L1→L3 (enrichment, cron)
                │   └── Dream (compounding, cron)
                ├── Validation Layer (0 token)
                │   ├── HyperTune scoring (quality)
                │   └── HaluGard G2-G4 (consistency)
                └── Output
                    └── capricorn.context (1 block, ~3000 chars)
```

---

## Philosophy: "Mereka Ingat, Aku Paham"

```
MEREKA (Uteke / Engram / Mnemosyne):
  Input:  "User prefers dark mode, also says light mode hurts eyes"
  Output: "User prefers dark mode"                    ← INGAT. Mentah.

CAPRICORN:
  Input:  Same
  L0:     → vector: 1024d
  L1:     → insight: "user values visual comfort, dark mode preferred"
  L2:     → scene: "user migrated all tools to dark themes over 2 weeks"
  L3:     → persona: "aesthetic-conscious, prefers low eye strain"
  Dream:  → confidence 0.87 after 3 confirmations
  Output: "User is aesthetic-conscious developer who strongly prefers
           dark interfaces (confidence 0.87, 3 confirmations)"
                                              ← PAHAM. Diproses.
```

**Dua dimensi yang ga dimiliki kompetitor:**
1. **Depth** — ga cuma recall, tapi ekstrak insight, synthesize scene, generate persona
2. **Compounding** — preferences accumulate evidence across sessions, confidence grows

---

## Key Design Decisions

1. **SQLite as primary, vault as source of truth.** SQLite for fast queries, vault for human audit + anti-hallucination. Write-through ensures consistency.
2. **MCP-first, CLI-second.** Agent integration via MCP is the primary interface. CLI is for humans and cron.
3. **Async enrichment, sync recall.** Intelligence engine runs async (cron). Storage engine responds sync. Agent never waits for enrichment.
4. **Graceful degradation.** If no local embedding model or API key, FTS5-only recall. If no LLM API, enrichment disabled. System never crashes on missing deps.
5. **Vault is markdown.** Always readable. Always editable. No black box. This is the anti-hallucination guarantee.
6. **Compounding is the moat.** No competitor has evidence-based preference confidence. This is the "paham" layer.
7. **Profile-shared by default.** Profile isolation via `--profile` flag. Corrections scoped per-profile.