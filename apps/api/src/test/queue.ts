import { DeleteMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { env } from "../config/env.js";
import { sqsClient } from "../lib/aws-clients.js";

export async function drainReceiptsQueue(): Promise<void> {
  for (;;) {
    const { Messages } = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: env.SQS_RECEIPTS_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 0,
      }),
    );

    if (Messages === undefined || Messages.length === 0) {
      return;
    }

    await Promise.all(
      Messages.map((message) =>
        sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: env.SQS_RECEIPTS_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
          }),
        ),
      ),
    );
  }
}
