import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, type WxtViteConfig } from "wxt";
import type { Plugin } from "vite";

const srcRoot = resolve(__dirname, "src");
const iconPaths = {
  16: "icons/w0wltb-16.png",
  32: "icons/w0wltb-32.png",
  48: "icons/w0wltb-48.png",
  96: "icons/w0wltb-96.png",
  128: "icons/w0wltb-128.png"
};

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
  srcDir: "src",
  entrypointsDir: "../entrypoints",
  manifestVersion: 3,
  targetBrowsers: ["firefox", "chrome", "edge", "opera", "safari"],
  manifest: ({ browser }) => ({
    name: "0wl",
    description: "Local-first website usage tracking and blocking.",
    incognito: "spanning",
    icons: iconPaths,
    action: {
      default_title: "0wl",
      default_icon: iconPaths
    },
    permissions: [
      "tabs",
      "storage",
      ...(browser === "safari" ? [] : ["idle"]),
      "alarms",
      "declarativeNetRequest"
    ],
    host_permissions: browser === "firefox" ? undefined : ["http://*/*", "https://*/*"],
    web_accessible_resources: [
      {
        resources: ["blocked.html", "limit.html", "friction.html"],
        matches: ["http://*/*", "https://*/*"]
      }
    ],
    browser_specific_settings:
      browser === "firefox"
        ? {
            gecko: {
              id: "0wl@princengare.github.io",
              strict_min_version: "142.0",
              data_collection_permissions: {
                required: ["none"]
              }
            }
          }
        : undefined
  }),
  vite: (): WxtViteConfig => ({
    plugins: [react(), removeReactInnerHtmlAssignments()],
    resolve: {
      alias: {
        "@": srcRoot
      }
    },
    build: {
      sourcemap: false,
      target: "firefox128"
    }
  })
});
