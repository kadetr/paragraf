#!/usr/bin/env node
/**
 * Used by prepack / postpack lifecycle hooks in each package.
 *
 * prepack  (apply):   moves publishConfig.exports → exports so the tarball
 *                     has the dist/ path that Node will use after install.
 * postpack (restore): puts the original exports back so the workspace keeps
 *                     using ./src/index.ts resolution during development.
 *
 * Usage (from a package directory):
 *   node ../../scripts/publishconfig-swap.mjs apply
 *   node ../../scripts/publishconfig-swap.mjs restore
 */

import { readFileSync, writeFileSync } from 'fs';

const mode = process.argv[2]; // 'apply' | 'restore'
if (mode !== 'apply' && mode !== 'restore') {
  console.error('Usage: publishconfig-swap.mjs apply|restore');
  process.exit(1);
}

// Always run from the package directory (npm lifecycle sets cwd to package root)
const path = 'package.json';
const raw = readFileSync(path, 'utf8');
const pkg = JSON.parse(raw);

if (mode === 'apply') {
  if (!pkg.publishConfig?.exports) {
    console.error('No publishConfig.exports found — nothing to apply.');
    process.exit(0);
  }
  pkg._dev_exports = pkg.exports;
  pkg.exports = pkg.publishConfig.exports;
} else {
  if (!pkg._dev_exports) {
    // Already clean or was never saved — do nothing
    process.exit(0);
  }
  pkg.exports = pkg._dev_exports;
  delete pkg._dev_exports;
}

writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
