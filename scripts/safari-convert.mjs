#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const rebuild = process.argv.includes("--rebuild");
const sourceDir = resolve(root, ".output", "safari-mv2");
const projectRoot = resolve(root, "platforms", "safari", "xcode");
const appName = process.env.SAFARI_APP_NAME ?? "0wl";
const bundleIdentifier = process.env.SAFARI_BUNDLE_IDENTIFIER ?? "io.github.princengare.0wl";

if (!existsSync(resolve(sourceDir, "manifest.json"))) {
  console.error(`Missing Safari build output: ${sourceDir}`);
  console.error("Run npm run build:safari first.");
  process.exit(1);
}

if (rebuild) {
  console.log("Regenerating existing Safari Xcode wrapper from fresh WXT assets...");
}

const args = [
  "safari-web-extension-converter",
  sourceDir,
  "--project-location",
  projectRoot,
  "--app-name",
  appName,
  "--bundle-identifier",
  bundleIdentifier,
  "--swift",
  "--macos-only",
  "--copy-resources",
  "--no-open",
  "--no-prompt",
  "--force"
];

const child = spawn("xcrun", args, {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Safari conversion stopped with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
