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
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending','in_progress','done','blocked')),
    priority     TEXT NOT NULL DEFAULT 'medium'
                   CHECK(priority IN ('low','medium','high','urgent')),
    notes        TEXT,
    action_needed TEXT,
    agent_name   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    completed_at TEXT
  );
`);

export interface Task {
  id:            string;
  title:         string;
  status:        "pending" | "in_progress" | "done" | "blocked";
  priority:      "low" | "medium" | "high" | "urgent";
  notes:         string | null;
  action_needed: string | null;
  agent_name:    string | null;
  created_at:    string;
  updated_at:    string;
  completed_at:  string | null;
}

export const queries = {
  getAll: db.prepare<[], Task>(
    `SELECT * FROM tasks ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC`
  ),

  getByStatus: db.prepare<[string], Task>(
    `SELECT * FROM tasks WHERE status = ? ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC`
  ),

  getById: db.prepare<[string], Task>(
    `SELECT * FROM tasks WHERE id = ?`
  ),

  insert: db.prepare<[Task], void>(
    `INSERT INTO tasks (id,title,status,priority,notes,action_needed,agent_name,created_at,updated_at,completed_at)
     VALUES (@id,@title,@status,@priority,@notes,@action_needed,@agent_name,@created_at,@updated_at,@completed_at)`
  ),

  update: db.prepare<[Partial<Task> & { id: string }], void>(
    `UPDATE tasks SET
       title         = COALESCE(@title,         title),
       status        = COALESCE(@status,        status),
       priority      = COALESCE(@priority,      priority),
       notes         = COALESCE(@notes,         notes),
       action_needed = COALESCE(@action_needed, action_needed),
       agent_name    = COALESCE(@agent_name,    agent_name),
       updated_at    = @updated_at,
       completed_at  = @completed_at
     WHERE id = @id`
  ),

  delete: db.prepare<[string], void>(
    `DELETE FROM tasks WHERE id = ?`
  ),

  // Remove done tasks completed more than 1 day ago
  cleanup: db.prepare<[], void>(
    `DELETE FROM tasks
     WHERE status = 'done'
       AND completed_at IS NOT NULL
       AND datetime(completed_at) < datetime('now', '-1 day')`
  ),
};
