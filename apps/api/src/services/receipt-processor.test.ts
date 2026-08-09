import { randomUUID } from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../config/env.js";
import { s3Client } from "../lib/aws-clients.js";
import { prisma } from "../lib/prisma.js";
import { resetDatabase } from "../test/database.js";
import { processReceiptMessage } from "./receipt-processor.js";

// PNG 1x1 piksel terkecil yang sah — lihat routes/receipts.test.ts untuk nota
// yang sama.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  "base64",
);

let userCounter = 0;

async function createUser(): Promise<string> {
  userCounter += 1;

  const user = await prisma.user.create({
    data: {
      email: `processor-user${String(userCounter)}@example.com`,
      name: "Rith",
      passwordHash: "not-a-real-hash",
    },
  });

  return user.id;
}

interface SeedOptions {
  status?: "PENDING" | "PROCESSING" | "PARSED" | "FAILED";
  withObjectInStorage?: boolean;
}

async function seedReceipt(options: SeedOptions = {}) {
  const { status = "PENDING", withObjectInStorage = true } = options;
  const userId = await createUser();
  const s3Key = `receipts/${userId}/${randomUUID()}.png`;

  if (withObjectInStorage) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.S3_RECEIPTS_BUCKET,
        Key: s3Key,
        Body: TINY_PNG,
        ContentType: "image/png",
      }),
    );
  }

  return prisma.receipt.create({
    data: { userId, s3Key, contentType: "image/png", sizeBytes: TINY_PNG.length, status },
  });
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("processReceiptMessage", () => {
  it("parses a pending receipt using the configured OCR provider", async () => {
    const receipt = await seedReceipt();

    await processReceiptMessage(receipt.id);

    const updated = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(updated.status).toBe("PARSED");
    expect(updated.parsedVendor).not.toBeNull();
    expect(updated.parsedAmountMinor).not.toBeNull();
    expect(updated.parsedCurrency).toBe("MYR");
    expect(updated.confidence).not.toBeNull();
    expect(updated.rawResult).not.toBeNull();
    expect(updated.processedAt).not.toBeNull();
    expect(updated.errorMessage).toBeNull();
  });

  it("marks the receipt FAILED when the S3 object is missing", async () => {
    const receipt = await seedReceipt({ withObjectInStorage: false });

    await processReceiptMessage(receipt.id);

    const updated = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.errorMessage).not.toBeNull();
    expect(updated.processedAt).not.toBeNull();
  });

  it("leaves an already-parsed receipt untouched (idempotent under redelivery)", async () => {
    const receipt = await seedReceipt({ status: "PARSED" });
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { parsedVendor: "Sedia Ada" },
    });

    await processReceiptMessage(receipt.id);

    const updated = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(updated.parsedVendor).toBe("Sedia Ada");
  });

  it("does nothing for a receipt id that no longer exists", async () => {
    await expect(processReceiptMessage(randomUUID())).resolves.toBeUndefined();
  });
});
