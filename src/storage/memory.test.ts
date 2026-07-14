import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CapricornStorage } from "../storage/index.ts";

describe("CapricornStorage", () => {
  let tempDir: string;
  let storage: CapricornStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "capricorn-"));
    const dbPath = join(tempDir, "test.db");
    const vaultPath = join(tempDir, "vault");
    storage = new CapricornStorage(dbPath, vaultPath);
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("remembers and recalls a memory", () => {
    const { memory } = storage.remember({ content: "User prefers dark mode", tags: ["preference", "ui"] });
    expect(memory.content).toBe("User prefers dark mode");
    const results = storage.recall("dark mode");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(memory.id);
  });

  it("forgets a memory and removes vault file", () => {
    const { memory, vaultPath } = storage.remember({ content: "temporary" });
    expect(vaultPath).toBeDefined();
    expect(existsSync(vaultPath!)).toBe(true);
    const deleted = storage.forget(memory.id);
    expect(deleted).toBe(true);
    expect(existsSync(vaultPath!)).toBe(false);
    const results = storage.recall("temporary");
    expect(results.length).toBe(0);
  });

  it("writes signal to vault", () => {
    const { vaultPath } = storage.remember({ content: "Vault test" });
    expect(vaultPath).toBeDefined();
    expect(vaultPath).toContain("Brain");
    expect(vaultPath).toContain("sig-");
  });

  it("handles special characters in queries", () => {
    storage.remember({ content: "react (v17)", tags: ["frontend"] });
    const results = storage.recall("react (v17)");
    expect(results.length).toBeGreaterThan(0);
  });

  it("handles CJK content", () => {
    storage.remember({ content: "用户喜欢深色模式", tags: ["preference"] });
    const results = storage.recall("深色模式");
    expect(results.length).toBeGreaterThan(0);
  });

  it("rejects empty content", () => {
    expect(() => storage.remember({ content: "" })).toThrow();
  });

  it("computes real db and vault sizes", () => {
    storage.remember({ content: "size sample" });
    const stats = storage.stats();
    expect(stats.total_memories).toBe(1);
    expect(stats.db_size).toBeGreaterThan(0);
    expect(stats.vault_size).toBeGreaterThan(0);
  });
});
