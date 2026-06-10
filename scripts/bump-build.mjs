// Bumps the build number stamped in public/index.html.
// Wired to run automatically before every deploy via the "predeploy" npm script,
// so the version in the bottom-right of the box increments on each `npm run deploy`.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../public/index.html", import.meta.url);
const html = readFileSync(FILE, "utf8");

const match = html.match(/id="version">v(\d+)</);
if (!match) {
  console.error('✗ Could not find the version marker (id="version">vN<) in public/index.html');
  process.exit(1);
}

const next = Number(match[1]) + 1;
writeFileSync(FILE, html.replace(/id="version">v\d+</, `id="version">v${next}<`));
console.log(`🔢 build bumped to v${next}`);
