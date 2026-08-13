import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { MAX_RECEIPT_BYTES } from "@resitku/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { s3Client, sqsClient } from "../lib/aws-clients.js";
import { prisma } from "../lib/prisma.js";
import { resetDatabase } from "../test/database.js";
import { drainReceiptsQueue } from "../test/queue.js";

const app = createApp();

// PNG 1x1 piksel terkecil yang sah — bukan kandungan sebenar, tetapi cukup
// untuk membuktikan bait yang sampai ke S3 sepadan dengan bait yang dihantar.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  "base64",
);

interface ReceiptBody {
  id: string;
  status: "PENDING" | "PROCESSING" | "PARSED" | "FAILED";
  contentType: string;
  sizeBytes: number;
  transactionId: string | null;
  createdAt: string;
}

interface ListBody {
  receipts: ReceiptBody[];
}

let clientCounter = 0;

function fromFreshClient(): Record<string, string> {
  clientCounter += 1;
  return { "x-forwarded-for": `10.3.0.${String(clientCounter % 250)}` };
}

interface Actor {
  token: string;
  userId: string;
  expenseCategoryId: string;
}

let actorCounter = 0;

async function signUp(): Promise<Actor> {
  actorCounter += 1;

  const response = await request(app)
    .post("/api/auth/register")
    .set(fromFreshClient())
    .send({
      name: "Rith",
      email: `receipt-user${String(actorCounter)}@example.com`,
      password: "katalaluan-panjang-123",
    });

  expect(response.status).toBe(201);

  const body = response.body as { accessToken: string; user: { id: string } };

  // Pendaftaran menyalin lapan kategori permulaan ke akaun baharu — lihat
  // routes/transactions.test.ts untuk nota yang sama.
  const expense = await prisma.category.findFirstOrThrow({
    where: { userId: body.user.id, type: "EXPENSE" },
    select: { id: true },
  });

  return { token: body.accessToken, userId: body.user.id, expenseCategoryId: expense.id };
}

function as(actor: { token: string }): Record<string, string> {
  return { ...fromFreshClient(), authorization: `Bearer ${actor.token}` };
}

async function uploadReceipt(actor: { token: string }): Promise<ReceiptBody> {
  const response = await request(app)
    .post("/api/receipts")
    .set(as(actor))
    .attach("file", TINY_PNG, { filename: "resit.png", contentType: "image/png" });

  expect(response.status).toBe(201);
  return (response.body as { receipt: ReceiptBody }).receipt;
}

