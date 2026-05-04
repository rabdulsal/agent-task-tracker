import Database from "better-sqlite3";
import path from "path";
import { mkdirSync } from "fs";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "tasks.db");
mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','in_progress','done','blocked')),
    priority      TEXT NOT NULL DEFAULT 'medium'
                    CHECK(priority IN ('low','medium','high','urgent')),
    notes         TEXT,
    action_needed TEXT,
    agent_name    TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    completed_at  TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    supabase_uid TEXT UNIQUE NOT NULL,
    email        TEXT UNIQUE NOT NULL,
    api_key      TEXT UNIQUE NOT NULL,
    relay_token  TEXT UNIQUE,
    agent_name   TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );
`);

// Idempotent migration: add relay_token column for existing DBs
// SQLite does not allow UNIQUE on ALTER TABLE ADD COLUMN — add column then index separately
try {
  db.exec(`ALTER TABLE users ADD COLUMN relay_token TEXT`);
  console.log("[db] migrated: added relay_token to users");
} catch {}
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_relay_token ON users(relay_token) WHERE relay_token IS NOT NULL`);
} catch {}

// Idempotent migration: scope tasks by user
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE`);
  console.log("[db] migrated: added user_id to tasks");
} catch {}

export interface Task {
  id:            string;
  title:         string;
  status:        "pending" | "in_progress" | "done" | "blocked";
  priority:      "low" | "medium" | "high" | "urgent";
  notes:         string | null;
  action_needed: string | null;
  agent_name:    string | null;
  user_id:       string | null;
  created_at:    string;
  updated_at:    string;
  completed_at:  string | null;
}

export interface User {
  id:           string;
  supabase_uid: string;
  email:        string;
  api_key:      string;
  relay_token:  string | null;
  agent_name:   string;
  created_at:   string;
}

// userId = null → admin mode (no filter, sees all tasks)
const SCOPE = `(@userId IS NULL OR user_id = @userId)`;

const ORDER = `ORDER BY
  CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
  created_at DESC`;

export const queries = {
  // ── Tasks ────────────────────────────────────────────────────────────────────

  getAll: db.prepare<{ userId: string | null }, Task>(
    `SELECT * FROM tasks WHERE ${SCOPE} ${ORDER}`
  ),

  getByStatus: db.prepare<{ status: string; userId: string | null }, Task>(
    `SELECT * FROM tasks WHERE status = @status AND ${SCOPE} ${ORDER}`
  ),

  getById: db.prepare<{ id: string; userId: string | null }, Task>(
    `SELECT * FROM tasks WHERE id = @id AND ${SCOPE}`
  ),

  count: db.prepare<{ userId: string | null }, { n: number }>(
    `SELECT COUNT(*) as n FROM tasks WHERE ${SCOPE}`
  ),

  insert: db.prepare<[Task], void>(
    `INSERT INTO tasks
       (id,title,status,priority,notes,action_needed,agent_name,user_id,created_at,updated_at,completed_at)
     VALUES
       (@id,@title,@status,@priority,@notes,@action_needed,@agent_name,@user_id,@created_at,@updated_at,@completed_at)`
  ),

  update: db.prepare<[Partial<Task> & { id: string; userId: string | null }], void>(
    `UPDATE tasks SET
       title         = COALESCE(@title,         title),
       status        = COALESCE(@status,        status),
       priority      = COALESCE(@priority,      priority),
       notes         = COALESCE(@notes,         notes),
       action_needed = COALESCE(@action_needed, action_needed),
       agent_name    = COALESCE(@agent_name,    agent_name),
       updated_at    = @updated_at,
       completed_at  = @completed_at
     WHERE id = @id AND ${SCOPE}`
  ),

  delete: db.prepare<{ id: string; userId: string | null }, void>(
    `DELETE FROM tasks WHERE id = @id AND ${SCOPE}`
  ),

  cleanup: db.prepare<{ userId: string | null }, void>(
    `DELETE FROM tasks
     WHERE status = 'done'
       AND completed_at IS NOT NULL
       AND datetime(completed_at) < datetime('now', '-1 day')
       AND ${SCOPE}`
  ),

  // ── Users ────────────────────────────────────────────────────────────────────

  getUserByApiKey: db.prepare<[string], User>(
    `SELECT * FROM users WHERE api_key = ?`
  ),

  getUserBySupabaseUid: db.prepare<[string], User>(
    `SELECT * FROM users WHERE supabase_uid = ?`
  ),

  getUserByRelayToken: db.prepare<[string], User>(
    `SELECT * FROM users WHERE relay_token = ?`
  ),

  insertUser: db.prepare<[User], void>(
    `INSERT INTO users (id, supabase_uid, email, api_key, relay_token, agent_name, created_at)
     VALUES (@id, @supabase_uid, @email, @api_key, @relay_token, @agent_name, @created_at)`
  ),
};
