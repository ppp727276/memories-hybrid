#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { CapricornStorage } from "../storage/index.ts";
import { loadConfig, saveConfig, expandPath, DEFAULT_CONFIG } from "../config.ts";
import type { MemoryInput } from "../types.ts";

export function makeStorage(config = loadConfig()) {
  return new CapricornStorage(config.storage.db_path, config.vault.path);
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
    const { memory, vaultPath } = storage.remember(input);
    console.log(JSON.stringify({ id: memory.id, status: "stored", vaultPath }, null, 2));
    storage.close();
    return;
  }

  if (command === "recall") {
    const query = positional.slice(1).join(" ");
    const topK = Number(args["top-k"] ?? 5);
    const project = (args.project as string) ?? null;
    const storage = makeStorage();
    const results = storage.recall(query, topK, project);
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
    const ok = storage.forget(id);
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
    const storage = makeStorage();
    const prefs: string[] = [];
    const context = `Capricorn context (${prefs.length} prefs, ${maxChars} chars max)\nNo confirmed preferences yet.`;
    console.log(JSON.stringify({ context, prefs_count: 0, persona_version: 0 }, null, 2));
    storage.close();
    return;
  }

  if (command === "setup") {
    const agent = positional[1];
    if (agent === "hermes") {
      const hermesDir = join(homedir(), ".hermes");
      mkdirSync(hermesDir, { recursive: true });
      const mcpPath = join(hermesDir, "mcp.json");
      const entry = fileURLToPath(new URL("../mcp/server.ts", import.meta.url));
      if (existsSync(mcpPath)) {
        const backup = join(hermesDir, `mcp.json.bak.${Date.now()}`);
        renameSync(mcpPath, backup);
      }
      const config = {
        mcpServers: {
          capricorn: {
            command: "bun",
            args: [entry],
          },
        },
      };
      writeFileSync(mcpPath, JSON.stringify(config, null, 2));
      console.log(JSON.stringify({ status: "configured", agent: "hermes", path: mcpPath }, null, 2));
      return;
    }
    throw new Error(`unknown agent: ${agent}`);
  }

  console.log(`Usage: capricorn <command> [options]
Commands:
  init
  remember <content> [--tags a,b] [--importance 0.9] [--project x] [--session-id s]
  recall <query> [--top-k n] [--project x]
  search <query> [--limit n] [--project x]
  forget <id>
  stats
  context [--max-chars n]
  setup hermes`);
}

if (import.meta.main) {
  main(process.argv).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
