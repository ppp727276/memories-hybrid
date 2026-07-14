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

  remember(input: MemoryInput, embedding?: number[]): Memory {
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
    if (embedding && embedding.length > 0) {
      runSql(
        this.db,
        "INSERT INTO memories_vec (memory_id, embedding, created_at) VALUES (?, ?, ?)",
        memory.id,
        JSON.stringify(embedding),
        now,
      );
    }
    return memory;
  }

  recall(queryText: string, topK = 5, project: string | null = null): SearchResult[] {
    const rows = this.ftsSearch(queryText, topK, project);
    return rows.map((row) => rowToResult(row));
  }

  recallByVector(embedding: number[], topK = 5, project: string | null = null): SearchResult[] {
    const scored = this.allVectors(project)
      .map(({ row, embedding: emb }) => ({ row, score: cosineSimilarity(embedding, emb) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored.map(({ row, score }) => ({ ...rowToResult(row), score }));
  }

  recallHybrid(queryText: string, embedding: number[], topK = 5, project: string | null = null): SearchResult[] {
    const ftsRanked = this.ftsSearch(queryText, topK * 2, project).map((row, i) => ({ ...rowToResult(row), _rank: i, _source: "fts" as const }));
    const vecRanked = this.recallByVector(embedding, topK * 2, project).map((row, i) => ({ ...row, _rank: i, _source: "vector" as const }));
    const byId = new Map<string, SearchResult & { _rank: number; _source: "fts" | "vector" }>();
    for (const item of [...ftsRanked, ...vecRanked]) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    const scored = Array.from(byId.values()).map((item) => ({
      item,
      score: rrfScore(item._source, item._rank),
    }));
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ item, score }) => ({ ...item, score }));
  }

  search(queryText: string, limit = 10, project: string | null = null): SearchResult[] {
    const rows = this.ftsSearch(queryText, limit, project);
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

  private ftsSearch(queryText: string, limit: number, project: string | null): MemoryRow[] {
    const projectClause = project ? "AND m.project = ?" : "";
    const match = `"${quoteFts5(queryText)}"*`;
    const params = project ? [match, project, limit] : [match, limit];
    return queryAll<MemoryRow>(
      this.db,
      `SELECT m.id, m.content, m.source, m.project, m.tags, rank as rank, m.created_at
       FROM memories_fts ft
       JOIN memories m ON m.rowid = ft.rowid
       WHERE memories_fts MATCH ? ${projectClause}
       ORDER BY rank
       LIMIT ?`,
      ...params,
    );
  }

  private allVectors(project: string | null): { row: MemoryRow; embedding: number[] }[] {
    const projectClause = project ? "WHERE m.project = ?" : "";
    const params = project ? [project] : [];
    const rows = queryAll<MemoryRow & { embedding: string }>(
      this.db,
      `SELECT m.id, m.content, m.source, m.project, m.tags, 0 as rank, m.created_at, v.embedding as embedding
       FROM memories_vec v
       JOIN memories m ON m.id = v.memory_id
       ${projectClause}`,
      ...params,
    );
    return rows.map((r) => {
      const { embedding: _, ...row } = r;
      return { row, embedding: parseVector(r.embedding) };
    });
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

function parseVector(raw: string): number[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    a2 += a[i] * a[i];
    b2 += b[i] * b[i];
  }
  const denom = Math.sqrt(a2) * Math.sqrt(b2);
  return denom === 0 ? 0 : dot / denom;
}

function rrfScore(source: "fts" | "vector", rank: number, k = 60): number {
  const weight = source === "vector" ? 0.9 : 1.0;
  return weight * (1 / (k + rank + 1));
}
