import { statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, migrate } from "./db.ts";
import { MemoryStore } from "./memory.ts";
import { VaultWriter } from "./vault.ts";
import type { MemoryInput, SearchResult, StatsResult } from "../types.ts";
import { queryGet } from "../utils/sqlite.ts";

export { MemoryStore, VaultWriter };
export type { MemoryInput, SearchResult, StatsResult };

export class CapricornStorage {
  db: ReturnType<typeof openDatabase>;
  memory: MemoryStore;
  vault: VaultWriter;
  dbPath: string;
  vaultPath: string;

  constructor(dbPath: string, vaultPath: string) {
    this.dbPath = dbPath;
    this.vaultPath = vaultPath;
    this.db = openDatabase(dbPath);
    this.memory = new MemoryStore(this.db);
    this.vault = new VaultWriter(vaultPath);
    migrate(this.db);
  }

  remember(input: MemoryInput, writeVault = true) {
    const memory = this.memory.remember(input);
    let vaultPath: string | undefined;
    if (writeVault) {
      vaultPath = this.vault.writeSignal(memory);
    }
    return { memory, vaultPath };
  }

  recall(query: string, topK = 5, project: string | null = null) {
    return this.memory.recall(query, topK, project);
  }

  search(query: string, limit = 10, project: string | null = null) {
    return this.memory.search(query, limit, project);
  }

  forget(id: string) {
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
