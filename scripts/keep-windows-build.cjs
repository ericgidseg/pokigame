const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const buildDir = path.join(distDir, "emberlands");
const source = path.join(buildDir, "emberlands-win_x64.exe");
const target = path.join(distDir, "荒原余烬-win-x64.exe");

if (!fs.existsSync(source)) {
  throw new Error(`Windows build not found: ${source}`);
}

fs.copyFileSync(source, target);
fs.rmSync(buildDir, { recursive: true, force: true });
fs.rmSync(path.join(distDir, "emberlands-release.zip"), { force: true });

const sizeMb = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
console.log(`Windows executable ready: ${target} (${sizeMb} MB)`);
