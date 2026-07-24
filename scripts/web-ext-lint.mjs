#!/usr/bin/env node

import { spawn } from "node:child_process";

const child = spawn("web-ext", ["lint", "--source-dir", ".output/firefox-mv3"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NO_UPDATE_NOTIFIER: "1"
  },
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`web-ext lint stopped with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
