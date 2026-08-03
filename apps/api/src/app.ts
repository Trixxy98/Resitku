import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { httpLogger } from "./middleware/logging.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";

export function createApp(): Express {
  const app = express();

  // One hop, because the ALB is the only proxy in front of the task. Trusting
  // the whole chain would let a client forge X-Forwarded-For and rotate its
  // way straight past the rate limiter.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(httpLogger);

  // Probes answer before the limiter. Sharing the budget with real traffic
  // means a burst makes the ALB mark healthy tasks as unhealthy.
  app.use(healthRouter);

  app.use(
    cors({
      origin: env.CORS_ORIGIN.length > 0 ? env.CORS_ORIGIN : false,
      credentials: true,
    }),
  );

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
