#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const envPath = resolve(root, ".env.local");

function loadLocalEnv(path) {
  if (!existsSync(path)) {
    return {};
  }

  const nextEnv = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

    if (key) {
      nextEnv[key] = value;
    }
  }

  return nextEnv;
}

const localEnv = loadLocalEnv(envPath);
const env = {
  ...process.env,
  ...localEnv
};

const channelArgIndex = process.argv.indexOf("--channel");
const channel =
  channelArgIndex >= 0 && process.argv[channelArgIndex + 1]
    ? process.argv[channelArgIndex + 1]
    : env.WEB_EXT_CHANNEL || "listed";
const metadataPath = env.WEB_EXT_AMO_METADATA || "amo-metadata.json";

if (!env.WEB_EXT_API_KEY || !env.WEB_EXT_API_SECRET) {
  console.error("Missing WEB_EXT_API_KEY or WEB_EXT_API_SECRET. Add them to .env.local.");
  process.exit(1);
}

const signArgs = [
  "web-ext",
  "sign",
  "--source-dir",
  "dist",
  "--artifacts-dir",
  "web-ext-artifacts",
  "--channel",
  channel
];

if (existsSync(resolve(root, metadataPath))) {
  signArgs.push("--amo-metadata", metadataPath);
}

const child = spawn(
  "npx",
  signArgs,
  {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`web-ext sign stopped with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
