import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { PromptOptimizer } from "./prompt-ops.ts";

function setupDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE prompt_variants (
      id TEXT PRIMARY KEY, task TEXT NOT NULL, name TEXT NOT NULL, template TEXT NOT NULL,
      alpha REAL, beta REAL, wins INTEGER, losses INTEGER, score_sum REAL, score_count INTEGER, created_at INTEGER
    );
    CREATE TABLE prompt_outcomes (
      id TEXT PRIMARY KEY, variant_id TEXT NOT NULL, task TEXT NOT NULL, input TEXT NOT NULL,
      output TEXT NOT NULL, score REAL NOT NULL, metadata TEXT, created_at INTEGER
    );
    CREATE TABLE eval_cases (
      id TEXT PRIMARY KEY, task TEXT NOT NULL, input TEXT NOT NULL, expected TEXT, source TEXT,
      metadata TEXT, created_at INTEGER
    );
  `);
  return db;
}

describe("PromptOptimizer", () => {
  it("creates variants and selects one", () => {
    const optimizer = new PromptOptimizer(setupDb());
    optimizer.createVariant("context", "v1", "Use these memories: {{memories}}");
    optimizer.createVariant("context", "v2", "Relevant context: {{memories}}");
    const selected = optimizer.selectVariant("context");
    expect(selected).not.toBeNull();
  });

  it("records outcomes and updates scores", () => {
    const optimizer = new PromptOptimizer(setupDb());
    const variant = optimizer.createVariant("context", "v1", "Use these memories: {{memories}}");
    optimizer.recordOutcome(variant.id, "input", "output", 0.85);
    const report = optimizer.report("context");
    expect(report.totalOutcomes).toBe(1);
    expect(report.variants[0].avgScore).toBe(0.85);
  });

  it("records duels and reports win rate", () => {
    const optimizer = new PromptOptimizer(setupDb());
    const v1 = optimizer.createVariant("context", "v1", "a");
    const v2 = optimizer.createVariant("context", "v2", "b");
    optimizer.recordDuel(v1.id, v2.id);
    const report = optimizer.report("context");
    expect(report.variants.find((v) => v.id === v1.id)?.winRate).toBe(1);
    expect(report.variants.find((v) => v.id === v2.id)?.winRate).toBe(0);
  });
});
