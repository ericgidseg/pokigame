const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "index.html");
const cssPath = path.join(root, "styles.css");
const scriptPath = path.join(root, "game.js");
const outputDir = path.join(root, "dist");
const outputPath = path.join(outputDir, "Emberlands.html");
const stylesheetTag = '    <link rel="stylesheet" href="styles.css" />';
const scriptTag = '    <script src="game.js"></script>';

let html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const script = fs.readFileSync(scriptPath, "utf8");

if (!html.includes(stylesheetTag) || !html.includes(scriptTag)) {
  throw new Error("Could not find the expected stylesheet and script tags in index.html");
}
if (css.includes("</style>") || script.includes("</script>")) {
  throw new Error("Source contains a closing tag that cannot be embedded safely");
}

html = html
  .replace(stylesheetTag, `    <style>\n${css}\n    </style>`)
  .replace(scriptTag, `    <script>\n${script}\n    </script>`);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, html);

const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
console.log(`Single-file web build ready: ${outputPath} (${sizeKb} KB)`);
