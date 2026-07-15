import { Database, type Changes } from "bun:sqlite";

export function runSql(db: Database, sql: string, ...params: unknown[]): Changes {
  return (db as unknown as { run(sql: string, ...params: unknown[]): Changes }).run(sql, ...params);
}

export function queryAll<T>(db: Database, sql: string, ...params: unknown[]): T[] {
  const stmt = (db as unknown as { query(sql: string): { all(...args: unknown[]): T[] } }).query(sql);
  return stmt.all(...params);
}

export function queryGet<T>(db: Database, sql: string, ...params: unknown[]): T | undefined {
  const stmt = (db as unknown as { query(sql: string): { get(...args: unknown[]): T | undefined } }).query(sql);
  return stmt.get(...params);
}
