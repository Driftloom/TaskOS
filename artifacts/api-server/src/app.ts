import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { assertClerkKeysUsable } from "./lib/clerk-key";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

/**
 * Liveness mounted BEFORE clerkMiddleware, deliberately.
 *
 * `clerkMiddleware` throws on every request when the publishable key is
 * malformed, which previously turned a config mistake into a 500 on every
 * route including the health probe. A liveness check must report on the
 * process, not on third-party auth configuration, otherwise a misconfigured
 * key looks identical to a dead server.
 */
app.use("/api/healthz", healthRouter);

// Fail fast and loudly at boot rather than 500-ing every request later.
assertClerkKeysUsable(
  process.env.CLERK_PUBLISHABLE_KEY,
  process.env.CLERK_SECRET_KEY,
);

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    // Never reflect arbitrary origins: only serve the deployed app +
    // local dev. Extend via the CORS_ORIGINS env var (comma-separated).
    origin: allowedOrigins,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Unknown /api path: JSON 404, never Express's default HTML page. The
// frontend's customFetch throws ApiError on non-2xx and tries to read a JSON
// body, so an HTML error page surfaces as a confusing parse failure.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Terminal error handler. Without this, an unhandled throw inside a handler
// falls through to Express's default handler and returns an HTML 500, which
// the client cannot parse and which leaks the stack in dev-shaped bodies.
// Must keep all four parameters for Express to recognise it.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ): void => {
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : 500;

    if (status >= 500) {
      logger.error({ err }, "unhandled request error");
    }

    res.status(status).json({
      error: status >= 500 ? "Internal server error" : String((err as Error)?.message ?? err),
    });
  },
);

export default app;
