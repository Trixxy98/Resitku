import type { CookieOptions, Request, Response } from "express";

import { isProduction } from "../config/env.js";

export const REFRESH_COOKIE_NAME = "resitku_refresh";

const REFRESH_COOKIE_PATH = "/api/auth";

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,

    sameSite: "lax",
    secure: isProduction,
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...refreshCookieOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[REFRESH_COOKIE_NAME];

  return typeof token === "string" && token.length > 0 ? token : undefined;
}
