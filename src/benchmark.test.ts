import { describe, it, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BenchmarkRunner } from "./benchmark.ts";
import { CapricornStorage } from "./storage/index.ts";
import type { CapricornConfig } from "./types.ts";
import { DEFAULT_CONFIG } from "./config.ts";

function localConfig(dbPath: string, dims = 64): CapricornConfig {
  return { ...DEFAULT_CONFIG, storage: { ...DEFAULT_CONFIG.storage, db_path: dbPath, vector_provider: "local", vector_dimensions: dims } } as CapricornConfig;
}

describe("BenchmarkRunner", () => {
  it("measures self-recall on seeded memories", async () => {
    const root = mkdtempSync(join(tmpdir(), "cap-bench-"));
    const dbPath = join(root, "test.db");
    const config = localConfig(dbPath, 64);
    const storage = new CapricornStorage(dbPath, root, config);
    await storage.remember({ content: "User prefers dark mode." });
    const id2 = (await storage.remember({ content: "User likes coffee." })).memory.id;
    const runner = new BenchmarkRunner(storage, config);
    const result = await runner.run("self-recall", [{ query: "User likes coffee.", expectedId: id2 }]);
    expect(result.total).toBe(1);
    expect(result.meanLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
