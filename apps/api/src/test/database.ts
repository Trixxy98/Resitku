import { prisma } from "../lib/prisma.js";

/// Truncating users is enough on its own: every other table references it with
/// ON DELETE CASCADE, so categories, transactions, receipts and refresh tokens
/// all go with it.
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe('truncate table "users" restart identity cascade');
}
