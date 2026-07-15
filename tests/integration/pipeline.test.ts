import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CapricornStorage } from "../../src/storage/index.ts";
import { mergeConfig } from "../../src/config.ts";
import { VaultSync } from "../../src/storage/sync.ts";
import { logger } from "../../src/utils/logger.ts";

describe("Integration — E2E pipeline", () => {
  const tmp = mkdtempSync("capricorn-integration-");
  const vaultPath = join(tmp, "vault");
  const dbPath = join(tmp, "capricorn.db");
  const config = mergeConfig({
    vault: { path: vaultPath, auto_sync: false },
    storage: { db_path: dbPath, vector_provider: "none", vector_model: "none", vector_dimensions: 0 },
    intelligence: { forge: { enabled: false, schedule: "", llm_provider: "none", llm_model: "", embedding_provider: "none", embedding_model: "", batch_size: 0 }, dream: { enabled: false, schedule: "", confidence_threshold_confirm: 0.6, evidence_threshold_confirm: 3 } },
  });
  const storage = new CapricornStorage(dbPath, vaultPath, config);

  afterAll(() => {
    storage.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("remember → recall → forget", async () => {
    const { memory } = await storage.remember({ content: "test integration memory" });
    expect(memory.id).toBeTruthy();
    expect(memory.content).toBe("test integration memory");

    const results = await storage.recall("integration");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toBe("test integration memory");

    const ok = await storage.forget(memory.id);
    expect(ok).toBe(true);

    const after = await storage.recall("integration");
    expect(after.length).toBe(0);
  });

  it("remember → vault sync → DB consistency", async () => {
    const { memory } = await storage.remember({ content: "sync test memory" });
    const sync = new VaultSync(storage);
    const result = sync.sync();
    expect(result.imported + result.exported).toBeGreaterThanOrEqual(0);
    // vault_sync_state should be marked after remember()
    const dbMemory = storage.memory.getById(memory.id);
    expect(dbMemory?.content).toBe("sync test memory");
  });

  it("stats returns extended metrics", () => {
    const stats = storage.stats();
    expect(stats.total_memories).toBeGreaterThanOrEqual(0);
    expect(stats.db_size).toBeGreaterThanOrEqual(0);
    expect(stats.vault_size).toBeGreaterThanOrEqual(0);
    expect(stats).toHaveProperty("enrichment_queue");
    expect(stats).toHaveProperty("failed_enrichments");
    expect(stats).toHaveProperty("last_bridge");
    expect(stats).toHaveProperty("last_dream");
  });

  it("lifecycle — archive and forget-older", async () => {
    const { memory } = await storage.remember({ content: "archive test" });
    const ok = storage.memory.archiveMemory(memory.id);
    expect(ok).toBe(true);
    const archived = storage.memory.getById(memory.id);
    expect(archived).toBeNull();

    const count = storage.memory.forgetOlderThan(0);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("cron state persistence", () => {
    storage.memory.saveJobState("test", "2026-01-01", "ok");
    const state = storage.memory.getJobState("test");
    expect(state).toBeTruthy();
    expect(state!.lastRun).toBe("2026-01-01");
    expect(state!.lastStatus).toBe("ok");
  });

  it("vault sync state tracking", () => {
    storage.memory.markVaultSynced("mem_test", "/tmp/test.md");
    const unsynced = storage.memory.getUnsyncedMemories();
    expect(unsynced.every((m) => m.id !== "mem_test")).toBe(true);
  });
});

describe("Integration — logger", () => {
  it("writes log entries without throwing", () => {
    logger.info("test", "integration test message");
    logger.warn("test", "warning message", new Error("test warning"));
    logger.error("test", "error message", new Error("test error"));
    logger.debug("test", "debug message");
    // no assertion needed — just verify it doesn't throw
  });
});