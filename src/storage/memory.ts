import type { Database } from "bun:sqlite";
import type { Memory, MemoryInput, SearchResult, StatsResult } from "../types.ts";
import { generateId } from "../utils/ulid.ts";

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
    const db = this.db as unknown as { run(sql: string, ...params: unknown[]): { changes: number } };
    db.run(
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
    const params = project ? [`${escapeQuery(queryText)}*`, project, topK] : [`${escapeQuery(queryText)}*`, topK];
    const rows = this.runSelect(
      `SELECT m.id, m.content, m.source, m.project, m.tags, rank as rank, m.created_at
       FROM memories_fts ft
       JOIN memories m ON m.rowid = ft.rowid
       WHERE memories_fts MATCH ? ${projectClause}
       ORDER BY rank
       LIMIT ?`,
      ...params,
    ) as MemoryRow[];
    return rows.map((row) => rowToResult(row));
  }

  search(queryText: string, limit = 10, project: string | null = null): SearchResult[] {
    const projectClause = project ? "AND m.project = ?" : "";
    const params = project ? [escapeQuery(queryText), project, limit] : [escapeQuery(queryText), limit];
    const rows = this.runSelect(
      `SELECT m.id, m.content, m.source, m.project, m.tags, rank as rank, m.created_at
       FROM memories_fts ft
       JOIN memories m ON m.rowid = ft.rowid
       WHERE memories_fts MATCH ? ${projectClause}
       ORDER BY rank
       LIMIT ?`,
      ...params,
    ) as MemoryRow[];
    return rows.map((row) => rowToResult(row));
  }

  forget(id: string): boolean {
    const db = this.db as unknown as { run(sql: string, ...params: unknown[]): { changes: number } };
    const result = db.run("DELETE FROM memories WHERE id = ?", id);
    return result.changes > 0;
  }

  stats(): StatsResult {
    const total_memories = this.getScalar("SELECT COUNT(*) as c FROM memories");
    const total_insights = this.getScalar("SELECT COUNT(*) as c FROM insights");
    const preferences_count = this.getScalar("SELECT COUNT(*) as c FROM preferences");
    return {
      total_memories: total_memories.c,
      total_insights: total_insights.c,
      preferences_count: preferences_count.c,
      db_size: 0,
      vault_size: 0,
    };
  }

  getById(id: string): Memory | null {
    const rows = this.runSelect("SELECT * FROM memories WHERE id = ?", id) as Array<
      Omit<Memory, "tags" | "metadata"> & { tags: string; metadata: string }
    >;
    const row = rows[0];
    if (!row) return null;
    return { ...row, tags: parseTags(row.tags), metadata: JSON.parse(row.metadata) } as Memory;
  }

  private runSelect(sql: string, ...params: unknown[]): unknown[] {
    const stmt = (this.db as unknown as { query(sql: string): { all(...args: unknown[]): unknown[] } }).query(sql);
    return stmt.all(...params);
  }

  private getScalar(sql: string): { c: number } {
    const stmt = (this.db as unknown as { query(sql: string): { get(...args: unknown[]): unknown } }).query(sql);
    return stmt.get() as { c: number };
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

function escapeQuery(q: string): string {
  return q.replace(/"/g, '""').trim();
}

function parseTags(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
