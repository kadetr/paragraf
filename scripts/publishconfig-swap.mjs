#!/usr/bin/env node
/**
 * Used by prepack / postpack lifecycle hooks in each package.
 *
 * prepack  (apply):   moves publishConfig.exports → exports so the tarball
 *                     has the dist/ path that Node will use after install.
 *                     Also makes npm pack the wasm-pack output folder.
 * postpack (restore): puts the original exports back so the workspace keeps
 *                     using ./src/index.ts resolution during development.
 *
 * The development exports are kept in `.dev-exports.json` next to
 * package.json while a pack is in progress. That file is git-ignored and is
 * not in any package's `files`, so it never reaches git or a tarball.
 * If a pack is interrupted, run `restore` in the package folder.
 *
 * Usage (from a package directory):
 *   node ../scripts/publishconfig-swap.mjs apply
 *   node ../scripts/publishconfig-swap.mjs restore
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const mode = process.argv[2]; // 'apply' | 'restore'
if (mode !== 'apply' && mode !== 'restore') {
  console.error('Usage: publishconfig-swap.mjs apply|restore');
  process.exit(1);
}

// Always run from the package directory (npm lifecycle sets cwd to package root)
const path = 'package.json';
const backup = '.dev-exports.json';
const pkg = JSON.parse(readFileSync(path, 'utf8'));

if (mode === 'apply') {
  // wasm-pack writes a .gitignore containing "*" into its output folder. npm
  // honours a nested .gitignore and would leave the compiled module out of
  // the tarball. An .npmignore in the same folder takes precedence over it;
  // the file itself is never packed and stays invisible to git (the "*" rule).
  for (const dir of ['wasm/pkg', 'wasm/pkg-bundler']) {
    if (existsSync(dir)) {
      writeFileSync(
        `${dir}/.npmignore`,
        '# Written by scripts/publishconfig-swap.mjs so npm packs this folder.\n',
      );
    }
  }

  if (!pkg.publishConfig?.exports) {
    console.error('No publishConfig.exports found — nothing to apply.');
    process.exit(0);
  }
  // An earlier pack was interrupted: the backup already holds the real
  // development exports, so it must not be overwritten with the swapped ones.
  if (!existsSync(backup)) {
    writeFileSync(backup, JSON.stringify(pkg.exports, null, 2) + '\n');
  }
  pkg.exports = pkg.publishConfig.exports;
} else {
  if (!existsSync(backup)) {
    // Already clean or was never saved — do nothing
    process.exit(0);
  }
  pkg.exports = JSON.parse(readFileSync(backup, 'utf8'));
  unlinkSync(backup);
}

writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
