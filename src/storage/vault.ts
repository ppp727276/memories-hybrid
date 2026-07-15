import { mkdirSync, writeFileSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Memory } from "../types.ts";
import { slugify } from "../utils/id.ts";
import YAML from "yaml";

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
    const metadata = YAML.stringify({ id: memory.id, source: memory.source, session_id: memory.session_id, project: memory.project, tags: memory.tags, created_at: date.toISOString() }).trimEnd();
    const frontmatter = ["---", metadata, "---", "", memory.content, ""].join("\n");
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
        } catch (err) {
          console.error("capricorn: vault signal read failed:", String(err));
        }
      }
    } catch (err) {
      console.error("capricorn: vault inbox read failed:", String(err));
    }
    return false;
  }
}
