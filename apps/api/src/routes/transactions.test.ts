import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDatabase } from "../test/database.js";

const app = createApp();

interface TransactionBody {
  id: string;
  direction: "INCOME" | "EXPENSE";
  amountMinor: number;
  currency: string;
  description: string | null;
  occurredOn: string;
  status: "DRAFT" | "CONFIRMED";
  category: { id: string; name: string; type: "INCOME" | "EXPENSE" };
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: TransactionBody[];
  nextCursor: string | null;
}

interface Actor {
  token: string;
  userId: string;
  expenseCategoryId: string;
  incomeCategoryId: string;
}

/// Each request claims its own client address, so express-rate-limit buckets on
/// it and no test can spend another test's budget.
let clientCounter = 0;

function fromFreshClient(): Record<string, string> {
  clientCounter += 1;
  return { "x-forwarded-for": `10.1.0.${String(clientCounter % 250)}` };
}

let actorCounter = 0;

/// Mendaftar melalui API sebenar dan bukan menyuntik baris terus ke database,
/// supaya setiap test bermula daripada keadaan yang benar-benar boleh dicapai
/// oleh pengguna, lengkap dengan lapan kategori permulaannya.
async function signUp(): Promise<Actor> {
  actorCounter += 1;

  const response = await request(app)
    .post("/api/auth/register")
    .set(fromFreshClient())
    .send({
      name: "Rith",
      email: `user${String(actorCounter)}@example.com`,
      password: "katalaluan-panjang-123",
    });

  expect(response.status).toBe(201);

  const body = response.body as { accessToken: string; user: { id: string } };

  const categories = await prisma.category.findMany({
    where: { userId: body.user.id },
    select: { id: true, type: true },
    orderBy: { name: "asc" },
  });

  const expense = categories.find((category) => category.type === "EXPENSE");
  const income = categories.find((category) => category.type === "INCOME");

  if (expense === undefined || income === undefined) {
    throw new Error("registration did not create the starter categories");
  }

  return {
    token: body.accessToken,
    userId: body.user.id,
    expenseCategoryId: expense.id,
    incomeCategoryId: income.id,
  };
}

function as(actor: Actor): Record<string, string> {
  return { ...fromFreshClient(), authorization: `Bearer ${actor.token}` };
}

async function addTransaction(
  actor: Actor,
  overrides: Record<string, unknown> = {},
): Promise<TransactionBody> {
  const response = await request(app)
    .post("/api/transactions")
    .set(as(actor))
    .send({
      categoryId: actor.expenseCategoryId,
      amount: "12.34",
      description: "Nasi lemak",
      occurredOn: "2026-08-05",
      ...overrides,
    });

  expect(response.status).toBe(201);
  return (response.body as { transaction: TransactionBody }).transaction;
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("ownership", () => {
  it("hides another account's transaction behind a 404", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const transaction = await addTransaction(owner);

    const read = await request(app).get(`/api/transactions/${transaction.id}`).set(as(stranger));
    const patch = await request(app)
      .patch(`/api/transactions/${transaction.id}`)
      .set(as(stranger))
      .send({ amount: "999.00" });
    const remove = await request(app)
      .delete(`/api/transactions/${transaction.id}`)
      .set(as(stranger));

    // 404 dan bukan 403. 403 mengesahkan bahawa id itu wujud di suatu tempat.
    expect(read.status).toBe(404);
    expect(patch.status).toBe(404);
    expect(remove.status).toBe(404);

    const owned = await request(app).get(`/api/transactions/${transaction.id}`).set(as(owner));

    expect(owned.status).toBe(200);
    expect((owned.body as { transaction: TransactionBody }).transaction.amountMinor).toBe(1234);
  });

  it("refuses a category belonging to somebody else", async () => {
    const stranger = await signUp();
    const actor = await signUp();

    const response = await request(app).post("/api/transactions").set(as(actor)).send({
      categoryId: stranger.expenseCategoryId,
      amount: "12.34",
      occurredOn: "2026-08-05",
    });

    expect(response.status).toBe(400);
  });

  it("keeps one account's list out of another's", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    await addTransaction(owner);

    const response = await request(app).get("/api/transactions").set(as(stranger));

    expect((response.body as PageBody).items).toHaveLength(0);
  });

  it("refuses a request carrying no token", async () => {
    const response = await request(app).get("/api/transactions").set(fromFreshClient());

    expect(response.status).toBe(401);
  });
});

describe("POST /api/transactions", () => {
  it("stores decimal input as integer minor units", async () => {
    const actor = await signUp();

    expect((await addTransaction(actor, { amount: "12.34" })).amountMinor).toBe(1234);
    expect((await addTransaction(actor, { amount: "0.05" })).amountMinor).toBe(5);
    expect((await addTransaction(actor, { amount: 12.3 })).amountMinor).toBe(1230);
  });

  it("rejects anything that is not a positive money amount", async () => {
    const actor = await signUp();

    for (const amount of ["0", "-5.00", "1.234", "abc", ""]) {
      const response = await request(app)
        .post("/api/transactions")
        .set(as(actor))
        .send({ categoryId: actor.expenseCategoryId, amount, occurredOn: "2026-08-05" });

      expect(response.status, `amount ${JSON.stringify(amount)}`).toBe(400);
    }
  });

  it("takes the direction from the category", async () => {
    const actor = await signUp();

    expect((await addTransaction(actor)).direction).toBe("EXPENSE");
    expect((await addTransaction(actor, { categoryId: actor.incomeCategoryId })).direction).toBe(
      "INCOME",
    );
  });

  it("keeps that direction when the category is reclassified later", async () => {
    const actor = await signUp();
    const transaction = await addTransaction(actor);

    await prisma.category.update({
      where: { id: actor.expenseCategoryId },
      data: { type: "INCOME" },
    });

    const response = await request(app).get(`/api/transactions/${transaction.id}`).set(as(actor));

    // Sejarah tidak bergerak. Baris ini merekodkan apa yang berlaku ketika itu.
    expect((response.body as { transaction: TransactionBody }).transaction.direction).toBe(
      "EXPENSE",
    );
  });

  it("returns occurredOn as a plain date", async () => {
    const actor = await signUp();

    // Bukan cap masa ISO: klien di timur atau barat UTC akan memaparkan hari
    // yang salah daripada salah satu daripadanya.
    expect((await addTransaction(actor, { occurredOn: "2026-01-31" })).occurredOn).toBe(
      "2026-01-31",
    );
  });

  it("rejects an id in the path that is not a uuid", async () => {
    const actor = await signUp();

    const response = await request(app).get("/api/transactions/bukan-uuid").set(as(actor));

    expect(response.status).toBe(400);
  });
});

