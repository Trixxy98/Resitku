import { GetObjectCommand } from "@aws-sdk/client-s3";
import { isReceiptContentType } from "@resitku/shared";

import { env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { s3Client } from "../lib/aws-clients.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { createOcrProvider } from "./ocr/index.js";

const ocrProvider = createOcrProvider();

const STALE_PROCESSING_MS = 5 * 60 * 1000;

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

  // Klaim baris ini secara atomik dengan syarat WHERE pada status semasa
  // tulisan, bukan menyemak status secara berasingan (baca) lalu menulis
  // PROCESSING selepas itu. Penghantaran sekurang-kurangnya sekali SQS
  // bermakna mesej yang sama boleh sampai dua kali serentak (Promise.all
  // dalam worker.ts memproses satu tempoh tinjauan bersama-sama); semakan
  // baca-dahulu yang lama membuka tingkap perlumbaan di mana kedua-dua
  // panggilan membaca PENDING sebelum sesiapa menulis, dan kedua-duanya
  // meneruskan pemprosesan fail yang sama dua kali. WHERE Postgres pada
  // UPDATE dinilai semula pada baris terkini semasa mengambil kunci baris,
  // jadi hanya satu panggilan serentak akan mendapat count === 1.
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  const claim = await prisma.receipt.updateMany({
    where: {
      id: receiptId,
      OR: [
        { status: "PENDING" },
        {
          status: "PROCESSING",
          processingStartedAt: { lte: staleCutoff },
        },
        {
          status: "PROCESSING",
          processingStartedAt: null,
        },
      ],
    },
    data: {
      status: "PROCESSING",
      processingStartedAt: new Date(),
    },
  });

  if (claim.count === 0) {
    logger.info({ receiptId }, "Skipping receipt that is no longer pending");
    return;
  }

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

    try {
      await prisma.receipt.update({
        where: { id: receiptId },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown OCR failure",
          processedAt: new Date(),
        },
      });
    } catch (updateError) {
      // Kontrak fungsi ini (lihat dokblok di atas) adalah ia tidak pernah
      // melontar semula selepas mencapai PROCESSING. Kegagalan menulis
      // status FAILED bermakna resit ini kekal tersekat pada PROCESSING
      // (tiada mekanisme cuba semula automatik untuk kes ini lagi), tetapi
      // melontar semula di sini akan melanggar kontrak itu dan menyebabkan
      // worker.ts melog seolah-olah pemprosesan tidak pernah bermula.
      logger.error(
        { err: updateError, receiptId },
        "Failed to record FAILED status after processing error; receipt is stuck on PROCESSING",
      );
    }
  }
}
