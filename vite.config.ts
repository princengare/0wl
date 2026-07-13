import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const srcRoot = resolve(__dirname, "src");
const isWatchBuild = process.argv.includes("--watch");

function removeReactInnerHtmlAssignments(): Plugin {
  return {
    name: "remove-react-inner-html-assignments",
    generateBundle(_options, bundle) {
      const unsafeAssignmentPattern = /\binnerHTML\s*=/;

      for (const asset of Object.values(bundle)) {
        if (asset.type !== "chunk") {
          continue;
        }

        let code = asset.code;

        // AMO flags React DOM's generic script shim even though 0wl does not render scripts.
        code = code.replace(
          /([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.createElement\("div"\),\1\.innerHTML="<script><\\\/script>",\1=\1\.removeChild\(\1\.firstChild\)/g,
          '$1=$2.createElement("script")'
        );

        // 0wl never uses dangerouslySetInnerHTML. Disable React's generic runtime path so the
        // extension bundle contains no dynamic innerHTML assignment for AMO review.
        code = code.replace(
          /([A-Za-z_$][\w$]*)\.innerHTML=([A-Za-z_$][\w$]*)/g,
          'throw Error("dangerouslySetInnerHTML is disabled in 0wl")'
        );

        if (unsafeAssignmentPattern.test(code)) {
          this.error(`Unsafe innerHTML assignment remains in ${asset.fileName}.`);
        }

        asset.code = code;
      }
    }
  };
}

export default defineConfig({
  root: srcRoot,
  publicDir: resolve(__dirname, "public"),
  plugins: [react(), removeReactInnerHtmlAssignments()],
  resolve: {
    alias: {
      "@": srcRoot
    }
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: !isWatchBuild,
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
