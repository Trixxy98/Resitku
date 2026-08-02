import { setTimeout as sleep } from "node:timers/promises";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { beginShutdown } from "./lib/lifecycle.js";
import { logger } from "./lib/logger.js";
import { disconnectDatabase } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, "API listening");
});

// The ALB holds connections open for 60s by default while Node drops idle ones
// after 5s. When the ALB reuses a socket Node just closed, the user gets a 502
// that reproduces roughly never. Both values must clear the ALB idle timeout,
// and headersTimeout must clear keepAliveTimeout.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shutdownStarted = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;

  logger.info({ signal }, "Shutdown requested");

  // Flip /readyz to 503 first so the ALB stops routing new requests here while
  // the in-flight ones finish.
  beginShutdown();

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    if (env.SHUTDOWN_DRAIN_MS > 0) {
      await sleep(env.SHUTDOWN_DRAIN_MS);
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });

      // close() waits for every open connection, and an idle keep-alive
      // connection never closes on its own. Without this the shutdown hangs.
      server.closeIdleConnections();
    });

    await disconnectDatabase();
    logger.info("Shutdown complete");
    process.exit(exitCode);
  } catch (error) {
    logger.error({ err: error }, "Shutdown failed");
    process.exit(1);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled rejection");
  void shutdown("unhandledRejection", 1);
});
