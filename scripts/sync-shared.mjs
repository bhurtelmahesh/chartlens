#!/usr/bin/env node
// Copies the canonical market-data core into functions/ so the Firebase
// Function deploy bundle is self-contained. Run automatically by the
// firebase.json functions predeploy hook; safe to run by hand any time.
//
//   node scripts/sync-shared.mjs          # write functions/market-core.js
//   node scripts/sync-shared.mjs --check  # exit 1 if it is out of date
//
// --check exists so drift is caught instead of silently overwritten: editing
// functions/market-core.js directly used to be clobbered without a word, and
// deploying only the Worker left the Function on stale code.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "workers", "market-proxy", "src", "market-core.js");
const dest = join(root, "functions", "market-core.js");

const banner =
  "// GENERATED FILE — do not edit.\n" +
  "// Copy of workers/market-proxy/src/market-core.js via scripts/sync-shared.mjs.\n\n";

const body = readFileSync(src, "utf8");
const expected = banner + body;
const check = process.argv.includes("--check");

let current = null;
try {
  current = readFileSync(dest, "utf8");
} catch {
  // Not generated yet.
}

if (current === expected) {
  console.log(`sync-shared: ${dest} is up to date.`);
} else if (check) {
  console.error(
    `sync-shared: ${dest} is OUT OF DATE with market-core.js.\n` +
      "  Run `node scripts/sync-shared.mjs` and redeploy the Function, or\n" +
      "  move your edit into workers/market-proxy/src/market-core.js (the source of truth)."
  );
  process.exit(1);
} else {
  writeFileSync(dest, expected);
  console.log(`sync-shared: wrote ${dest} (${body.length} bytes from market-core.js)`);
}
