import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { registerRoutes } from "./routes.js";
import { startScheduler } from "./scheduler.js";

const API_KEY = process.env.API_KEY;

const app = Fastify({ logger: true });

await app.register(cors, { origin: "*" });
await app.register(sensible);

// ── API key auth (skip for /health) ──────────────────────────────────────────

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health") return;
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
