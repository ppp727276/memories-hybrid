#!/usr/bin/env bun
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapricornStorage } from "../src/storage/index.ts";
import { ForgePipeline } from "../src/intelligence/forge.ts";
import { DreamPipeline } from "../src/intelligence/dream.ts";
import { VaultSync } from "../src/storage/sync.ts";
import type { LLMRunner } from "../src/intelligence/llm.ts";

const tmp = mkdtempSync(join(tmpdir(), "capricorn-smoke-"));
const config = {
  vault: { path: tmp, auto_sync: true },
  storage: { db_path: join(tmp, "capricorn.db"), vector_provider: "none", vector_model: "text-embedding-v3", vector_dimensions: 1024 },
  intelligence: {
    forge: { enabled: false, schedule: "0 */6 * * *", llm_provider: "none", llm_model: "", embedding_provider: "", embedding_model: "", batch_size: 100 },
    dream: { enabled: false, schedule: "15 * * * *", confidence_threshold_confirm: 0.6, evidence_threshold_confirm: 3 },
  },
  mcp: { enabled: true, transport: "stdio" },
  http: { enabled: false, port: 7437, host: "127.0.0.1" },
};

const storage = new CapricornStorage(join(tmp, "capricorn.db"), tmp, config);

const fakeLLM: LLMRunner = {
  enabled: () => true,
  complete: async () => "User prefers dark mode.",
};

try {
  await storage.remember({ content: "User prefers dark mode." });

  const forge = new ForgePipeline(storage, fakeLLM);
  const forgeResult = await forge.run();
  if (forgeResult.processed < 1) throw new Error(`bridge processed ${forgeResult.processed}, expected >= 1`);
  console.log("bridge ok:", forgeResult);

  const dream = new DreamPipeline(storage);
  const dreamResult = await dream.run("default", 0.4, 1);
  if (dreamResult.created < 1) throw new Error(`dream created ${dreamResult.created}, expected >= 1`);
  console.log("dream ok:", dreamResult);

  await storage.remember({ content: "Round-trip smoke memory" });
    const sync = new VaultSync(storage);
    const syncResult = sync.sync();
    const { readdirSync: rd, readFileSync: rf } = await import("node:fs");
    let vaultFound = false;
    try {
      for (const entry of rd(join(tmp, "Brain", "inbox"), { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          if (rf(join(tmp, "Brain", "inbox", entry.name), "utf8").includes("Round-trip smoke memory")) {
            vaultFound = true; break;
          }
        }
      }
    } catch {}
    if (!vaultFound) throw new Error("vault file not found after remember()");
  console.log("sync ok:", syncResult);

  console.log("SMOKE PASS");
} finally {
  storage.close();
  rmSync(tmp, { recursive: true });
}
