import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CapricornStorage } from "../storage/index.ts";
import { mergeConfig } from "../config.ts";

describe("CapricornStorage ingest", () => {
  let tempDir: string;
  let storage: CapricornStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "capricorn-ingest-"));
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

  it("remembers multiple lines as memories", async () => {
    await storage.remember({ content: "first memory" });
    await storage.remember({ content: "second memory" });
    const results = await storage.recall("memory");
    expect(results.length).toBe(2);
  });
});
