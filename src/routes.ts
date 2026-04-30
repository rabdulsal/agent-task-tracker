import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { db, queries, type Task } from "./db.js";

const VALID_STATUSES   = ["pending", "in_progress", "done", "blocked"] as const;
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

function now(): string {
  return new Date().toISOString();
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {

  // ── Health ──────────────────────────────────────────────────────────────────

  app.get("/health", async () => ({ ok: true, ts: now() }));

  // ── List tasks ──────────────────────────────────────────────────────────────

  app.get<{ Querystring: { status?: string } }>("/tasks", async (req) => {
    const { status } = req.query;
    if (status) {
      if (!VALID_STATUSES.includes(status as any)) {
        throw app.httpErrors.badRequest(`Invalid status. Use: ${VALID_STATUSES.join(", ")}`);
      }
      return { tasks: queries.getByStatus.all(status) };
    }
    return { tasks: queries.getAll.all() };
  });

  // ── Get single task ─────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>("/tasks/:id", async (req) => {
    const task = queries.getById.get(req.params.id);
    if (!task) throw app.httpErrors.notFound("Task not found");
    return { task };
  });

  // ── Summary (agent-friendly snapshot) ──────────────────────────────────────

  app.get("/tasks/summary", async () => {
    const all = queries.getAll.all();
    return {
      total:       all.length,
      by_status: {
        pending:     all.filter(t => t.status === "pending").length,
        in_progress: all.filter(t => t.status === "in_progress").length,
        done:        all.filter(t => t.status === "done").length,
        blocked:     all.filter(t => t.status === "blocked").length,
      },
      action_needed: all.filter(t => t.action_needed && t.status !== "done").map(t => ({
        id: t.id, title: t.title, action_needed: t.action_needed, priority: t.priority,
      })),
    };
  });

  // ── Create task ─────────────────────────────────────────────────────────────

  app.post<{
    Body: {
      title:         string;
      status?:       string;
      priority?:     string;
      notes?:        string;
      action_needed?: string;
      agent_name?:   string;
    }
  }>("/tasks", async (req, reply) => {
    const { title, status = "pending", priority = "medium", notes, action_needed, agent_name } = req.body;

    if (!title?.trim()) throw app.httpErrors.badRequest("title is required");
    if (!VALID_STATUSES.includes(status as any))   throw app.httpErrors.badRequest(`Invalid status. Use: ${VALID_STATUSES.join(", ")}`);
    if (!VALID_PRIORITIES.includes(priority as any)) throw app.httpErrors.badRequest(`Invalid priority. Use: ${VALID_PRIORITIES.join(", ")}`);

    const task: Task = {
      id:            randomUUID(),
      title:         title.trim(),
      status:        status as Task["status"],
      priority:      priority as Task["priority"],
      notes:         notes ?? null,
      action_needed: action_needed ?? null,
      agent_name:    agent_name ?? null,
      created_at:    now(),
      updated_at:    now(),
      completed_at:  status === "done" ? now() : null,
    };

    queries.insert.run(task);
    reply.code(201);
    return { task };
  });

  // ── Update task ─────────────────────────────────────────────────────────────

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      title:         string;
      status:        string;
      priority:      string;
      notes:         string;
      action_needed: string;
      agent_name:    string;
    }>;
  }>("/tasks/:id", async (req) => {
    const existing = queries.getById.get(req.params.id);
    if (!existing) throw app.httpErrors.notFound("Task not found");

    const { title, status, priority, notes, action_needed, agent_name } = req.body;

    if (status && !VALID_STATUSES.includes(status as any))
      throw app.httpErrors.badRequest(`Invalid status. Use: ${VALID_STATUSES.join(", ")}`);
    if (priority && !VALID_PRIORITIES.includes(priority as any))
      throw app.httpErrors.badRequest(`Invalid priority. Use: ${VALID_PRIORITIES.join(", ")}`);

    const becomingDone = status === "done" && existing.status !== "done";
    const completed_at = becomingDone ? now()
                       : status && status !== "done" ? null
                       : existing.completed_at;

    queries.update.run({
      id:            req.params.id,
      title:         title?.trim()    ?? null,
      status:        status           ?? null,
      priority:      priority         ?? null,
      notes:         notes            ?? null,
      action_needed: action_needed    ?? null,
      agent_name:    agent_name       ?? null,
      updated_at:    now(),
      completed_at,
    });

    return { task: queries.getById.get(req.params.id) };
  });

  // ── Delete task ─────────────────────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const existing = queries.getById.get(req.params.id);
    if (!existing) throw app.httpErrors.notFound("Task not found");
    queries.delete.run(req.params.id);
    reply.code(204);
  });

  // ── Manual cleanup trigger ──────────────────────────────────────────────────

  app.post("/tasks/cleanup", async () => {
    const before = (db.prepare("SELECT COUNT(*) as n FROM tasks").get() as { n: number }).n;
    queries.cleanup.run();
    const after  = (db.prepare("SELECT COUNT(*) as n FROM tasks").get() as { n: number }).n;
    return { removed: before - after };
  });
}
