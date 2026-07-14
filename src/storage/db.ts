import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MIGRATIONS = [
  `-- core memory table
CREATE TABLE IF NOT EXISTS memories (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'user',
  session_id  TEXT,
  project     TEXT,
  tags        TEXT DEFAULT '[]',
  metadata    TEXT DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);`,
  `-- FTS5 index
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, tags,
  content='memories', content_rowid='rowid'
);`,
  `-- FTS5 sync triggers
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;`,
  `-- sessions
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  agent       TEXT,
  project     TEXT,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  metadata    TEXT DEFAULT '{}'
);`,
  `-- insights placeholder
CREATE TABLE IF NOT EXISTS insights (
  id          TEXT PRIMARY KEY,
  memory_id   TEXT NOT NULL REFERENCES memories(id),
  content     TEXT NOT NULL,
  layer       TEXT NOT NULL DEFAULT 'L1',
  metadata    TEXT DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  UNIQUE(memory_id, layer)
);`,
  `-- preferences placeholder
CREATE TABLE IF NOT EXISTS preferences (
  id          TEXT PRIMARY KEY,
  body        TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'trial',
  confidence  REAL NOT NULL DEFAULT 0.0,
  evidence    TEXT DEFAULT '[]',
  origin      TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);`,
  `-- preference evidence placeholder
CREATE TABLE IF NOT EXISTS preference_evidence (
  id          TEXT PRIMARY KEY,
  pref_id     TEXT NOT NULL REFERENCES preferences(id),
  memory_id   TEXT NOT NULL REFERENCES memories(id),
  result      TEXT NOT NULL,
  session_id  TEXT,
  created_at  INTEGER NOT NULL
);`,
  `-- personas placeholder
CREATE TABLE IF NOT EXISTS personas (
  id          TEXT PRIMARY KEY,
  profile     TEXT NOT NULL,
  content     TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);`,
  `-- indexes
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_insights_memory ON insights(memory_id);
CREATE INDEX IF NOT EXISTS idx_preferences_confidence ON preferences(confidence);
CREATE INDEX IF NOT EXISTS idx_pref_evidence_pref ON preference_evidence(pref_id);`,
];

export function openDatabase(dbPath: string): Database {
  mkdirSync(dirname(dbPath) || ".", { recursive: true });
  return new Database(dbPath, { create: true });
}

export function migrate(db: Database): void {
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }
}
