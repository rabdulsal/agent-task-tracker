import { readFileSync } from "fs";
try {
  const env = readFileSync(".env", "utf-8");
  for (const line of env.split("\n")) {
    const [key, ...vals] = line.split("=");
    if (key?.trim() && vals.length && !key.trim().startsWith("#"))
      process.env[key.trim()] ??= vals.join("=").trim().replace(/^["']|["']$/g, "");
  }
} catch {}

import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import staticPlugin from "@fastify/static";
import { createHmac, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { queries } from "./db.js";
import { registerRoutes } from "./routes.js";
import { registerAuthRoutes } from "./auth.js";
import { startScheduler } from "./scheduler.js";

// ── Type augmentation ─────────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;  // null = admin (API_KEY), string = user id
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY            = process.env.API_KEY ?? "";
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

// ── Dashboard session tokens (HMAC-signed, 24h TTL) ──────────────────────────

function makeToken(): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", API_KEY || "dev").update(ts).digest("hex");
  return `${ts}.${sig}`;
}

function validToken(token: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const ts  = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", API_KEY || "dev").update(ts).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch { return false; }
  return Date.now() - parseInt(ts) < 24 * 60 * 60 * 1000;
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = Fastify({ logger: true });

await app.register(cors, { origin: "*" });
await app.register(sensible);
await app.register(staticPlugin, {
  root: join(__dirname, "../public"),
  decorateReply: true,
});

// ── Public pages ──────────────────────────────────────────────────────────────

app.get("/",            async (req, reply) => reply.sendFile("index.html"));
app.get("/docs",        async (req, reply) => reply.sendFile("docs.html"));
app.get("/get-started", async (req, reply) => {
  // Inject public Supabase credentials as global JS vars (anon key is safe to expose)
  const injection = `<script>
window.RELAY_SUPABASE_URL  = ${JSON.stringify(process.env.SUPABASE_URL  ?? "")};
window.RELAY_SUPABASE_ANON = ${JSON.stringify(process.env.SUPABASE_ANON_KEY ?? "")};
</script>`;
  const html = (await import("fs/promises")).readFile(
    join(__dirname, "../public/get-started.html"), "utf-8"
  ).then(s => s.replace("</head>", `${injection}\n</head>`));
  reply.type("text/html").send(await html);
});

// ── Dashboard auth ─────────────────────────────────────────────────────────────

app.post<{ Body: { password: string } }>("/dashboard/login", async (req, reply) => {
  if (!DASHBOARD_PASSWORD)
    return reply.code(503).send({ error: "DASHBOARD_PASSWORD not configured" });
  if (req.body?.password !== DASHBOARD_PASSWORD)
    return reply.code(401).send({ error: "Wrong password" });
  return { token: makeToken() };
});

app.get("/dashboard/data", async (req, reply) => {
  const token = req.headers["x-dashboard-token"] as string | undefined;
  if (!token || !validToken(token))
    return reply.code(401).send({ error: "Not authenticated" });

  // Dashboard shows admin view (all tasks)
  const all = queries.getAll.all({ userId: null });
  return {
    tasks: all,
    summary: {
      total: all.length,
      by_status: {
        pending:     all.filter((t: any) => t.status === "pending").length,
        in_progress: all.filter((t: any) => t.status === "in_progress").length,
        done:        all.filter((t: any) => t.status === "done").length,
        blocked:     all.filter((t: any) => t.status === "blocked").length,
      },
      action_needed: all
        .filter((t: any) => t.action_needed && t.status !== "done")
        .map((t: any) => ({ id: t.id, title: t.title, action_needed: t.action_needed, priority: t.priority })),
    },
  };
});

// ── Waitlist (from landing page) ──────────────────────────────────────────────

app.post<{ Body: { email?: string; source?: string } }>("/waitlist", async (req, reply) => {
  const { email } = req.body ?? {};
  if (!email?.includes("@")) return reply.code(400).send({ error: "invalid email" });
  // Log for now — wire to Resend / sheet later
  console.log(`[waitlist] ${email} (source: ${req.body?.source ?? "unknown"})`);
  return { ok: true };
});

// ── Auth routes (public — no API key required) ────────────────────────────────

await registerAuthRoutes(app);

// ── API key / user auth hook ──────────────────────────────────────────────────

const PUBLIC_PATHS = new Set(["/", "/docs", "/get-started", "/health", "/waitlist"]);
const PUBLIC_PREFIXES = ["/dashboard/", "/auth/"];

app.addHook("onRequest", async (req, reply) => {
  const url = req.url.split("?")[0];

  if (PUBLIC_PATHS.has(url)) return;
  if (PUBLIC_PREFIXES.some(p => url.startsWith(p))) return;
  if (/\.(png|jpg|jpeg|ico|svg|css|js|woff2?)$/.test(url)) return;

  const provided = req.headers["x-api-key"] as string | undefined;
  if (!provided) return reply.code(401).send({ error: "Missing x-api-key header" });

  // Admin key → full access, no user scoping
  if (API_KEY && provided === API_KEY) {
    req.userId = null;
    return;
  }

  // User api_key → scoped to that user
  const user = queries.getUserByApiKey.get(provided);
  if (!user) return reply.code(401).send({ error: "Invalid x-api-key" });
  req.userId = user.id;
});

// ── Task routes ───────────────────────────────────────────────────────────────

await registerRoutes(app);

// ── Start ─────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`[server] Relay backend running on port ${port}`);

startScheduler();
