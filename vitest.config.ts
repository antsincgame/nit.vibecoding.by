import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
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
