const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const resourceDir = path.join(root, "resources");
const files = ["index.html", "game.js", "styles.css"];

fs.mkdirSync(resourceDir, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(resourceDir, file));
}

console.log(`Synced ${files.length} game files into resources/.`);
