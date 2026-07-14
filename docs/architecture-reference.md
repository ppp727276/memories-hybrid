# Architecture Reference — Interfaces, Flows, Glossary

> Part of [Capricorn v2 Architecture](ARCHITECTURE.md). Sections 6-15.

---

## 6. MCP Server

### 6.1 Tools

```
capricorn.remember
  description: Store a memory
  parameters: content (required), tags, importance, scope, valid_until, project
  returns: { id, status }

capricorn.recall
  description: Recall memories by meaning
  parameters: query (required), top_k, include_enriched, temporal_weight, temporal_halflife, tags, project
  returns: { results: Memory[] }

capricorn.search
  description: Full-text keyword search
  parameters: query (required), limit, tags, project
  returns: { results: Memory[] }

capricorn.forget
  description: Delete a memory
  parameters: id (required)
  returns: { id, status }

capricorn.stats
  description: Memory statistics
  parameters: project (optional)
  returns: { total_memories, total_insights, preferences_count, db_size, vault_size }

capricorn.ingest
  description: Bulk import memories
  parameters: memories (required), project
  returns: { imported: number, ids: string[] }

capricorn.brain_feedback
  description: Record user feedback on a preference
  parameters: pref_id (required), result: "applied" | "violated" | "outdated"
  returns: { status }

capricorn.brain_note
  description: Record a narrative milestone
  parameters: content (required), tags
  returns: { id, status }

capricorn.context
  description: Get distilled context for injection into agent system prompt
  parameters: profile (default: "default"), max_chars (default: 3000)
  returns: { context: string, prefs_count: number, persona_version: number }
```

### 6.2 MCP Protocol

```
Transport: stdio
Protocol: JSON-RPC 2.0

Agent setup:
  capricorn setup hermes    → writes ~/.hermes/mcp.json
  capricorn setup claude    → writes .claude/mcp.json
  capricorn setup codex     → writes .codex/mcp.json
  capricorn setup cursor    → writes .cursor/mcp.json
  capricorn setup windsurf  → writes .windsurf/mcp_config.json
```

---

## 7. CLI

```
capricorn remember <content>     --tags, --importance, --scope, --project, --valid-until
capricorn recall <query>         --top-k, --temporal-weight, --tags, --project, --enriched
capricorn search <query>         --limit, --tags
capricorn forget <id>
capricorn stats                  --project
capricorn ingest <file>
capricorn bridge                 --dry-run
capricorn dream                  --dry-run
capricorn setup <agent>          claude | codex | cursor | hermes | windsurf | gemini
capricorn init                   --vault <path>
capricorn serve                  --port <n>
capricorn sync                   --direction <to|from|bidirectional>
capricorn backup                 --output <path>
```

---

## 8. Configuration

### 8.1 capricorn.config.json

```json
{
  "vault": { "path": "~/Documents/second-brain-memory", "auto_sync": true },
  "storage": {
    "db_path": "~/.capricorn/capricorn.db",
    "vector_provider": "api",
    "vector_model": "text-embedding-v3",
    "vector_dimensions": 1024
  },
  "intelligence": {
    "forge": {
      "enabled": true, "schedule": "0 */6 * * *",
      "llm_provider": "omniroute", "llm_model": "deepseek-v4-pro",
      "embedding_provider": "openai", "embedding_model": "text-embedding-v3",
      "batch_size": 100
    },
    "dream": {
      "enabled": true, "schedule": "15 * * * *",
      "confidence_threshold_confirm": 0.6, "evidence_threshold_confirm": 3
    }
  },
  "mcp": { "enabled": true, "transport": "stdio" },
  "http": { "enabled": false, "port": 7437, "host": "127.0.0.1" }
}
```

### 8.2 Environment Variables

```
CAPRICORN_VAULT_PATH          CAPRICORN_DB_PATH
CAPRICORN_LLM_API_KEY         CAPRICORN_LLM_BASE_URL
CAPRICORN_EMBEDDING_API_KEY   CAPRICORN_NO_EMBEDDINGS
CAPRICORN_OFFLINE
```

---

## 9. Data Flow (End-to-End)

### 9.1 Session Write Flow

```
1. Agent: capricorn.remember "User prefers dark mode" --tags preference,ui
2. SQLite INSERT → memories + memories_fts (auto)
3. Vault write-through → Brain/inbox/sig-*.md
4a. Bridge (6h): L0→L3 enrichment
4b. Dream (1h): match prefs → confidence → promote → active.md
5. Next session: capricorn.context → 1 block (~3000 chars)
```

### 9.2 Session Read Flow

```
1. Agent: capricorn.recall "user interface preferences" --top-k 5
2. Parallel: FTS5 match + Vector match
3. RRF fusion (k=60) → rank
4. Enrich: JOIN insights + preferences
5. Response: [{ id, content, score, insight?, preference? }, ...]
```

---

## 10. Migration from v1

### What Changes

| v1 | v2 |
|---|---|
| `memory()` Hermes → bridge | `capricorn.remember` MCP → storage engine |
| `on_memory_write` hook | MCP tool call (direct) |
| JSONL log → bridge reads | SQLite → bridge reads |
| Vault inbox only | Vault + SQLite dual write |
| FTS via OSB search | FTS5 + vector + RRF |
| No offline mode | Offline recall (FTS5 only) |
| `git clone + bash install.sh` | `npm install -g capricorn` or binary |
| Hermes-only | Agent-agnostic (MCP) |

### Migration Script

```bash
capricorn migrate --from-v1 --vault ~/Documents/second-brain-memory
# 1. Read all sig-*.md from inbox
# 2. Parse frontmatter + body → INSERT into memories
# 3. Build FTS5 index
# 4. Read existing preferences → INSERT into preferences
# 5. Read existing persona → INSERT into personas
# 6. Validate: count(source) === count(target)
```

