#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const iconSrc = path.join(__dirname, "..", "assets", "images", "icon.png");
const faviconSrc = path.join(__dirname, "..", "assets", "images", "favicon.png");

if (!fs.existsSync(iconSrc)) {
  console.warn("prepare-pwa: assets/images/icon.png not found, skipping icon copy");
  process.exit(0);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(iconSrc, path.join(publicDir, "logo192.png"));
fs.copyFileSync(iconSrc, path.join(publicDir, "logo512.png"));
console.log("prepare-pwa: copied icon to public/logo192.png and public/logo512.png");

if (fs.existsSync(faviconSrc)) {
  fs.copyFileSync(faviconSrc, path.join(publicDir, "favicon.png"));
  console.log("prepare-pwa: copied favicon to public/favicon.png");
} else {
  console.warn("prepare-pwa: assets/images/favicon.png not found, skipping favicon copy");
}
