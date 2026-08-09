import { GetObjectCommand } from "@aws-sdk/client-s3";
import { isReceiptContentType } from "@resitku/shared";

import { env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { s3Client } from "../lib/aws-clients.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { createOcrProvider } from "./ocr/index.js";

const ocrProvider = createOcrProvider();

/// Memproses satu resit yang dirujuk oleh mesej baris gilir. Direka untuk
/// dipanggil sekali bagi setiap mesej yang diterima oleh worker.ts, tetapi
/// diasingkan ke fail ini supaya boleh diuji secara terus tanpa gelung SQS.
///
/// Melontar semula ralat HANYA bermaksud "tidak sempat mula memproses"
/// (contohnya Postgres tidak dapat dicapai semasa membaca baris) — dalam kes
/// itu tiada apa yang direkodkan lagi, jadi selamat untuk pemanggil
/// membiarkan mesej itu di baris gilir untuk dihantar semula secara automatik.
/// Sebarang kegagalan SELEPAS status ditukar kepada PROCESSING direkodkan
/// sebagai FAILED dan TIDAK dilontar semula, kerana penghantaran semula mesej
/// yang sama tidak berguna — semakan status di bawah akan cuma melangkauinya.
export async function processReceiptMessage(receiptId: string): Promise<void> {
  const receipt = await prisma.receipt.findUnique({ where: { id: receiptId } });

  if (receipt === null) {
    logger.warn({ receiptId }, "Receipt referenced by queue message no longer exists");
    return;
  }

  if (receipt.status !== "PENDING") {
    // Penghantaran sekurang-kurangnya sekali SQS bermakna mesej yang sama
    // boleh sampai dua kali. Apa-apa selain PENDING sudah/sedang ditangani.
    logger.info(
      { receiptId, status: receipt.status },
      "Skipping receipt that is no longer pending",
    );
    return;
  }

  await prisma.receipt.update({ where: { id: receiptId }, data: { status: "PROCESSING" } });

  try {
    if (!isReceiptContentType(receipt.contentType)) {
      // Tidak patut berlaku — POST /api/receipts menolak jenis lain — tetapi
      // ini menutup kemungkinan data lama daripada menggagalkan worker
      // dengan cara yang tidak jelas.
      throw new Error(`Unsupported stored content type: ${receipt.contentType}`);
    }

    const object = await s3Client.send(
      new GetObjectCommand({ Bucket: env.S3_RECEIPTS_BUCKET, Key: receipt.s3Key }),
    );

    if (object.Body === undefined) {
      throw new Error("S3 object has no body");
    }

    const buffer = Buffer.from(await object.Body.transformToByteArray());
    const { result, raw } = await ocrProvider.extract({ buffer, contentType: receipt.contentType });

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: "PARSED",
        parsedVendor: result.vendor,
        parsedAmountMinor: result.amountMinor,
        parsedCurrency: result.currency,
        parsedDate: result.occurredOn === null ? null : new Date(result.occurredOn),
        confidence: result.confidence,
        rawResult: raw as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });

    logger.info({ receiptId }, "Receipt parsed");
  } catch (error) {
    logger.error({ err: error, receiptId }, "Receipt processing failed");

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown OCR failure",
        processedAt: new Date(),
      },
    });
  }
}