---

## 11. Comparison Matrix

| | Capricorn v2 | Uteke | Mnemosyne | Engram |
|---|---|---|---|---|
| **Language** | TypeScript | Rust | Python | Go |
| **Distribution** | npm → binary (Bun) | `curl \| sh` | `pip install` | Homebrew / binary |
| **Storage** | SQLite + vault (md) | SQLite + usearch | SQLite | SQLite |
| **Search** | Hybrid: FTS5 + vector + RRF | Hybrid: HNSW + FTS5 + RRF | Hybrid: vec + FTS5 + importance | FTS5 only |
| **Offline recall** | ✅ (FTS5) | ✅ (full) | ⚠️ (optional) | ✅ (FTS5) |
| **LLM Enrichment** | ✅ L0→L1→L2→L3 | ❌ | ⚠️ shallow | ❌ |
| **Compounding Prefs** | ✅ confidence | ❌ | ❌ | ❌ |
| **Persona Generation** | ✅ | ❌ | ❌ | ❌ |
| **Anti-hallucination** | ✅ (readable vault) | ❌ | ❌ | ❌ |
| **Semantic conflict detect** | ⏳ planned | ❌ | ❌ | ✅ (beta) |
| **Evidence-based conflict** | ✅ violated/retired | ❌ | ❌ | ❌ |
| **License** | MIT | Apache 2.0 | MIT | Apache 2.0 |

---

## 12. Implementation Phases

### Phase 1 — Storage Engine Core (FTS5 only)
- SQLite schema + migrations, `remember` / `recall` / `forget` / `stats` / `search`
- `capricorn init`, `capricorn setup hermes`, `capricorn context`
- MCP server (stdio), vault write-through, schema migration tests + MCP round-trip tests

### Phase 2 — Vector Search
- Vector search (API: text-embedding-v3, 1024d), RRF fusion
- `capricorn setup claude|codex|cursor|windsurf`
- Offline mode (FTS5 fallback), local ONNX optional

### Phase 3 — Intelligence Engine Port
- Port Forge pipeline to read from SQLite, port Dream, cron jobs
- Confidence scoring with source_weight, validation layer (HyperTune + HaluGard)
- active.md / persona.md regeneration

### Phase 4 — Distribution & Polish
- `npm publish` (Phase 1-2: npm install -g capricorn)
- `capricorn setup <agent>` auto-config (Phase 1: Hermes, Phase 2: Claude/Codex/Cursor)
- Binary distribution via Bun compile (Phase 3-4)
- Benchmarks (LongMemEval, BEAM), semantic conflict detection, temporal KG

---

## 13. Directory Structure (v2)

```
capricorn/
├── cmd/capricorn.ts              ← CLI entry point
├── src/
│   ├── storage/                  ← Storage engine (db, fts, vector, search, vault, prefs)
│   ├── intelligence/             ← Intelligence engine (bridge, forge, dream, confidence, checkpoint)
│   ├── mcp/                      ← MCP server (server, tools, handlers, protocol)
│   ├── cli/                      ← CLI commands (remember, recall, search, forget, stats, etc.)
│   └── config.ts                 ← Config loading + validation
├── vault/Brain/                  ← Default vault template
├── models/                       ← Local embedding models (optional)
├── scripts/                      ← install.sh, backup.sh, prune-memory.py
├── patches/                      ← Engine patches (llm-runner, pipeline-manager)
├── docs/
│   ├── README.md                 ← docs index
│   ├── PRD.md                    ← requirements & roadmap
│   ├── ARCHITECTURE.md           ← architecture index (this file)
│   ├── ARCHITECTURE.html         ← visual overview
│   ├── architecture-storage.md   ← data model + storage engine
│   ├── architecture-intelligence.md ← intelligence engine + validation
│   └── architecture-reference.md ← interfaces, flows, glossary
├── capricorn.config.json
├── package.json
├── tsconfig.json
└── LICENSE
```

---

## 14. Glossary

| Term | Definition |
|---|---|
| **L0** | Embedding layer — converts raw text to vector (text-embedding-v3, 1024d). Runs at cron time. |
| **L1** | Extraction layer — LLM extracts structured insights from memory batches. |
| **L2** | Scene synthesis — LLM connects events over time into narrative scenes. |
| **L3** | Persona generation — LLM synthesizes user profile from insights + scenes. |
| **RRF** | Reciprocal Rank Fusion — merges FTS5 + vector search rankings into one score. k=60. |
| **Forge** | 4-layer LLM enrichment pipeline (L0→L1→L2→L3). Runs every 6 hours. |
| **Dream** | Preference compounding pass. Scans inbox, matches existing preferences, updates confidence. Runs hourly. |
| **Bridge** | Orchestrator that runs the Forge pipeline + saves output. |
| **HyperTune** | Quality scoring methodology (coherence, relevance, complexity). Adopted from geeknik/HyperTune. |
| **HaluGard** | Anti-hallucination framework (ppp727276/halugard). G2 (claim verify), G3 (contradiction), G4 (drift detect). |
| **dcg** | Destructive Command Guard (Dicklesworthstone/destructive_command_guard). Pattern packs + explain mode concept adopted. |
| **Validation layer** | 0-token pipeline: HyperTune scoring + HaluGard G2-G4. Validates enrichment output before merge. |
| **MCP** | Model Context Protocol — stdio JSON-RPC interface for AI agent tools. |
| **Vault** | Markdown mirror of all memories. Human-readable, auditable, anti-hallucination guarantee. |
| **Two-way sync** | Vault ↔ SQLite synchronization via mtime detection. Human edits propagate to database. |