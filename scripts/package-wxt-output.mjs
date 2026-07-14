#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const browser = process.argv[2];

if (!browser) {
  console.error("Usage: node scripts/package-wxt-output.mjs <firefox|chrome|edge|opera|safari>");
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const outputDirName = browser === "safari" ? "safari-mv2" : `${browser}-mv3`;
const sourceDir = resolve(root, ".output", outputDirName);
const manifestPath = resolve(sourceDir, "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`Missing generated manifest: ${manifestPath}`);
  process.exit(1);
}

const child = spawn(
  "npx",
  [
    "web-ext",
    "build",
    "--source-dir",
    sourceDir,
    "--artifacts-dir",
    resolve(root, ".output"),
    "--filename",
    `0wl-${packageJson.version}-${browser}.zip`,
    "--overwrite-dest"
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      NO_UPDATE_NOTIFIER: "1"
    },
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`web-ext build stopped with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
