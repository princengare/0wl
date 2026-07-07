#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const profileDir = resolve(root, ".web-ext-profile");
const distManifest = resolve(root, "dist", "manifest.json");
const children = new Set();

function spawnCommand(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  children.add(child);

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (signal || code === 0 || shuttingDown) {
      return;
    }

    console.error(`[${label}] exited with code ${code}`);
    shutdown(code ?? 1);
  });

  return child;
}

function runOnce(command, args, label) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(
        new Error(`${label} failed${signal ? ` with signal ${signal}` : ` with code ${code}`}`)
      );
    });
  });
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting 0wl Firefox development environment...");
await mkdir(profileDir, { recursive: true });

if (!existsSync(distManifest)) {
  console.log("No built extension found. Running initial build...");
  await runOnce("npm", ["run", "build"], "initial build");
}

spawnCommand("npm", ["run", "typecheck:watch"], "typecheck watch");
spawnCommand("npm", ["run", "build:watch"], "Vite build watch");
spawnCommand(
  "npx",
  [
    "web-ext",
    "run",
    "--source-dir",
    "dist",
    "--firefox-profile",
    profileDir,
    "--profile-create-if-missing",
    "--keep-profile-changes"
  ],
  "web-ext"
);
