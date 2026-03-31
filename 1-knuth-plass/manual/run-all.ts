#!/usr/bin/env tsx
// manual/run-all.ts
// Runs all MT scripts in order and reports pass/fail.
// Exit 0 = all pass. Exit 1 = one or more failures.
//
// Usage:
//   tsx manual/run-all.ts           — run all tests
//   tsx manual/run-all.ts mt-01 mt-14  — run specific tests by id prefix

import { spawnSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALL_SCRIPTS = [
  'mt-01-ltr-quality',
  'mt-02-rtl-hebrew',
  'mt-03-arabic',
  'mt-04-superscript-subscript',
  'mt-05-mixed-font',
  'mt-06-long-url',
  'mt-07-widow-orphan',
  'mt-08-consecutive-hyphens',
  'mt-09-variable-linewidths',
  'mt-10-canvas-svg-parity',
  'mt-11-wasm-ts-parity',
  'mt-12-pdf-structure',
  'mt-13-large-document',
  'mt-14-baseline-grid',
  'mt-15-optical-margin',
];

const filter = process.argv.slice(2);
const scripts =
  filter.length > 0
    ? ALL_SCRIPTS.filter((s) => filter.some((f) => s.startsWith(f)))
    : ALL_SCRIPTS;

if (scripts.length === 0) {
  console.error(`No scripts matched filter: ${filter.join(', ')}`);
  process.exit(1);
}

// ─── Column widths ────────────────────────────────────────────────────────────

const COL_ID = 6;
const COL_NAME = 32;

const pad = (s: string, n: number) => s.padEnd(n);

console.log('');
console.log(
  `${'MT-ID'.padEnd(COL_ID)}  ${'Script'.padEnd(COL_NAME)}  ${'Result'.padEnd(10)}  Time`,
);
console.log('─'.repeat(70));

const results: Array<{ id: string; ok: boolean; ms: number }> = [];

for (const name of scripts) {
  const id = name.slice(0, 5).toUpperCase();
  const scriptPath = path.join(__dirname, 'scripts', `${name}.ts`);
  const t0 = Date.now();

  const result = spawnSync('npx', ['tsx', scriptPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ms = Date.now() - t0;
  const ok = result.status === 0;

  const statusLabel = ok ? 'PASS' : 'FAIL';
  console.log(
    `${pad(id, COL_ID)}  ${pad(name, COL_NAME)}  ${pad(statusLabel, 10)}  ${ms}ms`,
  );

  if (!ok && result.stdout) {
    const lines = result.stdout.trim().split('\n').slice(-5);
    for (const l of lines) console.log(`         ${l}`);
  }
  if (!ok && result.stderr) {
    const lines = result.stderr.trim().split('\n').slice(-5);
    for (const l of lines) console.log(`         ${l}`);
  }

  results.push({ id, ok, ms });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
const total = results.length;
const totalMs = results.reduce((s, r) => s + r.ms, 0);

console.log('─'.repeat(70));
console.log(
  `${passed}/${total} passed   ${failed} failed   ${totalMs}ms total`,
);
console.log('');

// Also run verify-metrics on all generated metrics files
console.log('Running verify-metrics on outputs...');
const verifyResult = spawnSync(
  'npx',
  ['tsx', path.join(__dirname, 'tools/verify-metrics.ts')].concat([
    `${path.join(__dirname, 'outputs')}/*.metrics.json`,
  ]),
  { encoding: 'utf8', stdio: 'inherit', shell: true },
);

process.exit(failed > 0 || (verifyResult.status ?? 0) > 0 ? 1 : 0);
