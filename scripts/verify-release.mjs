#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function assertDistPath(path, label) {
  assert(existsSync(resolve(root, "dist", path)), `${label} is missing from dist: ${path}`);
}

const packageJsonPath = resolve(root, "package.json");
const manifestPath = resolve(root, "dist", "manifest.json");
const amoMetadataPath = resolve(root, "amo-metadata.json");

assert(existsSync(packageJsonPath), "package.json is missing.");
assert(existsSync(manifestPath), "dist/manifest.json is missing. Run npm run build first.");

if (failures.length === 0) {
  const packageJson = readJson(packageJsonPath);
  const manifest = readJson(manifestPath);

  assert(packageJson.name === "0wl", "package.json name must be 0wl.");
  assert(manifest.name === "0wl", "Firefox extension name must be 0wl.");
  assert(manifest.action?.default_title === "0wl", "Firefox action title must be 0wl.");
  assert(
    packageJson.version === manifest.version,
    `package.json version ${packageJson.version} does not match manifest version ${manifest.version}.`
  );
  assert(
    typeof manifest.browser_specific_settings?.gecko?.id === "string",
    "Firefox gecko extension ID is required for signing and persistent installs."
  );
  assert(
    !manifest.browser_specific_settings?.gecko?.update_url ||
      !manifest.browser_specific_settings.gecko.update_url.includes("example.com"),
    "Do not ship a placeholder gecko.update_url."
  );

  for (const scriptPath of manifest.background?.scripts ?? []) {
    assertDistPath(scriptPath, "Background script");
  }

  if (manifest.action?.default_popup) {
    assertDistPath(manifest.action.default_popup, "Action popup");
  }

  if (manifest.options_ui?.page) {
    assertDistPath(manifest.options_ui.page, "Options page");
  }

  for (const iconPath of Object.values(manifest.icons ?? {})) {
    assertDistPath(iconPath, "Extension icon");
  }

  for (const iconPath of Object.values(manifest.action?.default_icon ?? {})) {
    assertDistPath(iconPath, "Action icon");
  }

  for (const group of manifest.web_accessible_resources ?? []) {
    for (const resourcePath of group.resources ?? []) {
      assertDistPath(resourcePath, "Web-accessible resource");
    }
  }

  for (const requiredDoc of ["README.md", "LICENSE", "PRIVACY.md", "SECURITY.md"]) {
    assert(existsSync(resolve(root, requiredDoc)), `${requiredDoc} is required for release.`);
  }

  assert(existsSync(amoMetadataPath), "amo-metadata.json is required for AMO listed releases.");

  if (existsSync(amoMetadataPath)) {
    const amoMetadata = readJson(amoMetadataPath);
    const firefoxCategories = amoMetadata.categories?.firefox;
    const customLicense = amoMetadata.version?.custom_license;
    const namedLicense = amoMetadata.version?.license;
    const hasFirefoxCategories =
      Array.isArray(firefoxCategories) &&
      firefoxCategories.every((category) => typeof category === "string") &&
      firefoxCategories.length > 0;
    const hasLocalizedCustomLicense =
      customLicense &&
      typeof customLicense === "object" &&
      !Array.isArray(customLicense) &&
      customLicense.name &&
      typeof customLicense.name === "object" &&
      !Array.isArray(customLicense.name) &&
      typeof customLicense.name["en-US"] === "string" &&
      customLicense.name["en-US"].trim().length > 0 &&
      customLicense.text &&
      typeof customLicense.text === "object" &&
      !Array.isArray(customLicense.text) &&
      typeof customLicense.text["en-US"] === "string" &&
      customLicense.text["en-US"].trim().length > 0;

    assert(
      hasFirefoxCategories,
      "AMO metadata must define at least one Firefox category in categories.firefox."
    );
    assert(
      typeof namedLicense === "string" || hasLocalizedCustomLicense,
      "AMO metadata must define version.license or localized version.custom_license.name/text."
    );
  }
}

if (failures.length > 0) {
  console.error("Release verification failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("Release verification passed.");
