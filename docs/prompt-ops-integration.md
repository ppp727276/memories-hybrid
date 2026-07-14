# Prompt-ops Integration

> Status: **Research / Phase 3+ candidate**. Not implemented yet.

This document describes how Meta's [`prompt-ops`](https://github.com/meta-llama/prompt-ops) could be integrated into the Capricorn v2 stack to optimize prompts used by Capricorn, HaluGard, and HyperTune.

## What is prompt-ops

`prompt-ops` is an Meta open-source Python toolkit for **automated prompt optimization**.

- Input: existing system prompt + query-response dataset + YAML config.
- Output: optimized prompt + performance metrics.
- Methods: template-based optimization + Prompt Duel Optimizer (PDO, dueling bandits + Thompson sampling).
- No labels required for PDO; uses win/loss comparisons between prompt candidates.

## Why it fits Capricorn

Capricorn already has three layers that evaluate or consume prompts:

| Component | Decides | Prompt-ops can optimize |
|---|---|---|
| **Capricorn** | Context retrieval & recall | `capricorn.context` system prompt, retrieval phrasing |
| **HaluGard** | Claim truth / contradiction / drift | G1-G4 gate prompts |
| **HyperTune** | Output quality | Quality scoring rubric prompt |

Adding prompt-ops gives a **fourth layer**: a prompt-quality optimizer that iterates on the prompts above using measured metrics.

## Proposed integration points

### 1. Context prompt optimization (`capricorn.context`)

Goal: find the template that makes `capricorn.context` return the most relevant context for a given query.

- Build eval dataset from recent sessions: `{query, expected_memory_ids}`.
- Run prompt-ops to vary ordering, phrasing, length of context prompt.
- Metric: recall@k of expected memories, relevance score.

### 2. HaluGard gate prompt optimization

Goal: improve accuracy of claim extraction, verification, contradiction, and drift detection.

- Eval dataset: manually labeled claim/evidence pairs.
- Vary gate prompts (G1 extraction, G2 verify, G3 contradiction, G4 drift).
- Metric: precision/recall of flagged vs true hallucinations.

### 3. HyperTune scoring prompt optimization

Goal: make quality scoring (coherence, relevance, quality) more aligned with human judgment.

- Eval dataset: human-rated outputs.
- Optimize the scorer prompt/rubric.
- Metric: correlation with human ratings.

## Data requirements

Prompt-ops needs an evaluation dataset. For Capricorn this is the main blocker.

| Use case | Minimum dataset | Source |
|---|---|---|
| Context prompt | 50+ `{query, relevant_memory_ids}` | Manual curation from session logs |
| HaluGard gates | 50+ labeled claim/evidence pairs | Synthetic + manual review |
| HyperTune scorer | 30+ human-rated outputs | Feedback loop / manual rating |

Until these datasets exist, prompt-ops cannot be meaningfully applied.

## Risks

| Risk | Mitigation |
|---|---|
| Ground truth ambiguous | Use human-approved subset as golden set |
| Overfit to scorer | Validate on separate holdout set |
| Prompt-ops optimizes for wrong metric | Keep HaluGard factual checks independent of HyperTune score |
| Cost & latency | Run offline (batch), not per-request |
| Maintenance | Version optimized prompts and track metrics |

## Sequencing

Recommended order:

1. **Phase 3** — Stabilize Forge/Dream, HaluGard G2-G4, HyperTune scorer.
2. **Phase 4** — Collect eval datasets from real usage.
3. **Phase 5** — Integrate prompt-ops as offline prompt optimization pipeline.

## Notes

- `prompt-ops` is Python; Capricorn v2 is TypeScript/Bun. Integration would likely be via subprocess or a separate Python service, not direct import.
- The toolkit already includes example datasets in `use-cases/`, which can serve as references for formatting our eval data.
