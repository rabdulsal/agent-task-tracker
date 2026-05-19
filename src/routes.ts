import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { db, queries, type Task } from "./db.js";
import { sendReport } from "./mailer.js";

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
    const userId = req.userId ?? null;

    if (status) {
      if (!VALID_STATUSES.includes(status as any))
        throw app.httpErrors.badRequest(`Invalid status. Use: ${VALID_STATUSES.join(", ")}`);
      return { tasks: queries.getByStatus.all({ status, userId }) };
    }
    return { tasks: queries.getAll.all({ userId }) };
  });

  // ── Get single task ─────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>("/tasks/:id", async (req) => {
    const task = queries.getById.get({ id: req.params.id, userId: req.userId ?? null });
    if (!task) throw app.httpErrors.notFound("Task not found");
    return { task };
  });

  // ── Summary (agent-friendly snapshot) ──────────────────────────────────────

  app.get("/tasks/summary", async (req) => {
    const userId = req.userId ?? null;
    const all = queries.getAll.all({ userId });
    return {
      total:       all.length,
      by_status: {
        pending:     all.filter(t => t.status === "pending").length,
        in_progress: all.filter(t => t.status === "in_progress").length,
        done:        all.filter(t => t.status === "done").length,
        blocked:     all.filter(t => t.status === "blocked").length,
      },
      action_needed: all
        .filter(t => t.action_needed && t.status !== "done")
        .map(t => ({
          id: t.id, title: t.title, action_needed: t.action_needed, priority: t.priority,
          ...(t.code_refs ? { code_refs: JSON.parse(t.code_refs) } : {}),
          ...(t.git_branch ? { git_branch: t.git_branch, git_commit: t.git_commit } : {}),
        })),
    };
  });

  // ── Create task ─────────────────────────────────────────────────────────────

  app.post<{
    Body: {
      title:           string;
      status?:         string;
      priority?:       string;
      notes?:          string;
      action_needed?:  string;
      agent_name?:     string;
      agent_platform?: string;
      code_refs?:      Array<{ path: string; lines?: string; label?: string }>;
      links?:          Array<{ url: string; label: string }>;
      git_branch?:     string;
      git_commit?:     string;
      git_repo?:       string;
      evidence?:       string;
    };
  }>("/tasks", async (req, reply) => {
    const {
      title, status = "pending", priority = "medium",
      notes, action_needed, agent_name, agent_platform,
      code_refs, links, git_branch, git_commit, git_repo, evidence,
    } = req.body;

    if (!title?.trim())
      throw app.httpErrors.badRequest("title is required");
    if (!VALID_STATUSES.includes(status as any))
      throw app.httpErrors.badRequest(`Invalid status. Use: ${VALID_STATUSES.join(", ")}`);
    if (!VALID_PRIORITIES.includes(priority as any))
      throw app.httpErrors.badRequest(`Invalid priority. Use: ${VALID_PRIORITIES.join(", ")}`);

    const task: Task = {
      id:             randomUUID(),
      title:          title.trim(),
      status:         status as Task["status"],
      priority:       priority as Task["priority"],
      notes:          notes           ?? null,
      action_needed:  action_needed   ?? null,
      agent_name:     agent_name      ?? null,
      agent_platform: agent_platform  ?? null,
      user_id:        req.userId      ?? null,
      code_refs:      code_refs  ? JSON.stringify(code_refs)  : null,
      links:          links      ? JSON.stringify(links)      : null,
      git_branch:     git_branch ?? null,
      git_commit:     git_commit ?? null,
      git_repo:       git_repo   ?? null,
      evidence:       evidence   ?? null,
      created_at:     now(),
      updated_at:     now(),
      completed_at:   status === "done" ? now() : null,
    };

    queries.insert.run(task);
    reply.code(201);
    return { task };
  });

  // ── Update task ─────────────────────────────────────────────────────────────

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      title:           string;
      status:          string;
      priority:        string;
      notes:           string;
      action_needed:   string;
      agent_name:      string;
      agent_platform:  string;
      code_refs:       Array<{ path: string; lines?: string; label?: string }>;
      links:           Array<{ url: string; label: string }>;
      git_branch:      string;
      git_commit:      string;
      git_repo:        string;
      evidence:        string;
    }>;
  }>("/tasks/:id", async (req) => {
    const userId = req.userId ?? null;
    const existing = queries.getById.get({ id: req.params.id, userId });
    if (!existing) throw app.httpErrors.notFound("Task not found");

    const {
      title, status, priority, notes, action_needed, agent_name, agent_platform,
      code_refs, links, git_branch, git_commit, git_repo, evidence,
    } = req.body;

    if (status && !VALID_STATUSES.includes(status as any))
      throw app.httpErrors.badRequest(`Invalid status. Use: ${VALID_STATUSES.join(", ")}`);
    if (priority && !VALID_PRIORITIES.includes(priority as any))
      throw app.httpErrors.badRequest(`Invalid priority. Use: ${VALID_PRIORITIES.join(", ")}`);

    const becomingDone = status === "done" && existing.status !== "done";
    const completed_at = becomingDone               ? now()
                       : status && status !== "done" ? null
                       : existing.completed_at;

    queries.update.run({
      id:             req.params.id,
      title:          title?.trim()    ?? undefined,
      status:         (status         ?? undefined) as Task["status"] | undefined,
      priority:       (priority       ?? undefined) as Task["priority"] | undefined,
      notes:          notes            ?? undefined,
      action_needed:  action_needed    ?? undefined,
      agent_name:     agent_name       ?? undefined,
      agent_platform: agent_platform   ?? undefined,
      code_refs:      code_refs  ? JSON.stringify(code_refs)  : undefined,
      links:          links      ? JSON.stringify(links)      : undefined,
      git_branch:     git_branch ?? undefined,
      git_commit:     git_commit ?? undefined,
      git_repo:       git_repo   ?? undefined,
      evidence:       evidence   ?? undefined,
      user_id:        userId,
      updated_at:     now(),
      completed_at,
      userId,
    } as any);

    return { task: queries.getById.get({ id: req.params.id, userId }) };
  });

  // ── Delete task ─────────────────────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const userId = req.userId ?? null;
    const existing = queries.getById.get({ id: req.params.id, userId });
    if (!existing) throw app.httpErrors.notFound("Task not found");
    queries.delete.run({ id: req.params.id, userId });
    reply.code(204);
  });

  // ── Manual cleanup ──────────────────────────────────────────────────────────

  app.post("/tasks/cleanup", async (req) => {
    const userId = req.userId ?? null;
    const before = (queries.count.get({ userId }) as { n: number }).n;
    queries.cleanup.run({ userId });
    const after = (queries.count.get({ userId }) as { n: number }).n;
    return { removed: before - after };
  });

  // ── Manual report trigger ───────────────────────────────────────────────────

  app.post<{ Querystring: { period?: string } }>("/tasks/report", async (req) => {
    const period = req.query.period === "evening" ? "evening" : "morning";
    await sendReport(queries.getAll.all({ userId: req.userId ?? null }), period);
    return { sent: true, period };
  });
}
