import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
