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

let actorCounter = 0;

async function signUp(): Promise<{ token: string; userId: string }> {
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
  return { token: body.accessToken, userId: body.user.id };
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

  it('rejects a request carrying no file under the "file" field', async () => {
    const actor = await signUp();

    const response = await request(app).post("/api/receipts").set(as(actor));

    expect(response.status).toBe(400);
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
});
