// Cross-platform preinstall guard (replaces the old `sh -c '...'` one-liner,
// which fails on Windows where `sh` does not exist).
//
// 1. Removes npm/yarn lockfiles that would shadow pnpm.
// 2. Refuses to continue unless the install is running under pnpm.
//
// Runs on plain Node with no dependencies so it works on every OS.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

for (const lockfile of ["package-lock.json", "yarn.lock"]) {
  const target = path.join(root, lockfile);
  try {
    fs.rmSync(target, { force: true });
  } catch {
    // Best-effort only; a leftover lockfile must not break installs.
  }
}

const userAgent = process.env.npm_config_user_agent ?? "";
if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead (this workspace requires pnpm).");
  process.exit(1);
}
