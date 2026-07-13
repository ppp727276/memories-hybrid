# Notulen — Memories Hybrid

**Tanggal:** 2026-07-12 → 2026-07-13
**Status:** v1.0.0 released ✅ | Active tasks: 2 pending

---

## Done

### Phase 0-2 — Setup & Bridge Fix
- Bun 1.3.14, Node v22.23.1, o2b 1.29.0
- TencentDB patch `waitForAllIdle` applied
- Bridge fix: `disableThinking: "deepseek"`, model `deepseek-v4-pro`, timeout 120s
- 20 entries MEMORY.md → OSB signals migrated
- active.md 7 → 21 confirmed preferences

### Phase 3 — Absorb & Compound
- MEMORY.md prune: 5437 → 516 chars
- 8 preferences force-confirmed
- host_memory_write pipeline: recursive scan
- Auto-prune cron: weekly, trim oldest if > 2000 chars

### PR Items — All Resolved
- P1: Embedding mismatch → both v3
- P1: Orphan persona-yandere.md → retired
- P1: Backup.sh tested → exit 0
- P2: Dry-run verified → both configs
- P2: hermes plugins list → OSB enabled

### GitHub Release — v1.0.0
- Restructured: `bridge/` + `forge/` + `mind/` + `scripts/` + `docs/`
- Generic paths (no hardcoded rprad)
- MIT LICENSE, README EN+ID
- Credits: Open Second Brain + TencentDB Agent Memory
- Pushed: github.com/ppp727276/memories-hybrid

---

## Cron Jobs

| Job | Schedule | Fungsi |
|---|---|---|
| hybrid-memory-bridge | 0 */6 * * * | Signal → Forge → persona |
| hybrid-memory-dream | 15 * * * * | Inbox → preferences → active.md |
| second-brain-backup | 0 2 * * * | Vault backup |
| hybrid-memory-prune | 0 3 * * 0 | Auto-prune MEMORY.md (weekly) |

---

## Token Saver

| | Sebelum | Sesudah |
|---|---|---|
| MEMORY.md | 5437 | 516 |
| active.md | 1334 | 4496 |
| Total | 6771 | 5012 (-26%) |

---

## Known Gaps

1. **Persona → preference feedback loop:** Bridge generate persona, tapi persona gak balik ke preference system. Future: auto-extract insight dari persona → brain_feedback → inbox → dream → active.md.

2. **Profile isolation:** active.md shared — `owner:` field hanya gate `brain_query`/`brain_search`, bukan `active.md` generation. Preferences dengan `owner:` tetap muncul di active.md semua profile.

3. **Persona not injected:** persona-core.md hanya enrichment internal, tidak masuk context injection. Beda dengan klaim TencentDB original (persona replaces raw context).

---

## Pending Tasks

| # | Task | Status |
|---|---|---|
| 5 | **HaluGard integration** — validator di bridge + dream pipeline | 🔴 Diskusi pending |
| 6 | **LLM Wiki vault (yandere)** — separate vault, Karpathy-style knowledge base | 🔴 Diskusi pending |

---

## Vault Directory

```
second-brain-memory/
├── Brain/active.md              ← injected ke context (21 prefs)
├── Brain/inbox/sig-*.md         ← sinyal mentah
├── Brain/preferences/pref-*.md  ← confirmed preferences
├── Brain/personas/persona-*.md  ← enrichment bridge
├── Brain/log/*.jsonl            ← bridge reads this
├── Brain/log/continuity/        ← host_memory_write records
└── Brain/.snapshots/            ← dream rollback
```

## Konfigurasi

| Config | bridge-config.json |
|---|---|
| LLM | queen/deepseek-v4-pro |
| Embedding | queen/text-embedding-v3 |
| Timeout | 120s |
| MaxTokens | 4096 |
| disableThinking | deepseek |