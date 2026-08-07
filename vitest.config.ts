import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["apps/api/src/test/global-setup.ts"],
    fileParallelism: false,
    env: {
      // A database of its own, so a test run can truncate freely without
      // touching whatever you were poking at in development. This string must
      // stay in step with TEST_DATABASE_URL in global-setup.ts.
      DATABASE_URL: "postgresql://resitku:resitku_local@localhost:5433/resitku_test?schema=public",
      JWT_ACCESS_SECRET: "test-only-secret-at-least-32-characters-long",
      LOG_LEVEL: "silent",
      AWS_REGION: "us-east-1",
      S3_RECEIPTS_BUCKET: "resitku-receipts",
      SQS_RECEIPTS_QUEUE_URL: "http://localhost:9324/000000000000/receipts",
    },
    coverage: {
      include: ["packages/*/src/**", "apps/*/src/**"],
      exclude: ["**/*.test.ts", "apps/api/src/generated/**", "apps/api/src/test/**"],
    },
  },
});
