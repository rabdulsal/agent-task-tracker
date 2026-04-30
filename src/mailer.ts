import { Resend } from "resend";
import type { Task } from "./db.js";

const PRIORITY_ICON: Record<string, string> = {
  urgent: "🔴",
  high:   "🟠",
  medium: "🟡",
  low:    "⚪",
};

function taskRow(t: Task): string {
  const icon = PRIORITY_ICON[t.priority] ?? "⚪";
  const agent = t.agent_name ? ` <span style="color:#888;font-size:11px">[${t.agent_name}]</span>` : "";
  const action = t.action_needed
    ? `<div style="margin-top:4px;padding:6px 10px;background:#fff3cd;border-left:3px solid #f59e0b;font-size:12px;border-radius:2px">⚠️ Action needed: ${t.action_needed}</div>`
    : "";
  const notes = t.notes
    ? `<div style="margin-top:4px;font-size:12px;color:#555">${t.notes}</div>`
    : "";
  return `
    <div style="padding:10px 0;border-bottom:1px solid #f0f0f0">
      <div style="font-weight:500">${icon} ${t.title}${agent}</div>
      ${action}${notes}
    </div>`;
}

function section(title: string, tasks: Task[], accent: string): string {
  if (!tasks.length) return "";
  return `
    <div style="margin-bottom:24px">
      <h3 style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${accent}">${title} (${tasks.length})</h3>
      ${tasks.map(taskRow).join("")}
    </div>`;
}

export async function sendReport(tasks: Task[], period: "morning" | "evening"): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ALERT_EMAIL;
  const from   = process.env.FROM_EMAIL ?? "tasks@webslingerai.com";
  if (!apiKey || !to) {
    console.warn("[mailer] RESEND_API_KEY or ALERT_EMAIL not set — skipping email");
    return;
  }

  const actionNeeded  = tasks.filter(t => t.action_needed && t.status !== "done");
  const inProgress    = tasks.filter(t => t.status === "in_progress");
  const pending       = tasks.filter(t => t.status === "pending");
  const blocked       = tasks.filter(t => t.status === "blocked");
  const done          = tasks.filter(t => t.status === "done");

  const label   = period === "morning" ? "Morning" : "Evening";
  const emoji   = period === "morning" ? "☀️" : "🌙";
  const subject = `${emoji} [Task Tracker] ${label} Report — ${inProgress.length} in progress, ${pending.length} pending, ${done.length} done`;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h2 style="margin:0 0 4px;font-size:20px">${emoji} ${label} Task Report</h2>
      <p style="margin:0 0 24px;color:#888;font-size:13px">${new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" })}</p>

      ${actionNeeded.length ? section("⚠️ Human Action Required", actionNeeded, "#b45309") : ""}
      ${section("In Progress", inProgress, "#1d4ed8")}
      ${section("Pending", pending, "#6b7280")}
      ${section("Blocked", blocked, "#dc2626")}
      ${section("Done", done, "#15803d")}

      ${!tasks.length ? `<p style="color:#888;text-align:center;padding:40px 0">No tasks yet. Create one via the API.</p>` : ""}

      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
      <p style="font-size:11px;color:#aaa;margin:0">
        Agent Task Tracker — auto-cleanup removes done tasks after 24h<br>
        API: <code>${process.env.API_BASE_URL ?? "http://localhost:3000"}</code>
      </p>
    </div>`;

  const resend = new Resend(apiKey);
  await resend.emails.send({ from, to, subject, html });
  console.log(`[mailer] ${label} report sent to ${to}`);
}
