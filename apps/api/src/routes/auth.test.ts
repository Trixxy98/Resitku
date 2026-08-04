import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { REFRESH_COOKIE_NAME } from "../lib/cookies.js";
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

function setCookieHeaders(response: request.Response): string[] {
  const header: unknown = response.headers["set-cookie"];

  return Array.isArray(header) ? (header as string[]) : [];
}

/// Supertest tidak menyimpan cookie jar, jadi setiap test membawa cookie ke
/// hadapan dengan tangan. Itulah juga yang membolehkan kita mainkan semula
/// cookie lama, iaitu perkara yang seorang penyerang akan buat.
function refreshCookie(response: request.Response): string {
  const raw = setCookieHeaders(response).find((cookie) =>
    cookie.startsWith(`${REFRESH_COOKIE_NAME}=`),
  );

  if (raw === undefined) {
    throw new Error("response carried no refresh cookie");
  }

  // Nilai sahaja. Pelayar tidak menghantar atribut kembali kepada pelayan.
  return raw.split(";")[0] ?? "";
}

async function registerRequest(
  overrides: Partial<typeof VALID_USER> = {},
): Promise<request.Response> {
  const response = await request(app)
    .post("/api/auth/register")
    .set(fromFreshClient())
    .send({ ...VALID_USER, ...overrides });

  expect(response.status).toBe(201);
  return response;
}

async function register(overrides: Partial<typeof VALID_USER> = {}): Promise<AuthBody> {
  return (await registerRequest(overrides)).body as AuthBody;
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
  describe("the refresh cookie", () => {
    it("is httpOnly, scoped to the auth routes, and never in the body", async () => {
      const response = await registerRequest();

      const raw = setCookieHeaders(response).find((cookie) =>
        cookie.startsWith(`${REFRESH_COOKIE_NAME}=`),
      );

      expect(raw).toContain("HttpOnly");
      expect(raw).toContain("Path=/api/auth");
      expect(raw).toContain("SameSite=Lax");

      // Kalau ia turut muncul di sini, httpOnly tidak bererti apa-apa: skrip
      // halaman boleh membacanya daripada respons dan menyimpannya di localStorage.
      expect(JSON.stringify(response.body)).not.toContain("refreshToken");
    });

    it("is stored as a hash and not as the value handed to the client", async () => {
      const response = await registerRequest();
      const value = refreshCookie(response).split("=")[1] ?? "";

      const rows = await prisma.refreshToken.findMany({ select: { tokenHash: true } });

      expect(rows).toHaveLength(1);
      expect(value.length).toBeGreaterThan(0);
      expect(rows[0]?.tokenHash).not.toBe(value);
      expect(rows[0]?.tokenHash).toHaveLength(64);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("exchanges the cookie for a new access token and a new cookie", async () => {
      const cookie = refreshCookie(await registerRequest());

      const response = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie });

      expect(response.status).toBe(200);

      const body = response.body as AuthBody;
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.user.email).toBe(VALID_USER.email);

      // Rotasi, bukan pengeluaran semula: cookie lama tidak boleh kembali.
      expect(refreshCookie(response)).not.toBe(cookie);
    });

    it("returns an access token that /me accepts", async () => {
      const cookie = refreshCookie(await registerRequest());

      const refreshed = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie });

      const me = await request(app)
        .get("/api/auth/me")
        .set({
          ...fromFreshClient(),
          authorization: `Bearer ${(refreshed.body as AuthBody).accessToken}`,
        });

      expect(me.status).toBe(200);
    });

    it("refuses a request carrying no cookie", async () => {
      const response = await request(app).post("/api/auth/refresh").set(fromFreshClient());

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).error.message).toBe("No refresh token was supplied");
    });

    it("refuses a cookie that matches no stored token, and clears it", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie: `${REFRESH_COOKIE_NAME}=tidak-pernah-dikeluarkan` });

      expect(response.status).toBe(401);

      // Nilai kosong dengan tarikh luput lampau, supaya pelayar membuangnya dan
      // tidak mencuba lagi pada setiap muat semula.
      expect(setCookieHeaders(response).join()).toContain(`${REFRESH_COOKIE_NAME}=;`);
    });

    it("refuses a token that has passed its expiry", async () => {
      const cookie = refreshCookie(await registerRequest());

      await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

      const response = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie });

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).error.message).toBe("Refresh token has expired");
    });
  });

  describe("refresh token reuse", () => {
    it("refuses the same token a second time", async () => {
      const cookie = refreshCookie(await registerRequest());

      const first = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie });

      expect(first.status).toBe(200);

      const replay = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie });

      expect(replay.status).toBe(401);
      expect((replay.body as ErrorBody).error.message).toBe("Refresh token has already been used");
    });

    it("takes down the token the rotation issued as well", async () => {
      const stolen = refreshCookie(await registerRequest());

      const rotated = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie: stolen });

      // Penyerang memainkan semula salinan yang diambilnya sebelum rotasi.
      await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie: stolen });

      // Pelayar mangsa masih memegang token yang sah sesaat sebelum ini.
      const victim = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie: refreshCookie(rotated) });

      expect(victim.status).toBe(401);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("revokes the cookie it was given", async () => {
      const cookie = refreshCookie(await registerRequest());

      const logout = await request(app)
        .post("/api/auth/logout")
        .set({ ...fromFreshClient(), cookie });

      expect(logout.status).toBe(204);

      const afterwards = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie });

      expect(afterwards.status).toBe(401);
    });

    it("succeeds when no cookie is present", async () => {
      const response = await request(app).post("/api/auth/logout").set(fromFreshClient());

      expect(response.status).toBe(204);
    });

    it("leaves the account's other sessions signed in", async () => {
      const laptop = refreshCookie(await registerRequest());

      const phoneLogin = await request(app)
        .post("/api/auth/login")
        .set(fromFreshClient())
        .send({ email: VALID_USER.email, password: VALID_USER.password });
      const phone = refreshCookie(phoneLogin);

      await request(app)
        .post("/api/auth/logout")
        .set({ ...fromFreshClient(), cookie: laptop });

      const stillSignedIn = await request(app)
        .post("/api/auth/refresh")
        .set({ ...fromFreshClient(), cookie: phone });

      expect(stillSignedIn.status).toBe(200);
    });
  });
});
