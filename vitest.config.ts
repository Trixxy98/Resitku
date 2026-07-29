import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
    coverage: {
      include: ["packages/*/src/**", "apps/*/src/**"],
      exclude: ["**/*.test.ts", "apps/api/src/generated/**"],
    },
  },
});
