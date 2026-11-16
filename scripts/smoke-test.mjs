#!/usr/bin/env node
/**
 * Installs the packed tarballs into an empty project OUTSIDE the repo and
 * runs the README quick-start against them. This is what a user gets from
 * `npm install @paragraf/compile`, minus the registry.
 *
 *   node scripts/pack-check.mjs --out <dir>     # make the tarballs first
 *   node scripts/smoke-test.mjs <dir>
 *
 * Needs network access: third-party dependencies come from the npm registry.
 * Exit code 0 when the installed packages produce a PDF with the WASM shaper
 * loaded, 1 otherwise.
 */

import { execFileSync } from 'child_process';
import {
  mkdtempSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  existsSync,
  realpathSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tarballDir = process.argv[2] ? resolve(process.argv[2]) : null;
if (!tarballDir || !existsSync(tarballDir)) {
  console.error('Usage: node scripts/smoke-test.mjs <directory with the .tgz files>');
  process.exit(1);
}

const tarballs = readdirSync(tarballDir)
  .filter((f) => f.endsWith('.tgz'))
  .map((f) => join(tarballDir, f));
if (tarballs.length !== 13) {
  console.error(`Expected 13 tarballs in ${tarballDir}, found ${tarballs.length}.`);
  process.exit(1);
}

// The project must be outside the repo, or Node would resolve @paragraf/*
// from the workspace's node_modules and the test would prove nothing.
const project = realpathSync(mkdtempSync(join(tmpdir(), 'paragraf-smoke-')));
const rel = relative(realpathSync(root), project);
if (!rel.startsWith('..') && !isAbsolute(rel)) {
  console.error(`Temp folder ${project} is inside the repo; refusing to run.`);
  process.exit(1);
}
console.log(`Smoke test project: ${project}`);

writeFileSync(
  join(project, 'package.json'),
  JSON.stringify({ name: 'paragraf-smoke', private: true, type: 'module' }, null, 2),
);

console.log(`Installing ${tarballs.length} tarballs…`);
execFileSync('npm', ['install', '--no-audit', '--no-fund', ...tarballs], {
  cwd: project,
  stdio: ['ignore', 'ignore', 'inherit'],
});

// The README quick-start, with absolute font paths and checks added.
const fonts = join(root, 'fonts');
writeFileSync(
  join(project, 'quickstart.mjs'),
  `
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { defineTemplate } from '@paragraf/template';
import { compile } from '@paragraf/compile';
import { wasmStatus } from '@paragraf/typography';
import { loadColorWasm } from '@paragraf/color-wasm';

// The packages are ESM-only, so resolve the way an import statement does.
const where = fileURLToPath(import.meta.resolve('@paragraf/compile'));

const template = defineTemplate({
  layout: { size: 'A4', margins: 72 },
  fonts: {
    LiberationSerif: {
      regular: ${JSON.stringify(join(fonts, 'LiberationSerif-Regular.ttf'))},
      bold: ${JSON.stringify(join(fonts, 'LiberationSerif-Bold.ttf'))},
    },
  },
  styles: {
    body: {
      font: { family: 'LiberationSerif', size: 11 },
      alignment: 'justified',
      lineHeight: 16,
    },
    heading: {
      font: { family: 'LiberationSerif', size: 18, weight: 700 },
      alignment: 'left',
      lineHeight: 24,
    },
  },
  content: [
    { style: 'heading', text: '{{title}}' },
    { style: 'body', text: '{{body}}' },
  ],
});

// shaping: 'wasm' is strict, so this fails if the tarball lacks the binary.
const result = await compile({
  template,
  data: {
    title: 'Of Wishing',
    body:
      'In olden times when wishing still helped one, there lived a king ' +
      'whose daughters were all beautiful.',
  },
  output: 'pdf',
  shaping: 'wasm',
});

writeFileSync('output.pdf', result.data);
// Throws if the colour WASM module is missing from its tarball.
const colorWasm = loadColorWasm();

console.log(JSON.stringify({
  resolvedFrom: where,
  colorWasm: typeof colorWasm === 'object' && colorWasm !== null,
  wasm: wasmStatus().status,
  engine: result.metadata.shapingEngine,
  pages: result.metadata.pageCount,
  bytes: result.data.length,
  header: Buffer.from(result.data).subarray(0, 5).toString('latin1'),
}));
`,
);

let report;
try {
  const out = execFileSync('node', ['quickstart.mjs'], {
    cwd: project,
    encoding: 'utf8',
  });
  report = JSON.parse(out.trim().split('\n').pop());
} catch (e) {
  console.error(`\nSmoke test FAILED: the quick-start did not run.\n${e.stderr || e.message}`);
  process.exit(1);
}

const problems = [];
if (!report.resolvedFrom.startsWith(join(project, 'node_modules'))) {
  problems.push(`@paragraf/compile resolved from ${report.resolvedFrom}, not from the installed tarball`);
}
if (!report.colorWasm) problems.push('the colour WASM module did not load');
if (report.wasm !== 'loaded') problems.push(`wasmStatus() is "${report.wasm}", expected "loaded"`);
if (report.engine !== 'wasm') problems.push(`shaping engine is "${report.engine}", expected "wasm"`);
if (report.header !== '%PDF-') problems.push(`output does not start with %PDF- (got "${report.header}")`);
if (!(report.bytes > 1000)) problems.push(`PDF is only ${report.bytes} bytes`);
if (report.pages !== 1) problems.push(`expected 1 page, got ${report.pages}`);

const installed = JSON.parse(
  readFileSync(join(project, 'node_modules/@paragraf/compile/package.json'), 'utf8'),
).version;

if (problems.length) {
  console.error('\nSmoke test FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `\nSmoke test passed: @paragraf/compile@${installed} from tarballs wrote a ` +
    `${report.bytes}-byte PDF (${report.pages} page) with the WASM shaper.\n` +
    `PDF: ${join(project, 'output.pdf')}`,
);
