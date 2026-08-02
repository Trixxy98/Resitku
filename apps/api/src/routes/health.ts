import { Router } from "express";

import { isShuttingDown } from "../lib/lifecycle.js";
import { pingDatabase } from "../lib/prisma.js";

export const healthRouter: Router = Router();

/// Liveness. Answers "is this process alive" and never touches the database:
/// a brief RDS blip must not convince the ALB to kill every healthy task.
healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

/// Readiness. Answers "can I serve traffic right now", which does depend on
/// the database, and turns 503 the moment SIGTERM arrives so the ALB drains
/// this task before it stops listening.
healthRouter.get("/readyz", async (req, res) => {
  if (isShuttingDown()) {
    res.status(503).json({ status: "shutting_down" });
    return;
  }

  try {
    await pingDatabase();
    res.json({ status: "ready" });
  } catch (error) {
    req.log.error({ err: error }, "Readiness probe failed");
    res.status(503).json({ status: "unavailable" });
  }
});
