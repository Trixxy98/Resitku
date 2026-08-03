import type { LoginInput, RegisterInput } from "@resitku/shared";

import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../lib/http-error.js";
import { burnTimingBudget, hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../lib/tokens.js";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

/// Copied into the account at registration rather than shared, so that renaming
/// one cannot affect another user. See the Category model comment.
const STARTER_CATEGORIES = [
  { name: "Gaji", type: "INCOME", color: "#16a34a" },
  { name: "Freelance", type: "INCOME", color: "#0891b2" },
  { name: "Makanan", type: "EXPENSE", color: "#ea580c" },
  { name: "Pengangkutan", type: "EXPENSE", color: "#2563eb" },
  { name: "Utiliti", type: "EXPENSE", color: "#7c3aed" },
  { name: "Beli-belah", type: "EXPENSE", color: "#db2777" },
  { name: "Kesihatan", type: "EXPENSE", color: "#dc2626" },
  { name: "Lain-lain", type: "EXPENSE", color: "#64748b" },
] as const;

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  try {
    // Nested create runs in one implicit transaction. Two separate calls would
    // risk an account that exists with no categories to file anything under.
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        categories: { create: STARTER_CATEGORIES.map((category) => ({ ...category })) },
      },
      select: { id: true, name: true, email: true },
    });

    return { accessToken: signAccessToken({ userId: user.id, email: user.email }), user };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw HttpError.conflict("An account with this email already exists");
    }

    throw error;
  }
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true, passwordHash: true },
  });

  if (user === null) {
    await burnTimingBudget(input.password);
    throw HttpError.unauthorized("Invalid email or password");
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw HttpError.unauthorized("Invalid email or password");
  }

  return {
    accessToken: signAccessToken({ userId: user.id, email: user.email }),
    user: { id: user.id, name: user.name, email: user.email },
  };
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  // The token verified, but the account behind it is gone.
  if (user === null) {
    throw HttpError.unauthorized("Account no longer exists");
  }

  return user;
}
