#!/usr/bin/env node
/**
 * Writes public/version.json before each Vercel build.
 * The app polls this file every 5 minutes to detect new deployments
 * and shows a "New version available" banner.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

let sha = "dev";
try {
  sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch (_) {
  // git not available (e.g. Vercel shallow clone edge case)
  sha = process.env.VERCEL_GIT_COMMIT_SHA
    ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
    : Date.now().toString(36);
}

const version = {
  version: sha,
  buildTime: new Date().toISOString(),
};

const outPath = path.join(__dirname, "..", "public", "version.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(version, null, 2) + "\n");

console.log(`[generate-version] ${sha} → public/version.json`);
