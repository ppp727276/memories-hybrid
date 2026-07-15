#!/usr/bin/env bun
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapricornStorage } from "../src/storage/index.ts";
import { ForgePipeline } from "../src/intelligence/forge.ts";
import { DreamPipeline } from "../src/intelligence/dream.ts";
import { VaultSync } from "../src/storage/sync.ts";
import { createEmbedder } from "../src/embeddings.ts";
import type { LLMRunner } from "../src/intelligence/llm.ts";

const root = mkdtempSync(join(tmpdir(), "capricorn-phase4-"));
process.env.CAPRICORN_CONFIG = join(root, "capricorn.json");

async function run() {
  const { loadConfig } = await import("../src/config.ts");
  const config = loadConfig();
  config.vault.path = join(root, "vault");
  config.storage.db_path = join(root, "capricorn.db");
  config.storage.vector_provider = "local";

  const storage = new CapricornStorage(config.storage.db_path, config.vault.path, config);
  const embedder = createEmbedder(config);

  const fakeLLM: LLMRunner = {
    enabled: () => true,
    complete: async () => "User prefers dark mode.",
  };

  await storage.remember({ content: "User prefers dark mode." });

  const forge = new ForgePipeline(storage, fakeLLM);
  const forgeResult = await forge.run();
  if (forgeResult.processed < 1) throw new Error(`bridge processed ${forgeResult.processed}`);

  const dream = new DreamPipeline(storage);
  const dreamResult = await dream.run();
  if (dreamResult.created + dreamResult.processed < 1) throw new Error(`dream created ${dreamResult.created}`);

  await storage.remember({ content: "Capricorn sync smoke signal." });
  const sync = new VaultSync(storage);
  const syncResult = sync.sync();
  const { readdirSync: rd, readFileSync: rf } = await import("node:fs");
  let vaultFound = false;
  try {
    for (const entry of rd(join(config.vault.path, "Brain", "inbox"), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        if (rf(join(config.vault.path, "Brain", "inbox", entry.name), "utf8").includes("Capricorn sync smoke signal")) {
          vaultFound = true; break;
        }
      }
    }
  } catch {}
  if (!vaultFound) throw new Error("vault file not found after remember()");

  const vec = await embedder.embed("dark mode");
  if (vec.length < 1) throw new Error("local embedder returned empty vector");

  console.log("PHASE4 SMOKE PASS", { forgeResult, dreamResult, syncResult, vectorDimensions: vec.length });
  storage.close();
}

try {
  await run();
} finally {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // ignore Windows lock cleanup errors in smoke test
  }
}
