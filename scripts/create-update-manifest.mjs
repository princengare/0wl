#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifestPath = resolve(root, ".output", "firefox-mv3", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const extensionId = manifest.browser_specific_settings?.gecko?.id;
const updateBaseUrl = process.env.UPDATE_BASE_URL;
const xpiFile = process.env.XPI_FILE ?? `0wl-${packageJson.version}.xpi`;

if (!extensionId) {
  console.error(`${manifestPath} must define browser_specific_settings.gecko.id.`);
  process.exit(1);
}

if (!updateBaseUrl || !updateBaseUrl.startsWith("https://")) {
  console.error(
    "Set UPDATE_BASE_URL to the HTTPS directory where signed XPI files will be hosted."
  );
  process.exit(1);
}

const normalizedBaseUrl = updateBaseUrl.replace(/\/+$/, "");
const updateManifest = {
  addons: {
    [extensionId]: {
      updates: [
        {
          version: packageJson.version,
          update_link: `${normalizedBaseUrl}/${basename(xpiFile)}`
        }
      ]
    }
  }
};

const outputDir = resolve(root, "web-ext-artifacts");
const outputPath = resolve(outputDir, "updates.json");
await mkdir(outputDir, { recursive: true });
await writeFile(`${outputPath}`, `${JSON.stringify(updateManifest, null, 2)}\n`, "utf8");

console.log(`Wrote ${outputPath}`);
