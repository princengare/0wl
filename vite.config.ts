import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const srcRoot = resolve(__dirname, "src");

export default defineConfig({
  root: srcRoot,
  publicDir: resolve(__dirname, "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcRoot
    }
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    target: "firefox128",
    rollupOptions: {
      input: {
        background: resolve(srcRoot, "background/index.ts"),
        popup: resolve(srcRoot, "popup/index.html"),
        dashboard: resolve(srcRoot, "dashboard/index.html"),
        blocked: resolve(srcRoot, "blocked/index.html"),
        limit: resolve(srcRoot, "limit/index.html")
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background/index.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
