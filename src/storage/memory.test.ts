import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CapricornStorage } from "../storage/index.ts";
import { mergeConfig } from "../config.ts";

describe("CapricornStorage", () => {
  let tempDir: string;
  let storage: CapricornStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "capricorn-"));
    const dbPath = join(tempDir, "test.db");
    const vaultPath = join(tempDir, "vault");
    const config = mergeConfig({
      vault: { path: vaultPath, auto_sync: true },
      storage: { db_path: dbPath, vector_provider: "none", vector_model: "", vector_dimensions: 0 },
    });
    storage = new CapricornStorage(dbPath, vaultPath, config);
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("remembers and recalls a memory", async () => {
    const { memory } = await storage.remember({ content: "User prefers dark mode", tags: ["preference", "ui"] });
    expect(memory.content).toBe("User prefers dark mode");
    const results = await storage.recall("dark mode");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(memory.id);
  });

  it("forgets a memory and removes vault file", async () => {
    const { memory, vaultPath } = await storage.remember({ content: "temporary" });
    expect(vaultPath).toBeDefined();
    expect(existsSync(vaultPath!)).toBe(true);
    const deleted = await storage.forget(memory.id);
    expect(deleted).toBe(true);
    expect(existsSync(vaultPath!)).toBe(false);
    const results = await storage.recall("temporary");
    expect(results.length).toBe(0);
  });

  it("writes signal to vault", async () => {
    const { vaultPath } = await storage.remember({ content: "Vault test" });
    expect(vaultPath).toBeDefined();
    expect(vaultPath).toContain("Brain");
    expect(vaultPath).toContain("sig-");
  });

  it("handles special characters in queries", async () => {
    await storage.remember({ content: "react (v17)", tags: ["frontend"] });
    const results = await storage.recall("react (v17)");
    expect(results.length).toBeGreaterThan(0);
  });

  it("handles CJK content", async () => {
    await storage.remember({ content: "用户喜欢深色模式", tags: ["preference"] });
    const results = await storage.recall("深色模式");
    expect(results.length).toBeGreaterThan(0);
  });

  it("rejects empty content", async () => {
    expect(() => storage.remember({ content: "" })).toThrow();
  });

  it("computes real db and vault sizes", async () => {
    await storage.remember({ content: "size sample" });
    const stats = storage.stats();
    expect(stats.total_memories).toBe(1);
    expect(stats.db_size).toBeGreaterThan(0);
    expect(stats.vault_size).toBeGreaterThan(0);
  });
});
