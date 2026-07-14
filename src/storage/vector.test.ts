import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CapricornStorage } from "../storage/index.ts";
import { mergeConfig } from "../config.ts";

function vec(dims: number, value: number): number[] {
  const arr = new Array(dims).fill(0);
  arr[0] = value;
  return arr;
}

describe("vector search", () => {
  let tempDir: string;
  let storage: CapricornStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "capricorn-vec-"));
    const dbPath = join(tempDir, "test.db");
    const vaultPath = join(tempDir, "vault");
    const config = mergeConfig({
      vault: { path: vaultPath, auto_sync: true },
      storage: { db_path: dbPath, vector_provider: "none" },
    });
    storage = new CapricornStorage(dbPath, vaultPath, config);
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("finds similar vectors", async () => {
    const dims = 4;
    storage.memory.remember({ content: "cat" }, vec(dims, 1));
    storage.memory.remember({ content: "dog" }, vec(dims, 0.9));
    storage.memory.remember({ content: "car" }, vec(dims, -1));

    const results = storage.memory.recallByVector(vec(dims, 1), 3);
    expect(results[0].content).toBe("cat");
    expect(results[1].content).toBe("dog");
  });

  it("fuses FTS and vector via RRF", async () => {
    const dims = 4;
    storage.memory.remember({ content: "the cat sat" }, vec(dims, 1));
    storage.memory.remember({ content: "the dog ran" }, vec(dims, 0.9));

    const results = storage.memory.recallHybrid("cat", vec(dims, 1), 5);
    const contents = results.map((r) => r.content);
    expect(contents).toContain("the cat sat");
    expect(contents).toContain("the dog ran");
  });
});
