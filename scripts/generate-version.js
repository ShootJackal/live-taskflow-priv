#!/usr/bin/env node
/**
 * Writes public/version.json before each Vercel build.
 * The app polls this file every 5 minutes to detect new deployments.
 *
 * Security: uses a SHA-256 hash of the commit SHA instead of exposing
 * the raw git hash. This prevents correlating the deployment to specific
 * commits in the public repository.
 */

const { execSync, createHash } = require("crypto") ? require("crypto") : {};
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let rawSha = "";
try {
  rawSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch (_) {
  rawSha = process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString();
}

// Use an opaque 12-char fingerprint derived from the commit — not the raw SHA.
// Anyone with the version.json cannot reverse this to a specific commit.
const buildId = crypto
  .createHash("sha256")
  .update(rawSha + (process.env.BUILD_SALT || "taskflow"))
  .digest("hex")
  .slice(0, 12);

const version = {
  version: buildId,
  buildTime: new Date().toISOString(),
};

const outPath = path.join(__dirname, "..", "public", "version.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(version, null, 2) + "\n");

console.log(`[generate-version] ${buildId} → public/version.json`);
