import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDatabase } from "../test/database.js";

const app = createApp();

const VALID_USER = {
  name: "Rith",
  email: "rith@example.com",
  password: "katalaluan-panjang-123",
};

interface AuthBody {
  accessToken: string;
  user: { id: string; name: string; email: string };
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

/// Each request claims its own client address. app.ts trusts one proxy hop, so
/// express-rate-limit buckets on this and no test can spend another test's
/// budget. It also means these tests start failing if trust proxy regresses.
let clientCounter = 0;

function fromFreshClient(): Record<string, string> {
  clientCounter += 1;
  return { "x-forwarded-for": `10.0.0.${String(clientCounter)}` };
}

async function register(overrides: Partial<typeof VALID_USER> = {}): Promise<AuthBody> {
  const response = await request(app)
    .post("/api/auth/register")
    .set(fromFreshClient())
    .send({ ...VALID_USER, ...overrides });

  expect(response.status).toBe(201);
  return response.body as AuthBody;
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("lowercases the email before storing it", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .set(fromFreshClient())
      .send({ ...VALID_USER, email: "Rith@Example.COM" });

    expect(response.status).toBe(201);

    const body = response.body as AuthBody;
    expect(body.user.email).toBe("rith@example.com");
    expect(body.accessToken).toEqual(expect.any(String));
  });

  it("keeps the password hash out of the response", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .set(fromFreshClient())
      .send(VALID_USER);

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain("passwordHash");
    expect(serialised).not.toContain("$argon2");
  });

  it("creates the starter categories alongside the account", async () => {
    const { user } = await register();

    const categories = await prisma.category.findMany({
      where: { userId: user.id },
      select: { type: true },
    });

    expect(categories).toHaveLength(8);
    expect(categories.filter((category) => category.type === "INCOME")).toHaveLength(2);
  });

  it("rejects a duplicate email whatever its casing", async () => {
    await register();

    const response = await request(app)
      .post("/api/auth/register")
      .set(fromFreshClient())
      .send({ ...VALID_USER, email: "RITH@EXAMPLE.COM" });

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe("CONFLICT");
  });

  it("reports every invalid field in one response", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .set(fromFreshClient())
      .send({ name: "", email: "bukan-email", password: "pendek" });

    expect(response.status).toBe(400);

    const body = response.body as ErrorBody;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details?.map((detail) => detail.path)).toEqual(["name", "email", "password"]);
  });
});

describe("POST /api/auth/login", () => {
  it("accepts the email in any casing", async () => {
    await register();

    const response = await request(app)
      .post("/api/auth/login")
      .set(fromFreshClient())
      .send({ email: "RITH@Example.com", password: VALID_USER.password });

    expect(response.status).toBe(200);
    expect((response.body as AuthBody).user.email).toBe("rith@example.com");
  });

  it("answers a wrong password and an unknown account identically", async () => {
    await register();

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .set(fromFreshClient())
      .send({ email: VALID_USER.email, password: "password-yang-salah" });

    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .set(fromFreshClient())
      .send({ email: "tiada@example.com", password: VALID_USER.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);

    // Same wording, so the body gives away nothing about who holds an account.
    // Equal timing is burnTimingBudget's job and is not asserted here.
    expect((wrongPassword.body as ErrorBody).error.message).toBe(
      (unknownEmail.body as ErrorBody).error.message,
    );
  });
});

describe("GET /api/auth/me", () => {
  it("returns the account behind a valid bearer token", async () => {
    const { accessToken, user } = await register();

    const response = await request(app)
      .get("/api/auth/me")
      .set({ ...fromFreshClient(), authorization: `Bearer ${accessToken}` });

    expect(response.status).toBe(200);
    expect((response.body as { user: AuthBody["user"] }).user.id).toBe(user.id);
  });

  it("refuses a request carrying no Authorization header", async () => {
    const response = await request(app).get("/api/auth/me").set(fromFreshClient());

    expect(response.status).toBe(401);
    expect((response.body as ErrorBody).error.message).toBe("Missing bearer token");
  });

  it("refuses a token that is not a JWT at all", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set({ ...fromFreshClient(), authorization: "Bearer rosak" });

    expect(response.status).toBe(401);
  });

  it("refuses a well formed token signed with another secret", async () => {
    const { user } = await register();

    const forged = jwt.sign({ email: user.email }, "a-completely-different-secret-key-32", {
      subject: user.id,
      issuer: "resitku",
      audience: "resitku",
      expiresIn: 900,
    });

    const response = await request(app)
      .get("/api/auth/me")
      .set({ ...fromFreshClient(), authorization: `Bearer ${forged}` });

    expect(response.status).toBe(401);
  });
});
