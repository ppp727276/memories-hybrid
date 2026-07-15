import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CapricornStorage } from "./index.ts";
import type { Memory } from "../types.ts";
import { parseSignalFile } from "../utils/signal.ts";

export interface SyncResult {
  imported: number;
  exported: number;
  conflicts: number;
}

export class VaultSync {
  constructor(private storage: CapricornStorage) {}

  sync(): SyncResult {
    const { imported, conflicts } = this.importFromVault();
    const exported = this.exportToVault();
    return { imported: imported.length, exported, conflicts };
  }

  private importFromVault(): { imported: Memory[]; conflicts: number } {
    const inbox = join(this.storage.vaultPath, "Brain", "inbox");
    const imported: Memory[] = [];
    let conflicts = 0;
    try {
      for (const entry of readdirSync(inbox, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const path = join(inbox, entry.name);
        try {
          const content = readFileSync(path, "utf8");
          const memory = parseSignalFile(content);
          if (!memory) continue;
          const existing = this.storage.memory.getById(memory.id);
          if (!existing) {
            this.storage.memory.importMemory(memory);
            imported.push(memory);
          } else if (existing.content !== memory.content || existing.source !== memory.source || existing.project !== memory.project || existing.tags.join(",") !== memory.tags.join(",")) {
            conflicts++;
            console.warn(`capricorn: vault sync conflict for ${memory.id}; DB preserved`);
          }
        } catch (err) {
          console.error("capricorn: sync signal parse failed:", String(err));
        }
      }
    } catch (err) {
      console.error("capricorn: sync inbox read failed:", String(err));
    }
    return { imported, conflicts };
  }

  private exportToVault(): number {
    const unsynced = this.storage.memory.getUnsyncedMemories(1000);
    let count = 0;
    for (const memory of unsynced) {
      try {
        const path = this.storage.vault.writeSignal(memory);
        this.storage.memory.markVaultSynced(memory.id, path);
        count++;
      } catch (err) {
        console.error("capricorn: sync vault write failed:", String(err));
      }
    }
    return count;
  }
}
