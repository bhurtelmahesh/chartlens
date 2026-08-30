#!/usr/bin/env node
// Copies the canonical market-data core into functions/ so the Firebase
// Function deploy bundle is self-contained. Run automatically by the
// firebase.json functions predeploy hook; safe to run by hand any time.
//
//   node scripts/sync-shared.mjs

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
writeFileSync(dest, banner + body);
console.log(`sync-shared: wrote ${dest} (${body.length} bytes from market-core.js)`);
