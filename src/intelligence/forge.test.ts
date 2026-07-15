import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapricornStorage } from "../storage/index.ts";
import { ForgePipeline } from "./forge.ts";
import type { LLMRunner } from "./llm.ts";

describe("ForgePipeline", () => {
  let tmp: string;
  let storage: CapricornStorage;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "capricorn-forge-"));
    storage = new CapricornStorage(join(tmp, "capricorn.db"), tmp, {
      vault: { path: tmp, auto_sync: false },
      storage: { db_path: join(tmp, "capricorn.db"), vector_provider: "none", vector_model: "text-embedding-v3", vector_dimensions: 1024 },
      intelligence: {
        forge: { enabled: false, schedule: "0 */6 * * *", llm_provider: "none", llm_model: "", embedding_provider: "", embedding_model: "", batch_size: 100 },
        dream: { enabled: false, schedule: "15 * * * *", confidence_threshold_confirm: 0.6, evidence_threshold_confirm: 3 },
      },
      mcp: { enabled: true, transport: "stdio" },
      http: { enabled: false, port: 7437, host: "127.0.0.1" },
    });
  });

  afterEach(() => {
    storage.close();
    rmSync(tmp, { recursive: true });
  });

  it("skips processing when LLM is disabled", async () => {
    const stub: LLMRunner = {
      enabled: () => false,
      complete: async () => "",
    };
    storage.memory.remember({ content: "User likes tea." });
    const forge = new ForgePipeline(storage, stub);
    const result = await forge.run();
    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.insights).toBe(0);
  });

  it("processes a memory and creates insights/persona when LLM is enabled", async () => {
    const stub: LLMRunner = {
      enabled: () => true,
      complete: async (prompt: string) => {
        if (prompt.includes("preference")) return "User prefers tea.";
        if (prompt.includes("scene")) return "Tea drinking scene.";
        return "Persona: tea lover.";
      },
    };
    storage.memory.remember({ content: "User likes tea." });
    const forge = new ForgePipeline(storage, stub);
    const result = await forge.run();
    expect(result.processed).toBe(1);
    expect(result.insights).toBeGreaterThanOrEqual(2);
    expect(result.personas).toBe(1);
  });
});
