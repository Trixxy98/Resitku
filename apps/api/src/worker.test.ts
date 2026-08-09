import { randomUUID } from "node:crypto";

import { ReceiveMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { Message } from "@aws-sdk/client-sqs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "./config/env.js";
import { sqsClient } from "./lib/aws-clients.js";
import { prisma } from "./lib/prisma.js";
import { resetDatabase } from "./test/database.js";
import { drainReceiptsQueue } from "./test/queue.js";
import { handleMessage } from "./worker.js";

async function sendAndReceive(body: string): Promise<Message> {
  await sqsClient.send(
    new SendMessageCommand({ QueueUrl: env.SQS_RECEIPTS_QUEUE_URL, MessageBody: body }),
  );

  // VisibilityTimeout: 0 di sini sengaja — supaya jika handleMessage TIDAK
  // memadamnya, ia kelihatan semula serta-merta dan isQueueEmpty() di bawah
  // dapat mengesannya, bukan sekadar tersembunyi oleh had ketampakan terima
  // ini sendiri.
  const { Messages } = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: env.SQS_RECEIPTS_QUEUE_URL,
      WaitTimeSeconds: 1,
      VisibilityTimeout: 0,
    }),
  );

  const message = Messages?.[0];
  if (message === undefined) {
    throw new Error("Test setup failed: message never arrived on the queue");
  }

  return message;
}

async function isQueueEmpty(): Promise<boolean> {
  const { Messages } = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: env.SQS_RECEIPTS_QUEUE_URL,
      WaitTimeSeconds: 1,
      VisibilityTimeout: 0,
    }),
  );

  return Messages === undefined || Messages.length === 0;
}

beforeEach(resetDatabase);
beforeEach(drainReceiptsQueue);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("handleMessage", () => {
  it("deletes a malformed message instead of leaving it stuck on the queue", async () => {
    const message = await sendAndReceive("not json at all");

    await handleMessage(message);

    expect(await isQueueEmpty()).toBe(true);
  });

  it("processes a valid message and deletes it once the receipt is handled", async () => {
    const user = await prisma.user.create({
      data: { email: `worker-user-${randomUUID()}@example.com`, name: "Rith", passwordHash: "x" },
    });

    // Status FAILED bermakna processReceiptMessage cuma melangkauinya (baris
    // ini bukan menguji hasil pemprosesan itu sendiri — itu tanggungjawab
    // receipt-processor.test.ts) dan pulang tanpa melontar apa-apa, jadi
    // tiada objek S3 diperlukan untuk ujian ini.
    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        s3Key: `receipts/${user.id}/${randomUUID()}.png`,
        contentType: "image/png",
        sizeBytes: 10,
        status: "FAILED",
      },
    });

    const message = await sendAndReceive(JSON.stringify({ receiptId: receipt.id }));

    await handleMessage(message);

    expect(await isQueueEmpty()).toBe(true);
  });

  it("leaves the message on the queue when processing cannot even start", async () => {
    const message = await sendAndReceive(JSON.stringify({ receiptId: "not-a-real-uuid" }));

    await handleMessage(message);

    expect(await isQueueEmpty()).toBe(false);
  });
});
