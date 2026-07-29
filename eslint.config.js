import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "apps/api/src/generated/**",
      "apps/api/prisma/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js", "vitest.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
    },
  },
  {
    files: ["**/prisma/seed.ts", "**/*.test.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["eslint.config.js", "vitest.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { "no-console": "off" },
  },
);