describe("GET /api/transactions", () => {
  it("returns the most recent day first", async () => {
    const actor = await signUp();

    await addTransaction(actor, { occurredOn: "2026-07-01" });
    await addTransaction(actor, { occurredOn: "2026-08-05" });

    const response = await request(app).get("/api/transactions").set(as(actor));

    expect((response.body as PageBody).items.map((item) => item.occurredOn)).toEqual([
      "2026-08-05",
      "2026-07-01",
    ]);
  });

  it("narrows by date range, direction and category", async () => {
    const actor = await signUp();

    await addTransaction(actor, { occurredOn: "2026-07-01" });
    await addTransaction(actor, { occurredOn: "2026-08-05" });
    await addTransaction(actor, {
      occurredOn: "2026-08-20",
      categoryId: actor.incomeCategoryId,
    });

    const august = await request(app)
      .get("/api/transactions")
      .set(as(actor))
      .query({ from: "2026-08-01", to: "2026-08-31" });

    const income = await request(app)
      .get("/api/transactions")
      .set(as(actor))
      .query({ direction: "INCOME" });

    const byCategory = await request(app)
      .get("/api/transactions")
      .set(as(actor))
      .query({ categoryId: actor.expenseCategoryId });

    expect((august.body as PageBody).items).toHaveLength(2);
    expect((income.body as PageBody).items).toHaveLength(1);
    expect((byCategory.body as PageBody).items).toHaveLength(2);
  });

  it("pages through rows that share a date without skipping or repeating", async () => {
    const actor = await signUp();

    for (let index = 0; index < 5; index += 1) {
      await addTransaction(actor, { amount: `${String(index + 1)}.00`, occurredOn: "2026-08-05" });
    }

    const seen: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 5; page += 1) {
      const query = cursor === null ? { limit: "2" } : { limit: "2", cursor };

      const response = await request(app).get("/api/transactions").set(as(actor)).query(query);

      expect(response.status).toBe(200);

      const body = response.body as PageBody;
      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;

      if (cursor === null) {
        break;
      }
    }

    // Lima baris berkongsi hari yang sama, jadi hanya pemutus seri id yang
    // menghalang satu daripadanya daripada dilangkau atau dihantar dua kali.
    expect(cursor).toBeNull();
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });
});

describe("PATCH /api/transactions/:id", () => {
  it("moves the direction along with the category", async () => {
    const actor = await signUp();
    const transaction = await addTransaction(actor);

    const response = await request(app)
      .patch(`/api/transactions/${transaction.id}`)
      .set(as(actor))
      .send({ categoryId: actor.incomeCategoryId });

    expect(response.status).toBe(200);

    const updated = (response.body as { transaction: TransactionBody }).transaction;
    expect(updated.category.id).toBe(actor.incomeCategoryId);
    expect(updated.direction).toBe("INCOME");
  });

  it("clears the description when sent null", async () => {
    const actor = await signUp();
    const transaction = await addTransaction(actor, { description: "Nasi lemak" });

    const response = await request(app)
      .patch(`/api/transactions/${transaction.id}`)
      .set(as(actor))
      .send({ description: null });

    expect((response.body as { transaction: TransactionBody }).transaction.description).toBeNull();
  });

  it("rejects a body with nothing in it", async () => {
    const actor = await signUp();
    const transaction = await addTransaction(actor);

    const response = await request(app)
      .patch(`/api/transactions/${transaction.id}`)
      .set(as(actor))
      .send({});

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/transactions/:id", () => {
  it("hides the transaction but keeps the row", async () => {
    const actor = await signUp();
    const transaction = await addTransaction(actor);

    const removed = await request(app).delete(`/api/transactions/${transaction.id}`).set(as(actor));
    expect(removed.status).toBe(204);

    const read = await request(app).get(`/api/transactions/${transaction.id}`).set(as(actor));
    const list = await request(app).get("/api/transactions").set(as(actor));

    expect(read.status).toBe(404);
    expect((list.body as PageBody).items).toHaveLength(0);

    const row = await prisma.transaction.findUnique({
      where: { id: transaction.id },
      select: { deletedAt: true },
    });

    // Resit yang mungkin menunjuk ke baris ini masih ada sesuatu untuk dirujuk.
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it("refuses to delete the same transaction twice", async () => {
    const actor = await signUp();
    const transaction = await addTransaction(actor);

    await request(app).delete(`/api/transactions/${transaction.id}`).set(as(actor));
    const second = await request(app).delete(`/api/transactions/${transaction.id}`).set(as(actor));

    expect(second.status).toBe(404);
  });
});
