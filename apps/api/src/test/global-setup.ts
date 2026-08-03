import { execFileSync } from "node:child_process";
import path from "node:path";

import { Client } from "pg";

/// Must stay in step with test.env.DATABASE_URL in vitest.config.ts.
const TEST_DATABASE_URL =
  "postgresql://resitku:resitku_local@localhost:5433/resitku_test?schema=public";
const ADMIN_DATABASE_URL = "postgresql://resitku:resitku_local@localhost:5433/postgres";
const TEST_DATABASE_NAME = "resitku_test";

const apiRoot = path.resolve(import.meta.dirname, "..", "..");

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
}
