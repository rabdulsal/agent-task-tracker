import type { FastifyInstance } from "fastify";
import { randomUUID, randomBytes } from "crypto";
import { queries, type User } from "./db.js";

const HOSTED_API_URL = "https://agent-task-tracker.onrender.com";

function generateRelayToken(): string {
  return "rt_" + randomBytes(32).toString("hex");
}

const supabaseUrl  = () => process.env.SUPABASE_URL     ?? "";
const supabaseAnon = () => process.env.SUPABASE_ANON_KEY ?? "";
const apiBaseUrl   = () => process.env.API_BASE_URL      ?? "http://localhost:4000";

// ── Supabase token verification via API (supports HS256 and ES256) ────────────
// Verifying locally requires matching the signing algorithm (HS256 vs ES256).
// Supabase newer projects use ES256. Delegating to Supabase's own /auth/v1/user
// endpoint is simpler, always correct, and handles algorithm changes automatically.

interface SupabaseClaims {
  sub:   string;
  email: string;
}

async function verifySupabaseToken(token: string): Promise<SupabaseClaims | null> {
  const url  = supabaseUrl();
  const anon = supabaseAnon();
  if (!url || !anon) {
    console.warn("[auth] SUPABASE_URL / SUPABASE_ANON_KEY not set");
    return null;
  }
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": anon,
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { id: string; email: string };
    if (!data.id || !data.email) return null;
    return { sub: data.id, email: data.email };
  } catch {
    return null;
  }
}

function slugify(email: string): string {
  return email.split("@")[0].replace(/[^a-z0-9_-]/gi, "-").toLowerCase().slice(0, 30);
}

function now(): string {
  return new Date().toISOString();
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /auth/provision
   * Called by the get-started page after Supabase email confirmation.
   * Body: { access_token: string, agent_name?: string }
   * Returns: { api_key, relay_token, agent_name, mcp_command }
   */
  app.post<{
    Body: { access_token: string; agent_name?: string };
  }>("/auth/provision", async (req, reply) => {
    const { access_token, agent_name: requestedName } = req.body ?? {};
    if (!access_token) throw app.httpErrors.badRequest("access_token is required");

    const claims = await verifySupabaseToken(access_token);
    if (!claims) {
      return reply.code(401).send({ error: "Invalid or expired Supabase token" });
    }

    // Return existing user if already provisioned
    const existing = queries.getUserBySupabaseUid.get(claims.sub);
    if (existing) {
      return { api_key: existing.api_key, relay_token: existing.relay_token, agent_name: existing.agent_name, mcp_command: mcpCommand(existing) };
    }

    // Create new user
    const agent_name = (requestedName?.trim() || slugify(claims.email));
    const user: User = {
      id:           randomUUID(),
      supabase_uid: claims.sub,
      email:        claims.email,
      api_key:      randomUUID(),
      relay_token:  generateRelayToken(),
      agent_name,
      created_at:   now(),
    };

    queries.insertUser.run(user);
    reply.code(201);
    return { api_key: user.api_key, relay_token: user.relay_token, agent_name: user.agent_name, mcp_command: mcpCommand(user) };
  });

  /**
   * GET /auth/me
   * Requires: Authorization: Bearer <supabase_access_token>  OR  x-api-key
   */
  app.get("/auth/me", async (req, reply) => {
    const apiKey = req.headers["x-api-key"] as string | undefined;
    if (apiKey) {
      const user = queries.getUserByApiKey.get(apiKey);
      if (!user) return reply.code(401).send({ error: "Invalid api key" });
      return { email: user.email, api_key: user.api_key, agent_name: user.agent_name, mcp_command: mcpCommand(user) };
    }

    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return reply.code(401).send({ error: "Provide x-api-key or Authorization: Bearer <token>" });

    const claims = await verifySupabaseToken(token);
    if (!claims) return reply.code(401).send({ error: "Invalid or expired token" });

    const user = queries.getUserBySupabaseUid.get(claims.sub);
    if (!user) return reply.code(404).send({ error: "Not provisioned — call POST /auth/provision first" });

    return { email: user.email, api_key: user.api_key, relay_token: user.relay_token, agent_name: user.agent_name, mcp_command: mcpCommand(user) };
  });

  /**
   * GET /auth/resolve
   * Exchanges x-relay-token for { api_key, api_url, agent_name }
   */
  app.get("/auth/resolve", async (req, reply) => {
    const token = req.headers["x-relay-token"] as string | undefined;
    if (!token) return reply.code(401).send({ error: "x-relay-token header required" });

    const user = queries.getUserByRelayToken.get(token);
    if (!user) return reply.code(401).send({ error: "Invalid or revoked relay token" });

    return { api_key: user.api_key, api_url: HOSTED_API_URL, agent_name: user.agent_name };
  });
}

function mcpCommand(user: User): string {
  const token = user.relay_token;
  if (token) {
    return `claude mcp add relay -e RELAY_TOKEN=${token} -e RELAY_AGENT=${user.agent_name} -- npx @relayctl/mcp`;
  }
  return `claude mcp add relay -e RELAY_API_URL=${apiBaseUrl()} -e RELAY_API_KEY=${user.api_key} -e RELAY_AGENT=${user.agent_name} -- npx @relayctl/mcp`;
}
