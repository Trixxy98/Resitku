import { loginSchema, registerSchema } from "@resitku/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";

import { getAuth, requireAuth } from "../middleware/require-auth.js";
import { getProfile, loginUser, registerUser } from "../services/auth.service.js";

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

export const authRouter: Router = Router();

authRouter.post("/register", registerLimiter, async (req, res) => {
  const body: unknown = req.body;
  const result = await registerUser(registerSchema.parse(body));

  res.status(201).json(result);
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const body: unknown = req.body;
  const result = await loginUser(loginSchema.parse(body));

  res.json(result);
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const auth = getAuth(req);

  res.json({ user: await getProfile(auth.userId) });
});
