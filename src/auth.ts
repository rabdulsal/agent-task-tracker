import type { FastifyInstance } from "fastify";
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { queries, type User } from "./db.js";

const HOSTED_API_URL = "https://agent-task-tracker.onrender.com";

function generateRelayToken(): string {
  return "rt_" + randomBytes(32).toString("hex");
}

// Read at call-time, not module-load-time — ESM hoists imports before .env is parsed
const jwtSecret   = () => process.env.SUPABASE_JWT_SECRET ?? "";
const apiBaseUrl  = () => process.env.API_BASE_URL ?? "http://localhost:3000";

// ── Supabase JWT verification (HS256, no external packages) ──────────────────

interface SupabaseClaims {
  sub:   string;   // supabase user UUID
  email: string;
  exp:   number;
}

function verifySupabaseJWT(token: string): SupabaseClaims | null {
  const secret = jwtSecret();
  if (!secret) {
    console.warn("[auth] SUPABASE_JWT_SECRET not set — skipping JWT verification");
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const expected = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  try {
    if (!timingSafeEqual(Buffer.from(sigB64), Buffer.from(expected))) return null;
  } catch { return null; }

  let payload: SupabaseClaims;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch { return null; }

  if (payload.exp < Date.now() / 1000) return null;
  return payload;
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
   * Returns: { api_key, agent_name, mcp_command }
   */
  app.post<{
    Body: { access_token: string; agent_name?: string };
  }>("/auth/provision", async (req, reply) => {
    const { access_token, agent_name: requestedName } = req.body ?? {};
    if (!access_token) throw app.httpErrors.badRequest("access_token is required");

    const claims = verifySupabaseJWT(access_token);
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
   * Returns the caller's Relay identity.
   * Requires: Authorization: Bearer <supabase_access_token>
   *   OR x-api-key (for agents calling from Claude Code)
   */
  app.get("/auth/me", async (req, reply) => {
    // x-api-key path — agents calling from Claude Code or scripts
    const apiKey = req.headers["x-api-key"] as string | undefined;
    if (apiKey) {
      const user = queries.getUserByApiKey.get(apiKey);
      if (!user) return reply.code(401).send({ error: "Invalid api key" });
      return { email: user.email, api_key: user.api_key, agent_name: user.agent_name, mcp_command: mcpCommand(user) };
    }

    // Supabase Bearer token path — web page after signup
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return reply.code(401).send({ error: "Provide x-api-key or Authorization: Bearer <token>" });

    const claims = verifySupabaseJWT(token);
    if (!claims) return reply.code(401).send({ error: "Invalid or expired token" });

    const user = queries.getUserBySupabaseUid.get(claims.sub);
    if (!user) return reply.code(404).send({ error: "Not provisioned — call POST /auth/provision first" });

    return { email: user.email, api_key: user.api_key, relay_token: user.relay_token, agent_name: user.agent_name, mcp_command: mcpCommand(user) };
  });

  /**
   * GET /auth/resolve
   * Called by the relay-mcp package on startup to exchange a relay_token for credentials.
   * Requires: x-relay-token header
   * Returns: { api_key, api_url, agent_name }
   * No auth beyond the token itself — rate limit at the proxy/infra layer if needed.
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
