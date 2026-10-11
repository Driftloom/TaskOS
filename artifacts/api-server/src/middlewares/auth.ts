import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      /**
       * Raw Clerk session JWT for this request. Forwarded to Postgres via
       * runWithRls so RLS policies see auth.jwt()->>'sub'. Absent when the
       * token fetch fails -- runWithRls fails closed in that case.
       */
      authToken?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth.userId;

  if (!userId) {
    const debug = typeof (auth as { debug?: () => { reason?: string; message?: string } }).debug === "function"
      ? (auth as { debug: () => { reason?: string; message?: string } }).debug()
      : null;
    if (debug?.reason) {
      req.log?.warn?.({ reason: debug.reason, clerkMessage: debug.message }, "requireAuth rejected request");
    }
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.userId = userId;
  try {
    req.authToken = (await auth.getToken()) ?? undefined;
  } catch {
    req.authToken = undefined;
  }
  next();
}