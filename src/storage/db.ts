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
  memory_id   TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
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
  memory_id   TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
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
  {
    id: 5,
    name: "validation gate",
    sql: `-- Review queue for rejected enrichment outputs
CREATE TABLE IF NOT EXISTS review_queue (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL, -- insight, persona, preference
  content     TEXT NOT NULL,
  source      TEXT NOT NULL,
  score       REAL NOT NULL DEFAULT 0.0,
  warnings    TEXT DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_kind ON review_queue(kind);`,
  },
  {
    id: 6,
    name: "fk cascade fix",
    sql: `-- Recreate insights with ON DELETE CASCADE (SQLite doesn't support ALTER TABLE ADD CONSTRAINT)
CREATE TABLE IF NOT EXISTS insights_new (
  id          TEXT PRIMARY KEY,
  memory_id   TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  layer       TEXT NOT NULL DEFAULT 'L1',
  metadata    TEXT DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  UNIQUE(memory_id, layer)
);
INSERT OR IGNORE INTO insights_new SELECT * FROM insights;
DROP TABLE insights;
ALTER TABLE insights_new RENAME TO insights;
CREATE INDEX IF NOT EXISTS idx_insights_memory ON insights(memory_id);

-- Recreate preference_evidence with ON DELETE CASCADE
CREATE TABLE IF NOT EXISTS preference_evidence_new (
  id          TEXT PRIMARY KEY,
  pref_id     TEXT NOT NULL REFERENCES preferences(id),
  memory_id   TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  result      TEXT NOT NULL,
  session_id  TEXT,
  source_type TEXT DEFAULT 'user_explicit',
  source_weight REAL DEFAULT 1.0,
  created_at  INTEGER NOT NULL
);
INSERT OR IGNORE INTO preference_evidence_new SELECT * FROM preference_evidence;
DROP TABLE preference_evidence;
ALTER TABLE preference_evidence_new RENAME TO preference_evidence;
CREATE INDEX IF NOT EXISTS idx_pref_evidence_pref ON preference_evidence(pref_id);`,
  },
  {
    id: 7,
    name: "cron state persistence",
    sql: `CREATE TABLE IF NOT EXISTS cron_state (
  job_name TEXT PRIMARY KEY,
  last_run TEXT NOT NULL DEFAULT '',
  last_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`,
  },
  {
    id: 8,
    name: "vault sync state",
    sql: `CREATE TABLE IF NOT EXISTS vault_sync_state (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  vault_path TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'synced'
);

CREATE INDEX IF NOT EXISTS idx_vault_sync_state_status ON vault_sync_state(status);`,
  },
  {
    id: 9,
    name: "memory lifecycle",
    sql: `ALTER TABLE memories ADD COLUMN archived_at INTEGER;
ALTER TABLE memories ADD COLUMN ttl_days INTEGER;

CREATE TABLE IF NOT EXISTS memories_archive (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  project TEXT,
  tags TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  original_created_at INTEGER NOT NULL,
  archived_at INTEGER NOT NULL,
  archive_reason TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_memories_archive_created ON memories_archive(original_created_at);`,
  },
];

export function openDatabase(dbPath: string): Database {
  mkdirSync(dirname(dbPath) || ".", { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
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
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      runSql(db, "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", migration.id, migration.name, Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
