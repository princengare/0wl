#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const browser = process.argv[2];

if (!browser) {
  console.error("Usage: node scripts/finalize-wxt-build.mjs <firefox|chrome|edge|opera|safari>");
  process.exit(1);
}

const outputDirName = browser === "safari" ? "safari-mv2" : `${browser}-mv3`;
const outputDir = resolve(root, ".output", outputDirName);
const manifestPath = resolve(outputDir, "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`Missing generated manifest: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (browser === "firefox") {
  manifest.permissions = (manifest.permissions ?? []).filter(
    (permission) => permission !== "http://*/*" && permission !== "https://*/*"
  );
  manifest.host_permissions = ["http://*/*", "https://*/*"];
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
