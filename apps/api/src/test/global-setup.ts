import { execFileSync } from "node:child_process";
import path from "node:path";

import { Client } from "pg";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";

/// Must stay in step with test.env.DATABASE_URL in vitest.config.ts.
const TEST_DATABASE_URL =
  "postgresql://resitku:resitku_local@localhost:5433/resitku_test?schema=public";
const ADMIN_DATABASE_URL = "postgresql://resitku:resitku_local@localhost:5433/postgres";
const TEST_DATABASE_NAME = "resitku_test";

const apiRoot = path.resolve(import.meta.dirname, "..", "..");

async function verifyReceiptStorage(): Promise<void> {
  const credentials = { accessKeyId: "resitku", secretAccessKey: "resitku_local" };
  const s3 = new S3Client({
    region: "us-east-1",
    endpoint: "http://localhost:9000",
    forcePathStyle: true,
    credentials,
  });
  const sqs = new SQSClient({
    region: "us-east-1",
    endpoint: "http://localhost:9324",
    credentials,
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: "resitku-receipts-test" }));
    await sqs.send(new GetQueueUrlCommand({ QueueName: "receipts-test" }));
  } catch (error) {
    throw new Error(
      "MinIO/ElasticMQ tidak dapat dicapai di localhost:9000/9324. Jalankan `npm run storage:up` dahulu.",
      { cause: error },
    );
  }
}

export async function setup(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();

  try {
    const existing = await admin.query("select 1 from pg_database where datname = $1", [
      TEST_DATABASE_NAME,
    ]);

    if (existing.rowCount === 0) {
      // Identifiers cannot be parameterised. The name is a constant in this
      // file and never reaches here from input.
      await admin.query(`create database "${TEST_DATABASE_NAME}"`);
    }
  } finally {
    await admin.end();
  }

  // Applies the real migration files rather than pushing the schema, so a
  // broken migration fails here instead of during a deploy to RDS.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
  await verifyReceiptStorage();
}