beforeEach(resetDatabase);
beforeEach(drainReceiptsQueue);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/receipts", () => {
  it("stores the file in S3 and a PENDING row in Postgres", async () => {
    const actor = await signUp();
    const receipt = await uploadReceipt(actor);

    expect(receipt.status).toBe("PENDING");
    expect(receipt.contentType).toBe("image/png");
    expect(receipt.sizeBytes).toBe(TINY_PNG.length);

    const row = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });
    const object = await s3Client.send(
      new HeadObjectCommand({ Bucket: env.S3_RECEIPTS_BUCKET, Key: row.s3Key }),
    );

    expect(object.ContentLength).toBe(TINY_PNG.length);
  });

  it("enqueues a message the worker can use to find the row", async () => {
    const actor = await signUp();
    const receipt = await uploadReceipt(actor);

    const { Messages } = await sqsClient.send(
      new ReceiveMessageCommand({ QueueUrl: env.SQS_RECEIPTS_QUEUE_URL, WaitTimeSeconds: 2 }),
    );

    expect(Messages).toHaveLength(1);

    const payload = JSON.parse(Messages?.[0]?.Body ?? "{}") as { receiptId: string };
    expect(payload.receiptId).toBe(receipt.id);
  });

  it("rejects a file type outside the allow-list", async () => {
    const actor = await signUp();

    const response = await request(app)
      .post("/api/receipts")
      .set(as(actor))
      .attach("file", Buffer.from("bukan imej"), {
        filename: "resit.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
  });

  it("rejects a file larger than the configured limit", async () => {
    const actor = await signUp();
    const oversized = Buffer.alloc(MAX_RECEIPT_BYTES + 1, 1);

    const response = await request(app)
      .post("/api/receipts")
      .set(as(actor))
      .attach("file", oversized, { filename: "besar.png", contentType: "image/png" });

    expect(response.status).toBe(400);
  });

  it("rejects bytes that are not actually an image even when declared as one", async () => {
    const actor = await signUp();

    const response = await request(app)
      .post("/api/receipts")
      .set(as(actor))
      .attach("file", Buffer.from("bukan imej langsung, cuma teks biasa"), {
        filename: "resit.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(400);
  });

  it('rejects a request carrying no file under the "file" field', async () => {
    const actor = await signUp();

    const response = await request(app).post("/api/receipts").set(as(actor));

    expect(response.status).toBe(400);
  });
});

describe("POST /api/receipts/:id/confirm", () => {
  async function markParsed(
    receiptId: string,
    overrides: Partial<{
      vendor: string | null;
      amountMinor: number | null;
      currency: string | null;
      date: string | null;
      status: "PARSED" | "FAILED";
    }> = {},
  ): Promise<void> {
    const {
      vendor = "Kedai Runcit Pak Cik",
      amountMinor = 1250,
      currency = "MYR",
      date = "2026-01-15",
      status = "PARSED",
    } = overrides;

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status,
        parsedVendor: vendor,
        parsedAmountMinor: amountMinor,
        parsedCurrency: currency,
        parsedDate: date === null ? null : new Date(date),
      },
    });
  }

  it("creates a transaction from the OCR result and links it back to the receipt", async () => {
    const actor = await signUp();
    const receipt = await uploadReceipt(actor);
    await markParsed(receipt.id);

    const response = await request(app)
      .post(`/api/receipts/${receipt.id}/confirm`)
      .set(as(actor))
      .send({ categoryId: actor.expenseCategoryId });

    expect(response.status).toBe(201);

    const body = response.body as {
      transaction: {
        id: string;
        amountMinor: number;
        currency: string;
        description: string | null;
        occurredOn: string;
      };
    };
    expect(body.transaction.amountMinor).toBe(1250);
    expect(body.transaction.currency).toBe("MYR");
    expect(body.transaction.description).toBe("Kedai Runcit Pak Cik");
    expect(body.transaction.occurredOn).toBe("2026-01-15");

    const updatedReceipt = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(updatedReceipt.transactionId).toBe(body.transaction.id);
  });

  it("lets the caller override every OCR-derived field", async () => {
    const actor = await signUp();
    const receipt = await uploadReceipt(actor);
    await markParsed(receipt.id);

    const response = await request(app)
      .post(`/api/receipts/${receipt.id}/confirm`)
      .set(as(actor))
      .send({
        categoryId: actor.expenseCategoryId,
        amount: "99.90",
        currency: "USD",
        description: "Dinner betul-betul",
        occurredOn: "2026-02-01",
      });

    expect(response.status).toBe(201);

    const body = response.body as {
      transaction: {
        amountMinor: number;
        currency: string;
        description: string | null;
        occurredOn: string;
      };
    };
    expect(body.transaction.amountMinor).toBe(9990);
    expect(body.transaction.currency).toBe("USD");
    expect(body.transaction.description).toBe("Dinner betul-betul");
    expect(body.transaction.occurredOn).toBe("2026-02-01");
  });

  it("rejects confirming a receipt that is still pending", async () => {
    const actor = await signUp();
    const receipt = await uploadReceipt(actor);

    const response = await request(app)
      .post(`/api/receipts/${receipt.id}/confirm`)
      .set(as(actor))
      .send({ categoryId: actor.expenseCategoryId });

    expect(response.status).toBe(409);
  });

  it("rejects confirming the same receipt a second time", async () => {
    const actor = await signUp();
    const receipt = await uploadReceipt(actor);
    await markParsed(receipt.id);

    const first = await request(app)
      .post(`/api/receipts/${receipt.id}/confirm`)
      .set(as(actor))
      .send({ categoryId: actor.expenseCategoryId });

    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/receipts/${receipt.id}/confirm`)
      .set(as(actor))
      .send({ categoryId: actor.expenseCategoryId });

    expect(second.status).toBe(409);
  });

  it("requires a manual amount and date when OCR failed to detect them", async () => {
    const actor = await signUp();
    const receipt = await uploadReceipt(actor);
    await markParsed(receipt.id, {
      status: "FAILED",
      vendor: null,
      amountMinor: null,
      currency: null,
      date: null,
    });

    const withoutOverrides = await request(app)
      .post(`/api/receipts/${receipt.id}/confirm`)
      .set(as(actor))
      .send({ categoryId: actor.expenseCategoryId });

    expect(withoutOverrides.status).toBe(400);

    const withOverrides = await request(app)
      .post(`/api/receipts/${receipt.id}/confirm`)
      .set(as(actor))
      .send({ categoryId: actor.expenseCategoryId, amount: "10.00", occurredOn: "2026-03-01" });

    expect(withOverrides.status).toBe(201);
  });
});

describe("ownership", () => {
  it("hides another account's receipt behind a 404", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const receipt = await uploadReceipt(owner);

    const response = await request(app).get(`/api/receipts/${receipt.id}`).set(as(stranger));

    expect(response.status).toBe(404);
  });

  it("keeps one account's list out of another's", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    await uploadReceipt(owner);

    const response = await request(app).get("/api/receipts").set(as(stranger));

    expect((response.body as ListBody).receipts).toHaveLength(0);
  });

  it("refuses a request carrying no token", async () => {
    const response = await request(app).get("/api/receipts").set(fromFreshClient());

    expect(response.status).toBe(401);
  });

  it("hides another account's receipt behind a 404 when confirming", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const receipt = await uploadReceipt(owner);

    const response = await request(app)
      .post(`/api/receipts/${receipt.id}/confirm`)
      .set(as(stranger))
      .send({ categoryId: stranger.expenseCategoryId });

    expect(response.status).toBe(404);
  });
});
