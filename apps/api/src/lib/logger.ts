import { pino } from "pino";

import { env, isDevelopment } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "resitku-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // CloudWatch Logs Insights filters on strings far more comfortably than on
    // pino's default numeric levels.
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      // A response header, not a request one. Getting this wrong would put the
      // refresh token cookie into CloudWatch in clear text.
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
    ],
    remove: true,
  },

  // Development only. pino-pretty is a devDependency absent from the production
  // image, and it runs in a worker thread that can keep Vitest from exiting.
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service",
          },
        },
      }
    : {}),
});
