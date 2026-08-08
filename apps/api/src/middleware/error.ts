import type { ErrorRequestHandler, RequestHandler } from "express";
import * as z from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../lib/http-error.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(HttpError.notFound(`Cannot ${req.method} ${req.path}`));
};

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new HttpError(
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  // Bukan `instanceof MulterError`: multer ialah pakej CommonJS, dan dalam
  // gabungan ESM/CJS projek ini, kelas yang diimport secara statik di sini
  // boleh menjadi rujukan berbeza daripada kelas yang multer gunakan secara
  // dalaman semasa larian sebenar, menyebabkan instanceof gagal secara senyap.
  // Menyemak `name` mengelak isu identiti kelas itu sepenuhnya.
  if (error instanceof Error && error.name === "MulterError" && "code" in error) {
    return new HttpError(400, "BAD_REQUEST", error.message);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return new HttpError(409, "CONFLICT", "A record with these values already exists");
      case "P2003":
        return new HttpError(409, "CONFLICT", "Referenced record does not exist");
      case "P2025":
        return new HttpError(404, "NOT_FOUND", "Resource not found");
      default:
        break;
    }
  }

  return new HttpError(500, "INTERNAL_ERROR", "Internal server error");
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const httpError = toHttpError(error);

  if (httpError.status >= 500) {
    req.log.error({ err: error }, "Request failed");
  } else {
    req.log.warn({ err: error, status: httpError.status }, "Request rejected");
  }

  if (res.headersSent) {
    res.destroy();
    return;
  }

  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details === undefined ? {} : { details: httpError.details }),
      requestId: req.id,
    },
  });
};
