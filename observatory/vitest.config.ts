import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.ts"],
      exclude: ["scripts/generate-site.ts", "scripts/migrate.ts"],
    },
  },
});
