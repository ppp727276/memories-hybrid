import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runSql, queryAll, queryGet } from "../utils/sqlite.ts";

interface Migration {
  id: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "core schema",
    sql: `-- core memory table
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
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, tags,
  content='memories', content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  agent       TEXT,
  project     TEXT,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  metadata    TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS insights (
  id          TEXT PRIMARY KEY,
  memory_id   TEXT NOT NULL REFERENCES memories(id),
  content     TEXT NOT NULL,
  layer       TEXT NOT NULL DEFAULT 'L1',
  metadata    TEXT DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  UNIQUE(memory_id, layer)
);

CREATE TABLE IF NOT EXISTS preferences (
  id          TEXT PRIMARY KEY,
  body        TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'trial',
  confidence  REAL NOT NULL DEFAULT 0.0,
  evidence    TEXT DEFAULT '[]',
  origin      TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS preference_evidence (
  id          TEXT PRIMARY KEY,
  pref_id     TEXT NOT NULL REFERENCES preferences(id),
  memory_id   TEXT NOT NULL REFERENCES memories(id),
  result      TEXT NOT NULL,
  session_id  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  id          TEXT PRIMARY KEY,
  profile     TEXT NOT NULL,
  content     TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_insights_memory ON insights(memory_id);
CREATE INDEX IF NOT EXISTS idx_preferences_confidence ON preferences(confidence);
CREATE INDEX IF NOT EXISTS idx_pref_evidence_pref ON preference_evidence(pref_id);

-- vector storage (Phase 2)
CREATE TABLE IF NOT EXISTS memories_vec (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_vec_id ON memories_vec(memory_id);`,
  },
  {
    id: 2,
    name: "phase 3 enrichment",
    sql: `-- enrichment state tracking
CREATE TABLE IF NOT EXISTS enrichment_state (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_enrichment_state_status ON enrichment_state(status);

ALTER TABLE preference_evidence ADD COLUMN source_type TEXT DEFAULT 'user_explicit';
ALTER TABLE preference_evidence ADD COLUMN source_weight REAL DEFAULT 1.0;`,
  },
  {
    id: 3,
    name: "phase 5 prompt ops",
    sql: `-- prompt optimization (Phase 5)
CREATE TABLE IF NOT EXISTS prompt_variants (
  id          TEXT PRIMARY KEY,
  task        TEXT NOT NULL,
  name        TEXT NOT NULL,
  template    TEXT NOT NULL,
  alpha       REAL NOT NULL DEFAULT 1.0,
  beta        REAL NOT NULL DEFAULT 1.0,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  score_sum   REAL NOT NULL DEFAULT 0.0,
  score_count INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_variants_task ON prompt_variants(task);

CREATE TABLE IF NOT EXISTS prompt_outcomes (
  id          TEXT PRIMARY KEY,
  variant_id  TEXT NOT NULL REFERENCES prompt_variants(id) ON DELETE CASCADE,
  task        TEXT NOT NULL,
  input       TEXT NOT NULL,
  output      TEXT NOT NULL,
  score       REAL NOT NULL,
  metadata    TEXT DEFAULT '{}',
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_outcomes_variant ON prompt_outcomes(variant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_outcomes_task ON prompt_outcomes(task);

CREATE TABLE IF NOT EXISTS eval_cases (
  id          TEXT PRIMARY KEY,
  task        TEXT NOT NULL,
  input       TEXT NOT NULL,
  expected    TEXT,
  source      TEXT,
  metadata    TEXT DEFAULT '{}',
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_task ON eval_cases(task);`,
  },
  {
    id: 4,
    name: "phase 6 osb bridge",
    sql: `-- OSB bridge checkpoint / idempotency (Phase 6)
CREATE TABLE IF NOT EXISTS osb_signal_checkpoints (
  id           TEXT PRIMARY KEY,
  file_path    TEXT NOT NULL,
  md5          TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'processed',
  processed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_osb_signal_checkpoints_path ON osb_signal_checkpoints(file_path);
CREATE INDEX IF NOT EXISTS idx_osb_signal_checkpoints_status ON osb_signal_checkpoints(status);`,
  },
];

export function openDatabase(dbPath: string): Database {
  mkdirSync(dirname(dbPath) || ".", { recursive: true });
  return new Database(dbPath, { create: true });
}

export function migrate(db: Database): void {
  runSql(
    db,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );`,
  );

  const appliedRows = queryAll<{ version: number }>(db, "SELECT version FROM schema_migrations ORDER BY version");
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.exec(migration.sql);
    runSql(db, "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", migration.id, migration.name, Date.now());
  }
}
