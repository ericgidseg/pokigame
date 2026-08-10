const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const manifest = path.join(root, "src-tauri", "Cargo.toml");
const target = "i686-pc-windows-msvc";
const command = process.platform === "win32" ? "cargo" : "cargo";
const args = process.platform === "win32"
  ? ["build", "--manifest-path", manifest, "--release", "--target", target, "--bin", "emberlands"]
  : ["xwin", "build", "--manifest-path", manifest, "--release", "--target", target, "--bin", "emberlands"];

const extraPaths = process.platform === "darwin"
  ? ["/opt/homebrew/opt/llvm/bin", "/opt/homebrew/opt/lld/bin"]
  : [];
const env = { ...process.env, PATH: [...extraPaths, process.env.PATH].filter(Boolean).join(path.delimiter) };
const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);

const source = path.join(root, "src-tauri", "target", target, "release", "emberlands.exe");
const distDir = path.join(root, "dist");
const output = path.join(distDir, "Emberlands.exe");
if (!fs.existsSync(source)) throw new Error(`Compatible Windows build not found: ${source}`);

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(source, output);
fs.rmSync(path.join(distDir, "emberlands-win-x64.exe"), { force: true });

const sizeMb = (fs.statSync(output).size / 1024 / 1024).toFixed(2);
console.log(`Compatible Windows executable ready: ${output} (${sizeMb} MB)`);
