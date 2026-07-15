import type { Memory } from "../types.ts";
import YAML from "yaml";

export function parseSignalFile(content: string): Memory | null {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return null;

  let frontmatter: Record<string, unknown>;
  try {
    const parsed = YAML.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    frontmatter = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof frontmatter.id !== "string" || !frontmatter.id.trim()) return null;
  const created = typeof frontmatter.created_at === "string" || typeof frontmatter.created_at === "number"
    ? new Date(frontmatter.created_at).getTime()
    : Date.now();
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.map(String)
    : typeof frontmatter.tags === "string"
      ? frontmatter.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      : [];

  return {
    id: frontmatter.id,
    content: match[2].trim(),
    source: typeof frontmatter.source === "string" ? frontmatter.source : "user",
    session_id: typeof frontmatter.session_id === "string" && frontmatter.session_id ? frontmatter.session_id : null,
    project: typeof frontmatter.project === "string" && frontmatter.project ? frontmatter.project : null,
    tags,
    metadata: {},
    created_at: Number.isNaN(created) ? Date.now() : created,
    updated_at: Date.now(),
  };
}
