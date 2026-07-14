import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Memory } from "../types.ts";
import { slugify } from "../utils/ulid.ts";

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
}
