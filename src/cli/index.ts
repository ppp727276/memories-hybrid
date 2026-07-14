#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, renameSync, writeFileSync, readFileSync } from "node:fs";
import { CapricornStorage } from "../storage/index.ts";
import { loadConfig, saveConfig, expandPath, DEFAULT_CONFIG } from "../config.ts";
import type { MemoryInput } from "../types.ts";
import { createLLMRunner, ForgePipeline, DreamPipeline, VaultSync } from "../intelligence/index.ts";
import { OsbBridge } from "../bridge/osb.ts";
import { CapricornScheduler } from "../scheduler.ts";

export function makeStorage(config = loadConfig()) {
  return new CapricornStorage(config.storage.db_path, config.vault.path, config);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { args, positional };
}

function splitTags(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  return raw.split(/[,\s]+/).filter(Boolean);
}

async function main(argv: string[]) {
  const { args, positional } = parseArgs(argv.slice(2));
  const command = positional[0];

  if (command === "init") {
    const config = loadConfig();
    mkdirSync(expandPath(config.vault.path), { recursive: true });
    mkdirSync(dirname(expandPath(config.storage.db_path)), { recursive: true });
    saveConfig(config);
    const storage = makeStorage(config);
    storage.close();
    console.log(JSON.stringify({ status: "initialized", vault: config.vault.path, db: config.storage.db_path }, null, 2));
    return;
  }

  if (command === "remember") {
    const content = positional.slice(1).join(" ");
    if (!content) throw new Error("content required");
    const storage = makeStorage();
    const input: MemoryInput = {
      content,
      source: (args.source as string) ?? "user",
      project: (args.project as string) ?? undefined,
      session_id: (args["session-id"] as string) ?? undefined,
      tags: splitTags(args.tags as string),
      metadata: { importance: args.importance ? Number(args.importance) : undefined },
    };
    const { memory, vaultPath } = await storage.remember(input);
    console.log(JSON.stringify({ id: memory.id, status: "stored", vaultPath }, null, 2));
    storage.close();
    return;
  }

  if (command === "recall") {
    const query = positional.slice(1).join(" ");
    const topK = Number(args["top-k"] ?? 5);
    const project = (args.project as string) ?? null;
    const storage = makeStorage();
    const results = await storage.recall(query, topK, project);
    console.log(JSON.stringify({ results }, null, 2));
    storage.close();
    return;
  }

  if (command === "search") {
    const query = positional.slice(1).join(" ");
    const limit = Number(args.limit ?? 10);
    const project = (args.project as string) ?? null;
    const storage = makeStorage();
    const results = storage.search(query, limit, project);
    console.log(JSON.stringify({ results }, null, 2));
    storage.close();
    return;
  }

  if (command === "forget") {
    const id = positional[1];
    if (!id) throw new Error("id required");
    const storage = makeStorage();
    const ok = await storage.forget(id);
    console.log(JSON.stringify({ id, status: ok ? "deleted" : "not_found" }, null, 2));
    storage.close();
    return;
  }

  if (command === "stats") {
    const storage = makeStorage();
    const stats = storage.stats();
    console.log(JSON.stringify(stats, null, 2));
    storage.close();
    return;
  }

  if (command === "context") {
    const maxChars = Number(args["max-chars"] ?? 3000);
    const profile = (args.profile as string) ?? "default";
    const storage = makeStorage();
    const confirmed = storage.memory.getAllPreferences().filter((p) => p.tier === "confirmed");
    const persona = storage.memory.getLatestPersona(profile);
    const lines: string[] = [];
    lines.push(`# Capricorn Context`);
    lines.push(``);
    if (persona?.content) {
      lines.push(`## Persona`);
      lines.push(persona.content);
      lines.push(``);
    }
    lines.push(`## Preferences (${confirmed.length} confirmed)`);
    for (const pref of confirmed.slice(0, 20)) {
      lines.push(`- ${pref.body} (confidence: ${pref.confidence.toFixed(2)})`);
    }
    let context = lines.join("\n").slice(0, maxChars);
    if (context.length >= maxChars) context = context.slice(0, maxChars - 3) + "...";
    console.log(JSON.stringify({ context, prefs_count: confirmed.length, persona_version: persona?.version ?? 0 }, null, 2));
    storage.close();
    return;
  }

  if (command === "ingest") {
    const file = positional[1];
    if (!file) throw new Error("file required");
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    const storage = makeStorage();
    const ids: string[] = [];
    for (const line of lines) {
      const { memory } = await storage.remember({ content: line, source: "ingest" });
      ids.push(memory.id);
    }
    console.log(JSON.stringify({ imported: ids.length, ids }, null, 2));
    storage.close();
    return;
  }

  if (command === "setup") {
    const agent = positional[1];
    const entry = fileURLToPath(new URL("../mcp/server.ts", import.meta.url));
    const agents: Record<string, { path: string; transform?: (cfg: object) => object }> = {
      hermes: { path: join(homedir(), ".hermes", "mcp.json") },
      claude: { path: join(homedir(), ".claude", "mcp.json") },
      codex: { path: join(homedir(), ".codex", "mcp.json") },
      cursor: { path: join(homedir(), ".cursor", "mcp.json") },
      windsurf: { path: join(homedir(), ".windsurf", "mcp_config.json") },
    };
    if (!(agent in agents)) throw new Error(`unknown agent: ${agent}`);
    const { path } = agents[agent];
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      renameSync(path, `${path}.bak.${Date.now()}`);
    }
    const config = {
      mcpServers: {
        capricorn: {
          command: "bun",
          args: [entry],
        },
      },
    };
    writeFileSync(path, JSON.stringify(config, null, 2));
    console.log(JSON.stringify({ status: "configured", agent, path }, null, 2));
    return;
  }

  if (command === "bridge") {
    const profile = (args.profile as string) ?? "default";
    const batchSize = Number(args["batch-size"] ?? 10);
    const storage = makeStorage();
    const llm = createLLMRunner(loadConfig());
    const forge = new ForgePipeline(storage, llm);
    const result = await forge.run(profile, batchSize);
    console.log(JSON.stringify({ status: "bridge_complete", result }, null, 2));
    storage.close();
    return;
  }

  if (command === "dream") {
    const profile = (args.profile as string) ?? "default";
    const storage = makeStorage();
    const dream = new DreamPipeline(storage);
    const result = await dream.run(profile);
    console.log(JSON.stringify({ status: "dream_complete", result }, null, 2));
    storage.close();
    return;
  }

  if (command === "sync") {
    const storage = makeStorage();
    const sync = new VaultSync(storage);
    const result = sync.sync();
    console.log(JSON.stringify({ status: "sync_complete", result }, null, 2));
    storage.close();
    return;
  }

  if (command === "cron") {
    const config = loadConfig();
    const scheduler = new CapricornScheduler(config);
    scheduler.start();
    console.log(JSON.stringify({ status: "cron_started", schedules: config.intelligence }, null, 2));
    process.on("SIGINT", () => {
      scheduler.stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      scheduler.stop();
      process.exit(0);
    });
    return;
  }

  if (command === "explain") {
    const id = positional[1];
    if (!id) throw new Error("id required");
    const storage = makeStorage();
    const memory = storage.memory.getById(id);
    const insights = storage.memory.getInsights(id);
    console.log(JSON.stringify({ id, memory, insights }, null, 2));
    storage.close();
    return;
  }

  if (command === "benchmark") {
    const storage = makeStorage();
    const { BenchmarkRunner } = await import("../benchmark.ts");
    const runner = new BenchmarkRunner(storage, loadConfig());
    const memories = storage.memory.getRandomMemories(10);
    const cases = memories.map((m) => ({ query: m.content, expectedId: m.id }));
    if (cases.length === 0) {
      console.log(JSON.stringify({ error: "no memories to benchmark" }, null, 2));
      storage.close();
      return;
    }
    const result = await runner.run("self-recall", cases);
    console.log(JSON.stringify(result, null, 2));
    storage.close();
    return;
  }

  if (command === "conflicts") {
    const storage = makeStorage();
    const { detectConflicts } = await import("../intelligence/conflict.ts");
    const rows = storage.memory.getAllPreferences();
    const prefs = rows.map((p) => ({ id: p.id, body: p.body, tier: p.tier }));
    const conflicts = detectConflicts(prefs);
    console.log(JSON.stringify({ status: "conflicts_complete", count: conflicts.length, conflicts }, null, 2));
    storage.close();
    return;
  }

  if (command === "prompt-ops") {
    const sub = positional[1] ?? "report";
    const taskArg = args["task"] ?? args["t"] ?? "context";
    const task = String(taskArg);
    const storage = makeStorage();
    if (sub === "list") {
      const variants = storage.promptOps.getVariants(task);
      console.log(JSON.stringify({ task, variants }, null, 2));
    } else if (sub === "report") {
      const report = storage.promptOps.report(task);
      console.log(JSON.stringify({ task, report }, null, 2));
    } else if (sub === "create") {
      const name = positional[2];
      const template = positional[3];
      if (!name || !template) throw new Error("usage: prompt-ops create <name> <template> [--task context]");
      const variant = storage.promptOps.createVariant(task, name, template);
      console.log(JSON.stringify({ created: variant }, null, 2));
    } else if (sub === "duel") {
      const winner = positional[2];
      const loser = positional[3];
      if (!winner || !loser) throw new Error("usage: prompt-ops duel <winner-id> <loser-id>");
      storage.promptOps.recordDuel(winner, loser);
      console.log(JSON.stringify({ status: "duel_recorded", winner, loser }, null, 2));
    } else if (sub === "record") {
      const variantId = positional[2];
      const score = parseFloat(positional[3] ?? "0");
      if (!variantId || Number.isNaN(score)) throw new Error("usage: prompt-ops record <variant-id> <score>");
      storage.promptOps.recordOutcome(variantId, "", "", score);
      console.log(JSON.stringify({ status: "outcome_recorded", variantId, score }, null, 2));
    } else {
      console.log(JSON.stringify({ error: `unknown prompt-ops subcommand: ${sub}` }, null, 2));
    }
    storage.close();
    return;
  }

  if (command === "relations") {
    const id = positional[1];
    if (!id) throw new Error("id required");
    const storage = makeStorage();
    const memory = storage.memory.getById(id);
    const related = storage.memory.search("", 1000).filter((m) => m.id !== id);
    console.log(JSON.stringify({ id, memory, related }, null, 2));
    storage.close();
    return;
  }

  if (command === "enrich") {
    const id = positional[1];
    if (!id) throw new Error("id required");
    const storage = makeStorage();
    const llm = createLLMRunner(loadConfig());
    const forge = new ForgePipeline(storage, llm);
    const result = await forge.enrich(id);
    console.log(JSON.stringify({ status: "enrich_complete", result }, null, 2));
    storage.close();
    return;
  }

  if (command === "bridge-osb") {
    const config = loadConfig();
    const storage = makeStorage(config);
    const dryRun = args["dry-run"] === true;
    const runner = async () => {
      const llm = createLLMRunner(config);
      const { ForgePipeline } = await import("../intelligence/forge.ts");
      const forge = new ForgePipeline(storage, llm);
      await forge.run("default", config.intelligence.forge.batch_size);
    };
    const bridge = new OsbBridge(storage, config.bridge ?? DEFAULT_CONFIG.bridge!, runner);
    const result = await bridge.run(dryRun);
    console.log(JSON.stringify({ status: "bridge_osb_complete", result }, null, 2));
    storage.close();
    return;
  }

  console.log(`Usage: capricorn <command> [options]
Commands:
  init
  remember <content> [--tags a,b] [--importance 0.9] [--project x] [--session-id s]
  recall <query> [--top-k n] [--project x]
  search <query> [--limit n] [--project x]
  forget <id>
  stats
  context [--max-chars n] (outputs JSON)
  ingest <file>
  setup <hermes|claude|codex|cursor|windsurf>
  bridge [--profile p] [--batch-size n]
  bridge-osb [--dry-run]
  dream [--profile <name>]
  sync
  cron
  explain <id>
  enrich <id>
  benchmark
  conflicts
  relations <id>
  prompt-ops <list|report|create|duel|record> [--task context]`);
}


if (import.meta.main) {
  main(process.argv).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
