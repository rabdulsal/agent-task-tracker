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
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { registerRoutes } from "./routes.js";
import { startScheduler } from "./scheduler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.API_KEY;

const app = Fastify({ logger: true });

await app.register(cors, { origin: "*" });
await app.register(sensible);
await app.register(staticPlugin, { root: join(__dirname, "../public"), decorateReply: true });

// ── Public pages ──────────────────────────────────────────────────────────────

app.get("/", async (req, reply) => reply.sendFile("index.html"));
app.get("/docs", async (req, reply) => reply.sendFile("docs.html"));

// ── API key auth (skip for /health and UI pages) ──────────────────────────────

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health" || req.url === "/" || req.url === "/docs") return;
  if (!API_KEY) return; // no key set = open (useful for local dev)

  const provided = req.headers["x-api-key"];
  if (provided !== API_KEY) {
    return reply.code(401).send({ error: "Invalid or missing x-api-key" });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

await registerRoutes(app);

// ── Start ─────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`[server] Agent Task Tracker running on port ${port}`);

startScheduler();
