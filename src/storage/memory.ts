import type { Database } from "bun:sqlite";
import type { Memory, MemoryInput, SearchResult, StatsResult } from "../types.ts";
import { generateId } from "../utils/id.ts";
import { runSql, queryAll, queryGet } from "../utils/sqlite.ts";

interface MemoryRow {
  id: string;
  content: string;
  source: string;
  project: string | null;
  tags: string;
  rank: number;
  created_at: number;
}

export class MemoryStore {
  constructor(private db: Database) {}

  remember(input: MemoryInput): Memory {
    if (!input.content || input.content.trim().length === 0) throw new Error("content required");
    const now = Date.now();
    const id = generateId("mem");
    const memory: Memory = {
      id,
      content: input.content,
      source: input.source ?? "user",
      session_id: input.session_id ?? null,
      project: input.project ?? null,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    runSql(
      this.db,
      `INSERT INTO memories (id, content, source, session_id, project, tags, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      memory.id,
      memory.content,
      memory.source,
      memory.session_id,
      memory.project,
      JSON.stringify(memory.tags),
      JSON.stringify(memory.metadata),
      memory.created_at,
      memory.updated_at,
    );
    return memory;
  }

  recall(queryText: string, topK = 5, project: string | null = null): SearchResult[] {
    const projectClause = project ? "AND m.project = ?" : "";
    const match = `"${quoteFts5(queryText)}"*`;
    const params = project ? [match, project, topK] : [match, topK];
    const rows = queryAll<MemoryRow>(
      this.db,
      `SELECT m.id, m.content, m.source, m.project, m.tags, rank as rank, m.created_at
       FROM memories_fts ft
       JOIN memories m ON m.rowid = ft.rowid
       WHERE memories_fts MATCH ? ${projectClause}
       ORDER BY rank
       LIMIT ?`,
      ...params,
    );
    return rows.map((row) => rowToResult(row));
  }

  search(queryText: string, limit = 10, project: string | null = null): SearchResult[] {
    const projectClause = project ? "AND m.project = ?" : "";
    const match = `"${quoteFts5(queryText)}"`;
    const params = project ? [match, project, limit] : [match, limit];
    const rows = queryAll<MemoryRow>(
      this.db,
      `SELECT m.id, m.content, m.source, m.project, m.tags, rank as rank, m.created_at
       FROM memories_fts ft
       JOIN memories m ON m.rowid = ft.rowid
       WHERE memories_fts MATCH ? ${projectClause}
       ORDER BY rank
       LIMIT ?`,
      ...params,
    );
    return rows.map((row) => rowToResult(row));
  }

  forget(id: string): boolean {
    const result = runSql(this.db, "DELETE FROM memories WHERE id = ?", id);
    return result.changes > 0;
  }

  stats(): StatsResult {
    const total_memories = queryGet<{ c: number }>(this.db, "SELECT COUNT(*) as c FROM memories")?.c ?? 0;
    const total_insights = queryGet<{ c: number }>(this.db, "SELECT COUNT(*) as c FROM insights")?.c ?? 0;
    const preferences_count = queryGet<{ c: number }>(this.db, "SELECT COUNT(*) as c FROM preferences")?.c ?? 0;
    return {
      total_memories,
      total_insights,
      preferences_count,
      db_size: 0,
      vault_size: 0,
    };
  }

  getById(id: string): Memory | null {
    const row = queryGet<Omit<Memory, "tags" | "metadata"> & { tags: string; metadata: string }>(
      this.db,
      "SELECT * FROM memories WHERE id = ?",
      id,
    );
    if (!row) return null;
    return { ...row, tags: parseTags(row.tags), metadata: JSON.parse(row.metadata) } as Memory;
  }
}

function rowToResult(row: MemoryRow): SearchResult {
  return {
    id: row.id,
    content: row.content,
    source: row.source,
    project: row.project,
    tags: parseTags(row.tags),
    score: 1 / (1 + Math.abs(row.rank)),
    created_at: row.created_at,
  };
}

function quoteFts5(q: string): string {
  return q.replace(/"/g, '""').trim();
}

function parseTags(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
