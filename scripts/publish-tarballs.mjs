#!/usr/bin/env node
/**
 * Publishes the tarballs made by pack-check.mjs, in dependency order, and
 * skips any version that is already on the registry. A run that failed
 * half-way can therefore simply be started again.
 *
 *   node scripts/publish-tarballs.mjs <dir> --dry-run   # nothing is uploaded
 *   node scripts/publish-tarballs.mjs <dir>             # publishes
 *
 * Meant to be run by .github/workflows/release.yml, not by hand.
 */

import { execFileSync, spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import { join, resolve } from 'path';

// Dependencies before dependents.
const ORDER = [
  '@paragraf/types',
  '@paragraf/color',
  '@paragraf/color-wasm',
  '@paragraf/linebreak',
  '@paragraf/font-engine',
  '@paragraf/layout',
  '@paragraf/style',
  '@paragraf/shaping-wasm',
  '@paragraf/render-core',
  '@paragraf/typography',
  '@paragraf/render-pdf',
  '@paragraf/template',
  '@paragraf/compile',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('Usage: publish-tarballs.mjs <dir> [--dry-run]');
  process.exit(1);
}

const byName = new Map();
for (const f of readdirSync(resolve(dir)).filter((x) => x.endsWith('.tgz'))) {
  const file = join(resolve(dir), f);
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOzf', file, 'package/package.json'], {
      encoding: 'utf8',
    }),
  );
  if (byName.has(manifest.name)) {
    console.error(`Two tarballs for ${manifest.name} in ${dir}.`);
    process.exit(1);
  }
  byName.set(manifest.name, { file, version: manifest.version });
}

const unknown = [...byName.keys()].filter((n) => !ORDER.includes(n));
const missing = ORDER.filter((n) => !byName.has(n));
if (unknown.length || missing.length) {
  console.error(
    `Tarball set is wrong. Missing: ${missing.join(', ') || 'none'}. ` +
      `Unexpected: ${unknown.join(', ') || 'none'}.`,
  );
  process.exit(1);
}
const versions = new Set([...byName.values()].map((v) => v.version));
if (versions.size !== 1) {
  console.error(
    `Tarballs have different versions: ${[...versions].join(', ')}`,
  );
  process.exit(1);
}

/** True when name@version is already on the registry. */
const isPublished = (name, version) => {
  const r = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    encoding: 'utf8',
  });
  if (r.status === 0) return r.stdout.trim() === version;
  // E404 = the package or the version does not exist yet. Anything else
  // (network, auth) must stop the release rather than be read as "absent".
  if (/E404/.test(r.stderr)) return false;
  console.error(`Could not query ${name}@${version}:\n${r.stderr}`);
  process.exit(1);
};

console.log(
  `${dryRun ? 'DRY RUN — ' : ''}publishing version ${[...versions][0]}\n`,
);
let published = 0;
let skipped = 0;
for (const name of ORDER) {
  const { file, version } = byName.get(name);
  if (isPublished(name, version)) {
    console.log(`  skip     ${name}@${version} (already on the registry)`);
    skipped++;
    continue;
  }
  console.log(`  publish  ${name}@${version}`);
  const publishArgs = ['publish', file, '--access', 'public'];
  if (dryRun) publishArgs.push('--dry-run');
  else publishArgs.push('--provenance');
  const r = spawnSync('npm', publishArgs, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(
      `\nPublishing ${name} failed. ${published} package(s) were published in this run. ` +
        'Fix the cause and run the workflow again; published versions are skipped.',
    );
    process.exit(1);
  }
  published++;
}
console.log(
  `\nDone: ${published} ${dryRun ? 'would be ' : ''}published, ${skipped} skipped.`,
);
