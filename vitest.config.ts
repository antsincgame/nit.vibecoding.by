import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(fileURLToPath(import.meta.url), "..");

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "~": resolve(root, "app"),
      "@shared": resolve(root, "shared"),
    },
  },
});
