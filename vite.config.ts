import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    alias: {
      "~": "/app",
      "@shared": "/shared",
    },
    dedupe: ["react", "react-dom", "react-router", "@react-router/node"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router"],
  },
  ssr: {
    external: ["better-sqlite3"],
  },
});
