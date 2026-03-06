import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "tests/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "~": "/home/claude/nit/app",
      "@shared": "/home/claude/nit/shared",
    },
  },
});
