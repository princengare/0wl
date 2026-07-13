#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const profileDir = resolve(root, ".web-ext-profile");
const children = new Set();

function spawnCommand(command, args, label, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: options.readyPattern ? ["inherit", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32"
  });

  children.add(child);

  let ready = options.readyPattern ? null : Promise.resolve();

  if (options.readyPattern) {
    ready = new Promise((resolvePromise, reject) => {
      let resolved = false;

      function handleOutput(chunk) {
        const output = chunk.toString();
        process.stdout.write(output);

        if (!resolved && options.readyPattern.test(output)) {
          resolved = true;
          resolvePromise();
        }
      }

      child.stdout.on("data", handleOutput);
      child.stderr.on("data", handleOutput);

      child.on("exit", (code, signal) => {
        if (!resolved) {
          reject(
            new Error(
              `${label} exited before initial build finished${
                signal ? ` with signal ${signal}` : ` with code ${code}`
              }`
            )
          );
        }
      });
    });
  }

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (signal || code === 0 || shuttingDown) {
      return;
    }

    console.error(`[${label}] exited with code ${code}`);
    shutdown(code ?? 1);
  });

  return { child, ready };
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

console.log("Running initial build so Firefox never loads a half-built extension...");
await runOnce("npm", ["run", "build"], "initial build");

spawnCommand("npm", ["run", "typecheck:watch"], "typecheck watch");
const viteWatch = spawnCommand("npm", ["run", "build:watch"], "Vite build watch", {
  readyPattern: /built in \d+ms|built in \d+\.\d+s/
});

console.log("Waiting for Vite watch to finish its first build...");
await viteWatch.ready;
console.log("Initial watched build finished. Launching Firefox...");

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
