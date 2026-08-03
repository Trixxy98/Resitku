import { hash, verify } from "@node-rs/argon2";
import type { Algorithm } from "@node-rs/argon2";

const ARGON2ID = 2 as Algorithm;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export function verifyPassword(hashed: string, password: string): Promise<boolean> {
  return verify(hashed, password, OPTIONS);
}

export async function burnTimingBudget(password: string): Promise<void> {
  await hash(password, OPTIONS);
}
