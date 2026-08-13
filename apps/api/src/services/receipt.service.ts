import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { ConfirmReceiptInput, ReceiptContentType, ReceiptStatus } from "@resitku/shared";

import { env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { s3Client, sqsClient } from "../lib/aws-clients.js";
import { HttpError } from "../lib/http-error.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import {
  requireOwnedCategory,
  TRANSACTION_SELECT,
  toTransactionView,
} from "./transaction.service.js";
import type { TransactionView } from "./transaction.service.js";

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

/// Menukar resit yang sudah dihurai menjadi transaksi sebenar. Dibalut dalam
/// satu prisma.$transaction supaya penciptaan baris transactions dan
/// penandaan receipts.transaction_id berlaku sebagai satu unit — kegagalan di
/// tengah-tengah (contohnya kategori tidak wujud) membatalkan kedua-duanya,
/// bukan meninggalkan transaksi yatim yang resitnya masih menunjuk ke mana-mana.
export async function confirmReceipt(
  userId: string,
  receiptId: string,
  input: ConfirmReceiptInput,
): Promise<TransactionView> {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findFirst({ where: { id: receiptId, userId } });

    if (receipt === null) {
      throw HttpError.notFound("Receipt not found");
    }

    if (receipt.transactionId !== null) {
      throw HttpError.conflict("Receipt is already linked to a transaction");
    }

    // PENDING/PROCESSING bermakna pekerja belum atau sedang menghurai fail —
    // tiada nilai OCR untuk dijadikan lalai lagi. FAILED masih dibenarkan
    // supaya pengguna boleh isi semua medan secara manual dan terus teruskan
    // tanpa menunggu pekerja cuba semula.
    if (receipt.status !== "PARSED" && receipt.status !== "FAILED") {
      throw HttpError.conflict("Receipt is still being processed");
    }

    const amountMinor = input.amount ?? receipt.parsedAmountMinor;

    if (amountMinor === null) {
      throw HttpError.badRequest("OCR could not detect an amount; provide one manually");
    }

    const occurredOn =
      input.occurredOn ??
      (receipt.parsedDate === null ? undefined : receipt.parsedDate.toISOString().slice(0, 10));

    if (occurredOn === undefined) {
      throw HttpError.badRequest("OCR could not detect a date; provide one manually");
    }

    const category = await requireOwnedCategory(userId, input.categoryId, tx);

    const transaction = await tx.transaction.create({
      data: {
        userId,
        categoryId: category.id,
        direction: category.type,
        amountMinor,
        currency: input.currency ?? receipt.parsedCurrency ?? "MYR",
        description: input.description ?? receipt.parsedVendor ?? undefined,
        occurredOn: new Date(occurredOn),
      },
      select: TRANSACTION_SELECT,
    });

    // Dua permintaan confirm serentak bagi resit yang SAMA kedua-duanya boleh
    // lulus semakan "transactionId !== null" di atas (belum ada yang commit
    // lagi), kedua-dua cipta baris transactions sendiri, lalu cuba menulis
    // ganti transactionId resit itu — yang commit dahulu "menang" dan yang
    // kedua menulis ganti secara senyap, meninggalkan transaksi pertama
    // sebagai yatim yang tidak dapat dicapai (dua caj berganda, satu tidak
    // kelihatan). WHERE Postgres pada UPDATE menyemak semula baris terkini
    // semasa mengambil kunci baris (READ COMMITTED), jadi hanya satu daripada
    // dua panggilan serentak akan mendapat count === 1; yang satu lagi
    // melontar konflik dan prisma.$transaction menggulung balik transaksi
    // yang baru dicipta itu sekali.
    const linked = await tx.receipt.updateMany({
      where: { id: receiptId, transactionId: null },
      data: { transactionId: transaction.id },
    });

    if (linked.count === 0) {
      throw HttpError.conflict("Receipt is already linked to a transaction");
    }

    return toTransactionView(transaction);
  });
}
