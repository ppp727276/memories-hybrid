import type { Memory } from "../types.ts";

export function parseSignalFile(content: string): Memory | null {
  const lines = content.split("\n");
  const frontmatter: Record<string, string> = {};
  let inFrontmatter = false;
  let started = false;
  let body = "";
  for (const line of lines) {
    const isDelimiter = line.trim() === "---";
    if (isDelimiter && !started) {
      inFrontmatter = true;
      started = true;
      continue;
    }
    if (isDelimiter && started && inFrontmatter) {
      inFrontmatter = false;
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
    created_at: frontmatter.created_at ? (() => { const ts = new Date(frontmatter.created_at).getTime(); return Number.isNaN(ts) ? Date.now() : ts; })() : Date.now(),
    updated_at: Date.now(),
  };
}