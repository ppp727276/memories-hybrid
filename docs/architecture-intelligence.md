# Intelligence Engine — Forge + Dream + Validation

> Part of [Capricorn v2 Architecture](ARCHITECTURE.md). Section 5.

---

## 5. Intelligence Engine (Async)

### 5.1 Forge Pipeline

```
Cron: 0 */6 * * *  (every 6 hours)

capricorn bridge

  STEP 1: Load unprocessed signals
    SELECT * FROM memories
    WHERE id NOT IN (SELECT memory_id FROM insights)
    ORDER BY created_at ASC LIMIT 100

  STEP 2: Batch into seed sessions
    signals → signal-converter → SeedInput

  STEP 3: Run Forge pipeline (L0 → L1 → L2 → L3)

    L0 — EMBEDDING (text-embedding-v3, 1024d)
      Input:  raw memory content batch
      Output: 1024d vector → memories_vec
      Model:  text-embedding-v3 (API, may be batched)
      Note:   L0 runs at cron time (6h). Until then, recall via FTS5 only.

    L1 — EXTRACTION (deepseek-v4-pro)
      Input:  memory content batch
      Output: structured insights (JSON)
      Prompt: "Extract user preferences, facts, decisions, patterns."
      Store:  INSERT INTO insights (layer='L1', ...)

    L2 — SCENE SYNTHESIS (deepseek-v4-pro)
      Input:  L1 insights + temporal context
      Output: narrative scenes (connected events)
      Prompt: "Synthesize insights into coherent scenes with temporal progression."
      Store:  INSERT INTO insights (layer='L2', ...)

    L3 — PERSONA GENERATION (deepseek-v4-pro)
      Input:  L1 + L2 output + existing persona
      Output: updated persona.md
      Prompt: "Generate comprehensive persona from these insights and scenes."
      Store:  INSERT INTO personas (...), WRITE vault Brain/personas/

  STEP 4: Save checkpoint
```

### 5.2 Dream Pass

```
Cron: 15 * * * *  (hourly, offset to avoid bridge collision)

capricorn dream

  STEP 1: Scan inbox for new signals
    Parse Brain/inbox/sig-*.md (not in processed/)

  STEP 2: Match against existing preferences
    search existing preferences (FTS5 + vector)
    → match found: INSERT preference_evidence, UPDATE confidence
    → no match: create trial preference (tier='trial')

  STEP 3: Promote / Retire
    trial → confirmed: confidence >= 0.6, evidence >= 3
    confirmed → retired: violated 3+ times in 30 days
    trial → deleted: confidence < 0.2 after 30 days

  STEP 4: Regenerate active.md
    SELECT * FROM preferences WHERE tier='confirmed'
    ORDER BY confidence DESC
    → render to active.md (markdown)
    → target: ~5000 chars for token efficiency
```

### 5.3 Confidence Scoring

```
Δ = base_Δ × decay_factor × source_weight

base_Δ:
  applied:  +0.15
  violated: -0.25
  outdated: -0.10

decay_factor:
  e^(-λ × days_since_last_evidence)
  λ = 0.05 (half-life ~14 days)

source_weight:
  user_explicit:     1.0
  user_implicit:     0.7
  agent_observation: 0.5
  system_derived:    0.3

Example:
  pref: "User prefers dark mode"
  evidence 1: user_explicit, applied → +0.15 × 1.0 × 1.0 = +0.15
  evidence 2: agent_observation, applied → +0.15 × 0.95 × 0.5 = +0.07
  evidence 3: user_explicit, applied → +0.15 × 1.0 × 1.0 = +0.15
  Total: 0.37 → trial
  ...
  evidence 5: user_explicit → Total: 0.67 → CONFIRMED ✓
```

### 5.4 Validation Layer (HyperTune + HaluGard G2-G4)

**Token overhead: 0.** Semua pake embeddings lokal (`all-MiniLM-L6-v2`, 384d), ga ada LLM call.

**Dua dimensi validasi:**

| Dimensi | Method | Waktu | Fungsi |
|---|---|---|---|
| **Kualitas** (HyperTune) | Coherence + relevance + quality scoring | Instant | "Apakah enrichment ini garbage?" |
| **Kebenaran** (Dream) | Evidence accumulation | Lambat | "Apakah enrichment ini benar?" |

```
Bridge cron (6h):

  Forge L0→L3 → enrichment output

  VALIDATION (0 token, embeddings lokal):
  ┌─────────────────────────────────────────┐
  │ 1. HyperTune scoring                     │
  │    coherence = semantic_sim(sentences)   │
  │    relevance = semantic_sim(output, src) │
  │    quality   = detect_degenerate(text)   │
  │    score = 0.4×coh + 0.4×rel + 0.2×comp  │
  │                                          │
  │ 2. HaluGard G2: Claim verify (SQLite)    │
  │    "L1 says user prefers dark mode"      │
  │    → search SQLite for evidence          │
  │    → evidence found? confidence boost    │
  │    → no evidence? flag for review        │
  │                                          │
  │ 3. HaluGard G3: Contradiction (SQLite)   │
  │    new insight vs existing preferences   │
  │    → semantic similarity > 0.8?          │
  │    → but different conclusion? FLAG       │
  │                                          │
  │ 4. HaluGard G4: Drift detect (persona)   │
  │    new persona vs previous version       │
  │    → significant change?                 │
  │    → evidence supports change?           │
  │    → no evidence? FLAG                   │
  └─────────────────────────────────────────┘

  threshold:
    score ≥ 0.7 + no flags → auto-merge
    score 0.4-0.7 → merge with warning
    score < 0.4 OR flags → human review
```

**Adopted from:**
- **HyperTune** (geeknik/HyperTune, 120⭐): coherence/relevance/quality scoring
- **HaluGard** (ppp727276/halugard): G2 claim verify, G3 contradiction, G4 drift detect
- **dcg** (destructive_command_guard, 3.8k⭐): pattern packs + explain mode
- **prompt-ops** (meta-llama/prompt-ops): prompt optimization candidate for Phase 5

**Dream vs Validation layer:**

```
Dream:     "Is this correct?" → evidence-based, slow, ground truth
HyperTune: "Is this garbage?" → form-based, instant, quality gate
HaluGard:  "Is this consistent?" → contradiction/drift, instant, consistency gate
```

### 5.5 Context Injection Model (v1 vs v2)

```
v1 (PASSIVE — Hermes-only):
  Hermes memory() → MEMORY.md (516 chars)
  Bridge → persona.md (3920 chars)
  Dream → active.md (4496 chars)
  → 3 files, 8932 chars passively injected
  → Agent has no control

v2 (ACTIVE — Agent-agnostic):
  Agent calls capricorn.context → 1 distilled block (~3000 chars)
  Contains: top confirmed preferences + persona summary
  → Agent controls when and what to query
  → MEMORY.md is dead — capricorn replaces Hermes memory()
  → active.md + persona.md internal use only
  → 8932 chars → 3000 chars (67% reduction)
```