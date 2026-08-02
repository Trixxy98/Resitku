import { randomUUID } from "node:crypto";

import { pinoHttp } from "pino-http";

import { logger } from "../lib/logger.js";

const REQUEST_ID_HEADER = "x-request-id";

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const forwarded = req.headers[REQUEST_ID_HEADER];
    const id = typeof forwarded === "string" && forwarded.length > 0 ? forwarded : randomUUID();

    res.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },
  customLogLevel: (_req, res, error) => {
    if (error !== undefined || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
});
