import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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

  it("forgets a memory", () => {
    const { memory } = storage.remember({ content: "temporary" });
    expect(storage.forget(memory.id)).toBe(true);
    const results = storage.recall("temporary");
    expect(results.length).toBe(0);
  });

  it("writes signal to vault", () => {
    const { vaultPath } = storage.remember({ content: "Vault test" });
    expect(vaultPath).toContain("Brain");
    expect(vaultPath).toContain("sig-");
  });
});
