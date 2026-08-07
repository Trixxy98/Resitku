import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";

import { env } from "../config/env.js";

export const s3Client = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.S3_ENDPOINT_URL,

  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

export const sqsClient = new SQSClient({
  region: env.AWS_REGION,
  endpoint: env.SQS_ENDPOINT_URL,
});
