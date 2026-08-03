import type { Request, RequestHandler } from "express";

import { HttpError } from "../lib/http-error.js";
import type { AuthContext } from "../lib/tokens.js";
import { verifyAccessToken } from "../lib/tokens.js";

const BEARER_PREFIX = "Bearer ";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;

  if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
    next(HttpError.unauthorized("Missing bearer token"));
    return;
  }

  try {
    req.auth = verifyAccessToken(header.slice(BEARER_PREFIX.length));
    next();
  } catch (error) {
    next(error);
  }
};

export function getAuth(req: Request): AuthContext {
  if (req.auth === undefined) {
    throw HttpError.unauthorized("Authentication required");
  }

  return req.auth;
}
