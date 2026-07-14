import type { Database } from "bun:sqlite";
import { generateId } from "../utils/id.ts";
import { runSql, queryAll, queryGet } from "../utils/sqlite.ts";

export interface PromptVariant {
  id: string;
  task: string;
  name: string;
  template: string;
  alpha: number;
  beta: number;
  wins: number;
  losses: number;
  scoreSum: number;
  scoreCount: number;
  createdAt: number;
}

export interface PromptOutcome {
  id: string;
  variantId: string;
  task: string;
  input: string;
  output: string;
  score: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface EvalCase {
  id: string;
  task: string;
  input: string;
  expected?: string;
  source?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

function betaSample(a: number, b: number): number {
  // Thompson sampling via Beta(a,b). For integer shapes use exact order-statistic method;
  // for large shapes fall back to normal approximation.
  const n = Math.floor(a + b - 2);
  if (n > 0 && n <= 1000) {
    const k = Math.floor(a - 1);
    const uniforms: number[] = [];
    for (let i = 0; i < n; i++) uniforms.push(Math.random());
    uniforms.sort((x, y) => x - y);
    return uniforms[k] ?? 0;
  }
  const mean = a / (a + b);
  const var_ = (a * b) / ((a + b) ** 2 * (a + b + 1));
  const std = Math.sqrt(var_);
  return Math.max(0, Math.min(1, mean + std * (Math.random() * 2 - 1)));
}

export class PromptOptimizer {
  constructor(private db: Database) {}

  createVariant(task: string, name: string, template: string): PromptVariant {
    const id = generateId("pv");
    runSql(
      this.db,
      `INSERT INTO prompt_variants (id, task, name, template, alpha, beta, wins, losses, score_sum, score_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, task, name, template, 1, 1, 0, 0, 0, 0, Date.now(),
    );
    return { id, task, name, template, alpha: 1, beta: 1, wins: 0, losses: 0, scoreSum: 0, scoreCount: 0, createdAt: Date.now() };
  }

  getVariants(task: string): PromptVariant[] {
    return queryAll<{ id: string; task: string; name: string; template: string; alpha: number; beta: number; wins: number; losses: number; score_sum: number; score_count: number; created_at: number }>(
      this.db,
      "SELECT * FROM prompt_variants WHERE task = ?",
      task,
    ).map((r) => ({ id: r.id, task: r.task, name: r.name, template: r.template, alpha: r.alpha, beta: r.beta, wins: r.wins, losses: r.losses, scoreSum: r.score_sum, scoreCount: r.score_count, createdAt: r.created_at }));
  }

  selectVariant(task: string): PromptVariant | null {
    const variants = this.getVariants(task);
    if (variants.length === 0) return null;
    let best: PromptVariant | null = null;
    let bestScore = -Infinity;
    for (const v of variants) {
      const a = v.wins + v.alpha;
      const b = v.losses + v.beta;
      const sample = betaSample(a, b);
      if (sample > bestScore) {
        bestScore = sample;
        best = v;
      }
    }
    return best;
  }

  recordOutcome(variantId: string, input: string, output: string, score: number, metadata: Record<string, unknown> = {}): PromptOutcome {
    const variant = queryGet<{ task: string }>(this.db, "SELECT task FROM prompt_variants WHERE id = ?", variantId);
    if (!variant) throw new Error(`variant not found: ${variantId}`);
    const id = generateId("po");
    runSql(
      this.db,
      `INSERT INTO prompt_outcomes (id, variant_id, task, input, output, score, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, variantId, variant.task, input, output, score, JSON.stringify(metadata), Date.now(),
    );
    runSql(
      this.db,
      "UPDATE prompt_variants SET score_sum = score_sum + ?, score_count = score_count + 1 WHERE id = ?",
      score, variantId,
    );
    return { id, variantId, task: variant.task, input, output, score, metadata, createdAt: Date.now() };
  }

  recordDuel(winnerId: string, loserId: string): void {
    runSql(this.db, "UPDATE prompt_variants SET wins = wins + 1 WHERE id = ?", winnerId);
    runSql(this.db, "UPDATE prompt_variants SET losses = losses + 1 WHERE id = ?", loserId);
  }

  createEvalCase(task: string, input: string, expected?: string, source?: string, metadata: Record<string, unknown> = {}): EvalCase {
    const id = generateId("ec");
    runSql(
      this.db,
      "INSERT INTO eval_cases (id, task, input, expected, source, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, task, input, expected ?? null, source ?? null, JSON.stringify(metadata), Date.now(),
    );
    return { id, task, input, expected, source, metadata, createdAt: Date.now() };
  }

  getEvalCases(task: string): EvalCase[] {
    return queryAll<{ id: string; task: string; input: string; expected: string | null; source: string | null; metadata: string; created_at: number }>(
      this.db,
      "SELECT * FROM eval_cases WHERE task = ?",
      task,
    ).map((r) => ({ id: r.id, task: r.task, input: r.input, expected: r.expected ?? undefined, source: r.source ?? undefined, metadata: JSON.parse(r.metadata), createdAt: r.created_at }));
  }

  report(task: string): { variants: (PromptVariant & { winRate: number; avgScore: number })[]; totalOutcomes: number } {
    const variants = this.getVariants(task);
    const totalOutcomes = queryGet<{ c: number }>(this.db, "SELECT COUNT(*) as c FROM prompt_outcomes WHERE task = ?", task)?.c ?? 0;
    return {
      variants: variants.map((v) => {
        const total = v.wins + v.losses;
        return { ...v, winRate: total === 0 ? 0 : v.wins / total, avgScore: v.scoreCount === 0 ? 0 : v.scoreSum / v.scoreCount };
      }),
      totalOutcomes,
    };
  }
}
