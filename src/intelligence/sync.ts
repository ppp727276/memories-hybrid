import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CapricornStorage } from "../storage/index.ts";
import type { Memory } from "../types.ts";

export interface SyncResult {
  imported: number;
  exported: number;
  conflicts: number;
}

export class VaultSync {
  constructor(private storage: CapricornStorage) {}

  sync(): SyncResult {
    const imported = this.importFromVault();
    const exported = this.exportToVault();
    return { imported: imported.length, exported, conflicts: 0 };
  }

  private importFromVault(): Memory[] {
    const inbox = join(this.storage.vaultPath, "Brain", "inbox");
    const imported: Memory[] = [];
    try {
      for (const entry of readdirSync(inbox, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const path = join(inbox, entry.name);
        try {
          const content = readFileSync(path, "utf8");
          const memory = this.parseSignalFile(content);
          if (!memory) continue;
          const existing = this.storage.memory.getById(memory.id);
          if (!existing) {
            this.storage.memory.importMemory(memory);
            imported.push(memory);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // directory may not exist
    }
    return imported;
  }

  private exportToVault(): number {
    const unprocessed = this.storage.memory.getUnprocessedMemories(1000);
    let count = 0;
    for (const memory of unprocessed) {
      try {
        this.storage.vault.writeSignal(memory);
        count++;
      } catch {
        // ignore
      }
    }
    return count;
  }

  private parseSignalFile(content: string): Memory | null {
    const lines = content.split("\n");
    const frontmatter: Record<string, string> = {};
    let inFrontmatter = false;
    let body = "";
    let started = false;
    for (const line of lines) {
      if (line.trim() === "---" && !started) {
        inFrontmatter = !inFrontmatter;
        started = true;
        continue;
      }
      if (inFrontmatter) {
        const [key, ...rest] = line.split(":");
        if (key && rest.length > 0) frontmatter[key.trim()] = rest.join(":").trim();
      } else {
        body += line + "\n";
      }
    }
    if (!frontmatter.id) return null;
    return {
      id: frontmatter.id,
      content: body.trim(),
      source: frontmatter.source ?? "user",
      session_id: frontmatter.session_id ?? null,
      project: frontmatter.project ?? null,
      tags: frontmatter.tags ? frontmatter.tags.split(",").map((t) => t.trim()) : [],
      metadata: {},
      created_at: frontmatter.created_at ? new Date(frontmatter.created_at).getTime() : Date.now(),
      updated_at: Date.now(),
    };
  }
}
