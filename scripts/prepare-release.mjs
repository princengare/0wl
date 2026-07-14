#!/usr/bin/env node

import { spawn } from "node:child_process";

const steps = [
  ["npm", ["run", "lint"], "ESLint"],
  ["npm", ["run", "test"], "Vitest"],
  ["npm", ["run", "build"], "production build"],
  ["npm", ["run", "release:check"], "release verification"],
  ["npm", ["run", "web-ext:lint"], "web-ext lint"],
  ["npm", ["run", "package"], "unsigned package"]
];

function runStep(command, args, label) {
  console.log(`\n==> ${label}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${label} failed${signal ? ` with signal ${signal}` : ` with code ${code}`}`)
      );
    });
  });
}

for (const [command, args, label] of steps) {
  await runStep(command, args, label);
}

console.log("\nRelease preparation finished.");
console.log("Unsigned WXT artifact is in .output/.");
console.log("Use npm run sign:firefox with AMO credentials when you are ready to sign.");
