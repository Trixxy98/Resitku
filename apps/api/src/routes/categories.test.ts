import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDatabase } from "../test/database.js";

const app = createApp();

interface CategoryBody {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ErrorBody {
  error: { code: string; message: string };
}

let clientCounter = 0;

function fromFreshClient(): Record<string, string> {
  clientCounter += 1;
  return { "x-forwarded-for": `10.2.0.${String(clientCounter % 250)}` };
}

let actorCounter = 0;

async function signUp(): Promise<{ token: string; userId: string }> {
  actorCounter += 1;

  const response = await request(app)
    .post("/api/auth/register")
    .set(fromFreshClient())
    .send({
      name: "Rith",
      email: `cat-user${String(actorCounter)}@example.com`,
      password: "katalaluan-panjang-123",
    });

  expect(response.status).toBe(201);

  const body = response.body as { accessToken: string; user: { id: string } };
  return { token: body.accessToken, userId: body.user.id };
}

function as(actor: { token: string }): Record<string, string> {
  return { ...fromFreshClient(), authorization: `Bearer ${actor.token}` };
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/categories", () => {
  it("creates a category owned by the caller", async () => {
    const actor = await signUp();

    const response = await request(app)
      .post("/api/categories")
      .set(as(actor))
      .send({ name: "Hobi", type: "EXPENSE", color: "#123abc" });

    expect(response.status).toBe(201);

    const body = (response.body as { category: CategoryBody }).category;
    expect(body.name).toBe("Hobi");
    expect(body.type).toBe("EXPENSE");
  });

  it("rejects a name that already exists for this account", async () => {
    const actor = await signUp();

    // "Makanan" comes from the starter set created at registration.
    const response = await request(app)
      .post("/api/categories")
      .set(as(actor))
      .send({ name: "Makanan", type: "EXPENSE" });

    expect(response.status).toBe(409);
  });

  it("allows the same name across two different accounts", async () => {
    const first = await signUp();
    const second = await signUp();

    await prisma.category.deleteMany({ where: { userId: first.userId, name: "Hobi" } });

    const response = await request(app)
      .post("/api/categories")
      .set(as(second))
      .send({ name: "Hobi Unik", type: "EXPENSE" });

    expect(response.status).toBe(201);
  });

  it("rejects a colour that is not a hex code", async () => {
    const actor = await signUp();

    const response = await request(app)
      .post("/api/categories")
      .set(as(actor))
      .send({ name: "Hobi", type: "EXPENSE", color: "blue" });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/categories", () => {
  it("returns only the caller's categories", async () => {
    const owner = await signUp();
    const stranger = await signUp();

    await request(app)
      .post("/api/categories")
      .set(as(owner))
      .send({ name: "Hobi", type: "EXPENSE" });

    const response = await request(app).get("/api/categories").set(as(stranger));

    const names = (response.body as { categories: CategoryBody[] }).categories.map((c) => c.name);
    expect(names).not.toContain("Hobi");
  });

  it("includes the starter categories created at registration", async () => {
    const actor = await signUp();

    const response = await request(app).get("/api/categories").set(as(actor));

    expect((response.body as { categories: CategoryBody[] }).categories).toHaveLength(8);
  });
});

describe("PATCH /api/categories/:id", () => {
  it("renames a category owned by the caller", async () => {
    const actor = await signUp();
    const created = await request(app)
      .post("/api/categories")
      .set(as(actor))
      .send({ name: "Hobi", type: "EXPENSE" });
    const category = (created.body as { category: CategoryBody }).category;

    const response = await request(app)
      .patch(`/api/categories/${category.id}`)
      .set(as(actor))
      .send({ name: "Hobi Baharu" });

    expect(response.status).toBe(200);
    expect((response.body as { category: CategoryBody }).category.name).toBe("Hobi Baharu");
  });

  it("hides another account's category behind a 404", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const created = await request(app)
      .post("/api/categories")
      .set(as(owner))
      .send({ name: "Hobi", type: "EXPENSE" });
    const category = (created.body as { category: CategoryBody }).category;

    const response = await request(app)
      .patch(`/api/categories/${category.id}`)
      .set(as(stranger))
      .send({ name: "Curi" });

    expect(response.status).toBe(404);
  });

  it("rejects an attempt to change type, since it is not part of the schema", async () => {
    const actor = await signUp();
    const created = await request(app)
      .post("/api/categories")
      .set(as(actor))
      .send({ name: "Hobi", type: "EXPENSE" });
    const category = (created.body as { category: CategoryBody }).category;

    const response = await request(app)
      .patch(`/api/categories/${category.id}`)
      .set(as(actor))
      .send({ type: "INCOME" });

    // Zod strips unknown-shaped input down to nothing here, and the refine
    // step then rejects the now-empty body.
    expect(response.status).toBe(400);
  });

  it("rejects a body with nothing in it", async () => {
    const actor = await signUp();
    const created = await request(app)
      .post("/api/categories")
      .set(as(actor))
      .send({ name: "Hobi", type: "EXPENSE" });
    const category = (created.body as { category: CategoryBody }).category;

    const response = await request(app)
      .patch(`/api/categories/${category.id}`)
      .set(as(actor))
      .send({});

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/categories/:id", () => {
  it("deletes a category that has no transactions", async () => {
    const actor = await signUp();
    const created = await request(app)
      .post("/api/categories")
      .set(as(actor))
      .send({ name: "Hobi", type: "EXPENSE" });
    const category = (created.body as { category: CategoryBody }).category;

    const response = await request(app).delete(`/api/categories/${category.id}`).set(as(actor));

    expect(response.status).toBe(204);
  });

  it("refuses to delete a category with transactions under it", async () => {
    const actor = await signUp();
    const categories = await prisma.category.findMany({
      where: { userId: actor.userId, type: "EXPENSE" },
      select: { id: true },
    });
    const categoryId = categories[0]?.id;

    if (categoryId === undefined) {
      throw new Error("expected a starter expense category");
    }

    await request(app)
      .post("/api/transactions")
      .set(as(actor))
      .send({ categoryId, amount: "10.00", occurredOn: "2026-08-05" });

    const response = await request(app).delete(`/api/categories/${categoryId}`).set(as(actor));

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe("CONFLICT");
  });

  it("hides another account's category behind a 404", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const created = await request(app)
      .post("/api/categories")
      .set(as(owner))
      .send({ name: "Hobi", type: "EXPENSE" });
    const category = (created.body as { category: CategoryBody }).category;

    const response = await request(app).delete(`/api/categories/${category.id}`).set(as(stranger));

    expect(response.status).toBe(404);
  });
});
