import type { LoginInput, RegisterInput } from "@resitku/shared";

import { env } from "../config/env.js";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../lib/http-error.js";
import { burnTimingBudget, hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { hashRefreshToken, mintRefreshToken, signAccessToken } from "../lib/tokens.js";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/// Berasingan dan bukan rata, supaya tiada route boleh menyerikan keseluruhan
/// hasil ini lalu meletakkan refresh token dalam badan JSON.
export interface AuthResult {
  session: Session;
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

const DAY_MS = 86_400_000;

async function issueSession(user: PublicUser): Promise<Session> {
  const refreshToken = mintRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashRefreshToken(refreshToken), expiresAt },
  });

  return {
    accessToken: signAccessToken({ userId: user.id, email: user.email }),
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
}

/// Dipanggil apabila token yang sudah dirotasikan muncul semula. Salah satu
/// daripada dua pemegangnya penyerang dan tiada cara untuk tahu yang mana, jadi
/// kedua-duanya hilang akses.
async function revokeEverySession(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  let user: PublicUser;

  try {
    // Nested create runs in one implicit transaction. Two separate calls would
    // risk an account that exists with no categories to file anything under.
    user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        categories: { create: STARTER_CATEGORIES.map((category) => ({ ...category })) },
      },
      select: { id: true, name: true, email: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw HttpError.conflict("An account with this email already exists");
    }

    throw error;
  }

  return { session: await issueSession(user), user };
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

  // Baris yang sudah luput sahaja. Baris yang dibatalkan tetapi masih dalam
  // hayat asalnya wajib kekal, kerana itulah bukti yang membuatkan penggunaan
  // semula dapat dikesan.
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });

  const publicUser = { id: user.id, name: user.name, email: user.email };

  return { session: await issueSession(publicUser), user: publicUser };
}

export async function refreshSession(rawToken: string): Promise<AuthResult> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (stored === null) {
    throw HttpError.unauthorized("Refresh token is invalid");
  }

  if (stored.revokedAt !== null) {
    await revokeEverySession(stored.userId);
    throw HttpError.unauthorized("Refresh token has already been used");
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw HttpError.unauthorized("Refresh token has expired");
  }

  // Compare and swap. Dua tab yang refresh serentak kedua-duanya membaca baris
  // ini sebagai hidup, dan hanya permintaan yang berjaya menukar revokedAt
  // daripada null dibenarkan mengeluarkan sesi baharu.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (claimed.count === 0) {
    await revokeEverySession(stored.userId);
    throw HttpError.unauthorized("Refresh token has already been used");
  }

  return { session: await issueSession(stored.user), user: stored.user };
}

/// Idempotent. Logout dengan cookie yang sudah lapuk atau tidak dikenali tetap
/// dilaporkan berjaya, kerana tiada apa yang berguna untuk diberitahu pemanggil.
export async function revokeSession(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
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
