import { loginSchema, registerSchema } from "@resitku/shared";
import { Router } from "express";
import type { Response } from "express";
import rateLimit from "express-rate-limit";

import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../lib/cookies.js";
import { HttpError } from "../lib/http-error.js";
import { getAuth, requireAuth } from "../middleware/require-auth.js";
import type { AuthResult } from "../services/auth.service.js";
import {
  getProfile,
  loginUser,
  refreshSession,
  registerUser,
  revokeSession,
} from "../services/auth.service.js";

/// Only failures consume the budget, so a real user logging in repeatedly is
/// never locked out while an attacker gets ten guesses per quarter hour.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

/// Counts every request, because the abuse here is bulk signup rather than
/// password guessing.
const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

/// Cookie yang dicuri tidak boleh diteka secara kasar, jadi had ini cuma untuk
/// menahan klien yang rosak daripada menghentam tulisan rotasi dalam gelung.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

export const authRouter: Router = Router();

/// Satu tempat sahaja yang menulis cookie dan badan respons, supaya refresh
/// token tidak boleh terlepas masuk ke dalam JSON pada salah satu daripada tiga
/// laluan yang mengeluarkan sesi.
function sendSession(res: Response, status: number, { session, user }: AuthResult): void {
  setRefreshCookie(res, session.refreshToken, session.refreshTokenExpiresAt);
  res.status(status).json({ accessToken: session.accessToken, user });
}

authRouter.post("/register", registerLimiter, async (req, res) => {
  const body: unknown = req.body;

  sendSession(res, 201, await registerUser(registerSchema.parse(body)));
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const body: unknown = req.body;

  sendSession(res, 200, await loginUser(loginSchema.parse(body)));
});

authRouter.post("/refresh", refreshLimiter, async (req, res) => {
  const token = readRefreshCookie(req);

  if (token === undefined) {
    throw HttpError.unauthorized("No refresh token was supplied");
  }

  try {
    sendSession(res, 200, await refreshSession(token));
  } catch (error) {
    // Apa pun yang berlaku, cookie dalam pelayar sudah tidak bernilai.
    // Membiarkannya bermakna setiap muat semula mencubanya lagi.
    clearRefreshCookie(res);
    throw error;
  }
});

/// Tanpa requireAuth dengan sengaja. Pengguna yang access tokennya sudah luput
/// masih perlu boleh log keluar; cookie itulah yang menentukan sesi mana mati.
authRouter.post("/logout", async (req, res) => {
  const token = readRefreshCookie(req);

  if (token !== undefined) {
    await revokeSession(token);
  }

  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const auth = getAuth(req);

  res.json({ user: await getProfile(auth.userId) });
});
