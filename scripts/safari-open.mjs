#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const projectRoot = resolve(root, "platforms", "safari", "xcode");

function findXcodeProject(directory) {
  if (!existsSync(directory)) {
    return null;
  }

  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory() && entry.endsWith(".xcodeproj")) {
      return path;
    }

    if (stats.isDirectory()) {
      const found = findXcodeProject(path);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

const projectPath = findXcodeProject(projectRoot);

if (!projectPath) {
  console.error(`No .xcodeproj found under ${projectRoot}`);
  console.error("Run npm run safari:convert first.");
  process.exit(1);
}

const child = spawn("open", [projectPath], {
  cwd: root,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`open stopped with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
