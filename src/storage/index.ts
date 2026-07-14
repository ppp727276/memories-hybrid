import { statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, migrate } from "./db.ts";
import { MemoryStore } from "./memory.ts";
import { VaultWriter } from "./vault.ts";
import type { MemoryInput, SearchResult } from "../types.ts";
import { createEmbedder, type Embedder } from "../embeddings.ts";
import type { CapricornConfig } from "../types.ts";
import { PromptOptimizer } from "../intelligence/prompt-ops.ts";

export { MemoryStore, VaultWriter };
export type { MemoryInput, SearchResult };

export class CapricornStorage {
  db: ReturnType<typeof openDatabase>;
  memory: MemoryStore;
  vault: VaultWriter;
  embedder: Embedder;
  promptOps: PromptOptimizer;
  dbPath: string;
  vaultPath: string;

  constructor(dbPath: string, vaultPath: string, config?: CapricornConfig) {
    this.dbPath = dbPath;
    this.vaultPath = vaultPath;
    this.db = openDatabase(dbPath);
    this.memory = new MemoryStore(this.db);
    this.vault = new VaultWriter(vaultPath);
    this.promptOps = new PromptOptimizer(this.db);
    this.embedder = config ? createEmbedder(config) : { enabled: () => false, embed: () => { throw new Error("no config"); }, dimensions: () => 0 };
    migrate(this.db);
  }

  async remember(input: MemoryInput, writeVault = true) {
    let embedding: number[] | undefined;
    if (this.embedder.enabled()) {
      try {
        embedding = await this.embedder.embed(input.content);
      } catch {
        // fall back to FTS5-only storage
      }
    }
    const memory = this.memory.remember(input, embedding);
    let vaultPath: string | undefined;
    if (writeVault) {
      vaultPath = this.vault.writeSignal(memory);
    }
    return { memory, vaultPath };
  }

  async recall(query: string, topK = 5, project: string | null = null) {
    if (this.embedder.enabled()) {
      try {
        const embedding = await this.embedder.embed(query);
        return this.memory.recallHybrid(query, embedding, topK, project);
      } catch {
        // fall back to FTS5
      }
    }
    return this.memory.recall(query, topK, project);
  }

  search(query: string, limit = 10, project: string | null = null) {
    return this.memory.search(query, limit, project);
  }

  async forget(id: string) {
    const ok = this.memory.forget(id);
    if (ok) {
      this.vault.deleteSignal(id);
    }
    return ok;
  }

  stats() {
    const base = this.memory.stats();
    return {
      ...base,
      db_size: fileSize(this.dbPath),
      vault_size: dirSize(this.vaultPath),
    };
  }

  close() {
    this.db.close();
  }
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function dirSize(path: string): number {
  try {
    let total = 0;
    const walk = (p: string) => {
      for (const entry of readdirSync(p, { withFileTypes: true })) {
        const child = join(p, entry.name);
        if (entry.isDirectory()) {
          walk(child);
        } else if (entry.isFile()) {
          total += statSync(child).size;
        }
      }
    };
    walk(path);
    return total;
  } catch {
    return 0;
  }
}
