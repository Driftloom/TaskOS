import { sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

/**
 * Public liveness/readiness probe (no auth — this is the one route that must
 * answer before Clerk is configured).
 *
 * Reports `degraded` / `database: down` when Postgres is unreachable, instead
 * of the previous hardcoded "ok" that stayed green with a dead database.
 */
router.get("/healthz", async (_req, res) => {
  let database: "up" | "down" = "up";
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    database = "down";
  }

  const data = HealthCheckResponse.parse({
    status: database === "up" ? "ok" : "degraded",
    database,
    uptimeSeconds: Math.round(process.uptime()),
  });
  res.status(database === "up" ? 200 : 503).json(data);
});

export default router;
