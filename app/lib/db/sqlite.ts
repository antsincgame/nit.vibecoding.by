import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

let db: Database.Database | null = null;

const DB_DIR = join(process.cwd(), "data");
const DB_PATH = join(DB_DIR, "nit.db");

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'react',
      agent_id TEXT NOT NULL DEFAULT '',
      model_used TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      code TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL DEFAULT 0.3,
      version_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      model TEXT,
      agent_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_versions_project_id ON versions(project_id);
    CREATE INDEX IF NOT EXISTS idx_versions_number ON versions(project_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id, timestamp ASC);
  `);
}

export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH, { fileMustExist: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);

  return db;
}

export function generateId(): string {
  return crypto.randomUUID();
}
