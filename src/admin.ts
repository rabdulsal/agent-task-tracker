import type { FastifyInstance } from "fastify";
import { queries } from "./db.js";

const API_KEY = () => process.env.API_KEY ?? "";

function requireAdmin(provided: string | undefined): boolean {
  const key = API_KEY();
  return !!key && provided === key;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /admin/migrate-orphans
   * One-time migration: assigns all tasks with user_id = NULL to the user
   * identified by target_user_api_key. Protected by the server-level API_KEY.
   *
   * Body: { target_user_api_key: string }
   */
  app.post<{ Body: { target_user_api_key?: string } }>("/admin/migrate-orphans", async (req, reply) => {
    const adminKey = req.headers["x-api-key"] as string | undefined;
    if (!requireAdmin(adminKey)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { target_user_api_key } = req.body ?? {};
    if (!target_user_api_key) {
      return reply.code(400).send({ error: "target_user_api_key is required" });
    }

    const user = queries.getUserByApiKey.get(target_user_api_key);
    if (!user) {
      return reply.code(404).send({ error: "No user found for that api key" });
    }

    const before = (queries.countOrphans.get() as { n: number }).n;
    queries.migrateOrphans.run({ userId: user.id });
    const after = (queries.countOrphans.get() as { n: number }).n;

    return {
      migrated: before - after,
      remaining_orphans: after,
      assigned_to: { id: user.id, email: user.email, agent_name: user.agent_name },
    };
  });
}
