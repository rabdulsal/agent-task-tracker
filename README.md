# Agent Task Tracker

A lightweight, self-hosted task tracker with a REST API designed for AI agents. Sends twice-daily email reports and automatically removes completed tasks after 24 hours.

## Features

- **REST API** — any agent or app can create, read, update, and delete tasks
- **API key auth** — single `x-api-key` header, no OAuth complexity
- **Twice-daily email reports** — 8AM and 6PM Eastern via Resend
- **Auto-cleanup** — done tasks older than 24h are removed at midnight
- **Human action flags** — `action_needed` field surfaces tasks requiring manual intervention at the top of every report
- **SQLite** — zero external database dependency, single file

## Quick Start

```bash
git clone https://github.com/your-org/agent-task-tracker
cd agent-task-tracker
npm install
cp .env.example .env   # fill in your keys
npm run dev
```

## Environment Variables

| Variable        | Required | Description |
|-----------------|----------|-------------|
| `API_KEY`       | Yes      | Agents send this in the `x-api-key` header |
| `RESEND_API_KEY`| Yes      | Resend API key for email reports |
| `ALERT_EMAIL`   | Yes      | Email address to receive daily reports |
| `FROM_EMAIL`    | No       | Sender address (default: `tasks@webslingerai.com`) |
| `API_BASE_URL`  | No       | Your deployed URL (shown in email footer) |
| `DB_PATH`       | No       | SQLite file path (default: `./data/tasks.db`) |
| `PORT`          | No       | Server port (default: `3000`) |

## API Reference

All endpoints (except `GET /health`) require the header:
```
x-api-key: your-secret-key
```

---

### `GET /health`
Returns server status. No auth required.

```json
{ "ok": true, "ts": "2026-04-30T12:00:00.000Z" }
```

---

### `GET /tasks`
List all tasks, ordered by priority then created date.

**Query params:** `?status=pending|in_progress|done|blocked`

```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "Fix auth bug",
      "status": "in_progress",
      "priority": "high",
      "notes": "Happening on login route",
      "action_needed": null,
      "agent_name": "backend-agent",
      "created_at": "2026-04-30T10:00:00.000Z",
      "updated_at": "2026-04-30T11:00:00.000Z",
      "completed_at": null
    }
  ]
}
```

---

### `GET /tasks/summary`
Agent-friendly snapshot — counts by status plus any tasks needing human action.

```json
{
  "total": 5,
  "by_status": { "pending": 2, "in_progress": 2, "done": 1, "blocked": 0 },
  "action_needed": [
    { "id": "uuid", "title": "Deploy to prod", "action_needed": "Needs manual approval", "priority": "urgent" }
  ]
}
```

---

### `GET /tasks/:id`
Get a single task by ID.

---

### `POST /tasks`
Create a task.

**Body:**
```json
{
  "title":          "Deploy staging build",
  "status":         "pending",
  "priority":       "high",
  "notes":          "Waiting on env vars",
  "action_needed":  "Set DATABASE_URL in Render dashboard",
  "agent_name":     "devops-agent"
}
```

Only `title` is required. Returns `201` with the created task.

**Valid statuses:** `pending` | `in_progress` | `done` | `blocked`  
**Valid priorities:** `low` | `medium` | `high` | `urgent`

---

### `PATCH /tasks/:id`
Update any fields. Send only the fields you want to change.

```json
{ "status": "done" }
```

Setting `status: "done"` automatically sets `completed_at`. Setting any other status clears `completed_at`.

---

### `DELETE /tasks/:id`
Delete a task. Returns `204`.

---

### `POST /tasks/cleanup`
Manually trigger cleanup of done tasks older than 24h. Also runs automatically at midnight.

```json
{ "removed": 3 }
```

---

## Agent Integration Example

```typescript
const BASE = "https://your-tracker.onrender.com";
const KEY  = process.env.TASK_TRACKER_API_KEY;
const h    = { "x-api-key": KEY, "Content-Type": "application/json" };

// Create a task
await fetch(`${BASE}/tasks`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    title:      "Generate weekly digest",
    status:     "in_progress",
    priority:   "medium",
    agent_name: "weekly-digest-agent",
  }),
});

// Mark done
await fetch(`${BASE}/tasks/${id}`, {
  method: "PATCH",
  headers: h,
  body: JSON.stringify({ status: "done" }),
});

// Check what needs human attention
const { action_needed } = await fetch(`${BASE}/tasks/summary`, { headers: h }).then(r => r.json());
```

## Deploy to Render

1. Push this repo to GitHub
2. Create a new **Web Service** on [render.com](https://render.com), connect the repo
3. Render will auto-detect `render.yaml`
4. Add environment variables in the Render dashboard
5. The persistent disk in `render.yaml` keeps the SQLite file across deploys

## Email Report Format

Reports are sent at **8AM** and **6PM Eastern**. Each report shows:

1. **Human Action Required** — tasks with `action_needed` set (highlighted in amber)
2. **In Progress**
3. **Pending**
4. **Blocked**
5. **Done**

Tasks are sorted by priority (urgent → high → medium → low) within each section.

## License

MIT
