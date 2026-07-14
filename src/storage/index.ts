import { openDatabase, migrate } from "./db.ts";
import { MemoryStore } from "./memory.ts";
import { VaultWriter } from "./vault.ts";
import type { MemoryInput, SearchResult, StatsResult } from "../types.ts";

export { MemoryStore, VaultWriter };
export type { MemoryInput, SearchResult, StatsResult };

export class CapricornStorage {
  db: ReturnType<typeof openDatabase>;
  memory: MemoryStore;
  vault: VaultWriter;

  constructor(dbPath: string, vaultPath: string) {
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
    return this.memory.forget(id);
  }

  stats() {
    return this.memory.stats();
  }

  close() {
    this.db.close();
  }
}
