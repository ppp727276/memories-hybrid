import { mkdirSync, writeFileSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Memory } from "../types.ts";
import { slugify } from "../utils/id.ts";

export class VaultWriter {
  constructor(private vaultPath: string) {}

  writeSignal(memory: Memory): string {
    const date = new Date(memory.created_at);
    const ts = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const slug = slugify(memory.content);
    const fileName = `sig-${ts}-${slug}.md`;
    const dir = join(this.vaultPath, "Brain", "inbox");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, fileName);
    const frontmatter = [
      "---",
      `id: ${memory.id}`,
      `source: ${memory.source}`,
      `session_id: ${memory.session_id ?? ""}`,
      `project: ${memory.project ?? ""}`,
      `tags: ${memory.tags.join(", ")}`,
      `created_at: ${date.toISOString()}`,
      "---",
      "",
      memory.content,
      "",
    ].join("\n");
    writeFileSync(path, frontmatter);
    return path;
  }

  deleteSignal(id: string): boolean {
    const dir = join(this.vaultPath, "Brain", "inbox");
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const path = join(dir, entry.name);
        try {
          const content = readFileSync(path, "utf8");
          if (content.startsWith(`---\nid: ${id}\n`) || content.includes(`\nid: ${id}\n`)) {
            rmSync(path);
            return true;
          }
        } catch {
          // ignore unreadable files
        }
      }
    } catch {
      // directory may not exist
    }
    return false;
  }
}
