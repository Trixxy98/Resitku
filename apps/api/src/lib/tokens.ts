import { createHash, randomBytes } from "node:crypto";

import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";

import { env } from "../config/env.js";
import { HttpError } from "./http-error.js";

const ISSUER = "resitku";

const REFRESH_TOKEN_BYTES = 32;

export interface AuthContext {
  userId: string;
  email: string;
}

export function signAccessToken(context: AuthContext): string {
  return jwt.sign({ email: context.email }, env.JWT_ACCESS_SECRET, {
    subject: context.userId,
    issuer: ISSUER,
    audience: ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AuthContext {
  let payload: string | JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: ISSUER,
    });
  } catch {
    throw HttpError.unauthorized("Access token is invalid or has expired");
  }

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw HttpError.unauthorized("Access token is malformed");
  }

  const email: unknown = payload["email"];

  if (typeof email !== "string") {
    throw HttpError.unauthorized("Access token is malformed");
  }

  return { userId: payload.sub, email };
}

export function mintRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
