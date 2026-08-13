import { setTimeout as sleep } from "node:timers/promises";

import type { Message } from "@aws-sdk/client-sqs";
import { DeleteMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { sqsClient } from "./lib/aws-clients.js";
import { env } from "./config/env.js";
import { beginShutdown, isShuttingDown } from "./lib/lifecycle.js";
import { logger } from "./lib/logger.js";
import { disconnectDatabase } from "./lib/prisma.js";
import { processReceiptMessage } from "./services/receipt-processor.js";

const POLL_FAILURE_BACKOFF_MS = 5_000;

interface QueueMessage {
  receiptId: string;
}

function parseMessageBody(body: string | undefined): QueueMessage | undefined {
  if (body === undefined) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(body);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "receiptId" in parsed &&
      typeof parsed.receiptId === "string"
    ) {
      return parsed as QueueMessage;
    }
  } catch {
    // Falls through to the undefined return below.
  }

  return undefined;
}

async function deleteMessage(message: Message): Promise<void> {
  if (message.ReceiptHandle === undefined) {
    return;
  }

  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: env.SQS_RECEIPTS_QUEUE_URL,
      ReceiptHandle: message.ReceiptHandle,
    }),
  );
}

/// Dieksport berasingan daripada gelung tak terhingga di bawah supaya boleh
/// diuji terus dengan satu mesej pada satu masa.
export async function handleMessage(message: Message): Promise<void> {
  const payload = parseMessageBody(message.Body);

  if (payload === undefined) {
    logger.error({ body: message.Body }, "Discarding malformed receipt queue message");
    await deleteMessage(message);
    return;
  }

  try {
    await processReceiptMessage(payload.receiptId);
  } catch (error) {
    // Sengaja tidak dipadam: processReceiptMessage hanya melontar semula
    // apabila ia tidak sempat mula memproses (contohnya Postgres tidak
    // dapat dicapai). Membiarkan mesej di baris gilir bermakna had masa
    // ketampakan menghantarnya semula secara automatik sebaik isu infra
    // reda — tiada baris gilir mati (DLQ) lagi, jadi ini kekal cuba semula
    // selama-lamanya bagi kegagalan berterusan, yang cukup untuk MVP ini.
    logger.warn(
      { err: error, receiptId: payload.receiptId },
      "Could not start processing this receipt; leaving it on the queue for automatic retry",
    );
    return;
  }

  try {
    await deleteMessage(message);
  } catch (error) {
    // Berasingan daripada catch di atas: pemprosesan itu sendiri sudah
    // berjaya (status PARSED/FAILED sudah direkodkan) — cuma pemadaman
    // mesej yang gagal. Melaporkannya dengan mesej "tidak sempat mula
    // memproses" yang sama akan mengelirukan siasatan kelak. Penghantaran
    // semula selamat: semakan status idempoten dalam processReceiptMessage
    // akan melangkaunya sebaik ia tiba semula.
    logger.warn(
      { err: error, receiptId: payload.receiptId },
      "Receipt was processed but the queue message could not be deleted; it will be redelivered and skipped as already-handled",
    );
  }
}

async function pollOnce(): Promise<void> {
  const { Messages } = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: env.SQS_RECEIPTS_QUEUE_URL,
      MaxNumberOfMessages: 5,
      WaitTimeSeconds: 20,
    }),
  );

  if (Messages === undefined || Messages.length === 0) {
    return;
  }

  await Promise.all(Messages.map(handleMessage));
}

async function run(): Promise<void> {
  logger.info(
    { queueUrl: env.SQS_RECEIPTS_QUEUE_URL, ocrProvider: env.OCR_PROVIDER },
    "Receipt worker started",
  );

  while (!isShuttingDown()) {
    try {
      await pollOnce();
    } catch (error) {
      logger.error({ err: error }, "Poll cycle failed, retrying shortly");
      await sleep(POLL_FAILURE_BACKOFF_MS);
    }
  }

  await disconnectDatabase();
  logger.info("Receipt worker stopped");
  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Shutdown requested");
    beginShutdown();
  });
}

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled rejection");
  process.exit(1);
});

// worker.test.ts imports handleMessage directly and never reaches this,
// because Vitest never sets this env var; server.ts has no equivalent guard
// since createApp() there has no top-level side effects to avoid.
if (process.env["VITEST"] === undefined) {
  void run();
}
