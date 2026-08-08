import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { ReceiptContentType, ReceiptStatus } from "@resitku/shared";

import { env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { s3Client, sqsClient } from "../lib/aws-clients.js";
import { HttpError } from "../lib/http-error.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

export interface UploadedFile {
  buffer: Buffer;
  mimetype: ReceiptContentType;
  size: number;
}

export interface ReceiptView {
  id: string;
  status: ReceiptStatus;
  contentType: string;
  sizeBytes: number;
  parsedVendor: string | null;
  parsedAmountMinor: number | null;
  parsedCurrency: string | null;
  parsedDate: string | null;
  confidence: number | null;
  errorMessage: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

const RECEIPT_SELECT = {
  id: true,
  status: true,
  contentType: true,
  sizeBytes: true,
  parsedVendor: true,
  parsedAmountMinor: true,
  parsedCurrency: true,
  parsedDate: true,
  confidence: true,
  errorMessage: true,
  transactionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReceiptSelect;

type ReceiptRow = Prisma.ReceiptGetPayload<{ select: typeof RECEIPT_SELECT }>;

function toView(row: ReceiptRow): ReceiptView {
  return {
    ...row,
    parsedDate: row.parsedDate === null ? null : row.parsedDate.toISOString().slice(0, 10),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const EXTENSION_BY_CONTENT_TYPE: Record<ReceiptContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function createReceipt(userId: string, file: UploadedFile): Promise<ReceiptView> {
  const s3Key = `receipts/${userId}/${randomUUID()}.${EXTENSION_BY_CONTENT_TYPE[file.mimetype]}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.S3_RECEIPTS_BUCKET,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );

  let row: ReceiptRow;

  try {
    row = await prisma.receipt.create({
      data: { userId, s3Key, contentType: file.mimetype, sizeBytes: file.size },
      select: RECEIPT_SELECT,
    });
  } catch (error) {
    // Fail sudah berada di S3 tanpa baris yang merujuknya. Membersihkannya di
    // sini menukar kebocoran senyap kepada kes yang sembuh sendiri; kegagalan
    // pembersihan pula dibiarkan (ditangkap dan dibuang) supaya ralat asal
    // daripada Postgres yang sampai kepada pemanggil, bukan ralat S3 kedua.
    await s3Client
      .send(new DeleteObjectCommand({ Bucket: env.S3_RECEIPTS_BUCKET, Key: s3Key }))
      .catch(() => undefined);

    throw error;
  }

  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: env.SQS_RECEIPTS_QUEUE_URL,
        MessageBody: JSON.stringify({ receiptId: row.id }),
      }),
    );
  } catch (error) {
    // Baris resit sudah wujud dan fail sudah selamat, jadi memberitahu klien
    // bahawa muat naik gagal di sini akan menipu mereka dan mendorong muat
    // naik ulang yang mencipta salinan kedua. Ia kekal PENDING sehingga
    // mekanisme pemulihan (belum dibina, dicatat sebagai kerja akan datang)
    // mengesan dan menghantar semula.
    logger.error({ err: error, receiptId: row.id }, "Failed to enqueue receipt for processing");
  }

  return toView(row);
}

export async function listReceipts(userId: string): Promise<ReceiptView[]> {
  const rows = await prisma.receipt.findMany({
    where: { userId },
    select: RECEIPT_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toView);
}

export async function getReceipt(userId: string, id: string): Promise<ReceiptView> {
  const row = await prisma.receipt.findFirst({ where: { id, userId }, select: RECEIPT_SELECT });

  if (row === null) {
    throw HttpError.notFound("Receipt not found");
  }

  return toView(row);
}
