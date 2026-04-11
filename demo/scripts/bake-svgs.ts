#!/usr/bin/env tsx
// demo/scripts/bake-svgs.ts
// Node.js build script: generates 5 showcase SVGs from manual-test mt scripts.
// Output: demo/public/showcase/<slug>.svg (committed to repo).
//
// Run: npm run build:svgs    (from demo/)
//   or tsx demo/scripts/bake-svgs.ts  (from monorepo root)

import { run as runMt04 } from '../../tests/manual/scripts/mt-04-superscript-subscript.js';
import { run as runMt05 } from '../../tests/manual/scripts/mt-05-mixed-font.js';
import { run as runMt15 } from '../../tests/manual/scripts/mt-15-optical-margin.js';
import { run as runMt17 } from '../../tests/manual/scripts/mt-17-line-heights.js';
import { run as runMt18 } from '../../tests/manual/scripts/mt-18-letter-spacing.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOWCASE_DIR = path.resolve(__dirname, '../public/showcase');

fs.mkdirSync(SHOWCASE_DIR, { recursive: true });

function write(slug: string, svg: string): void {
  const dest = path.join(SHOWCASE_DIR, `${slug}.svg`);
  fs.writeFileSync(dest, svg, 'utf8');
  console.log(`  SVG  ${dest}`);
}

console.log('\n  Baking showcase SVGs…\n');

// ─── mt-04: Superscript / Subscript (single output — pick the only variant) ──
{
  const results = await runMt04();
  const r = results[0];
  if (r) write(r.name, r.svg);
}

// ─── mt-05: Mixed fonts (single output) ──────────────────────────────────────
{
  const results = await runMt05();
  const r = results[0];
  if (r) write(r.name, r.svg);
}

// ─── mt-15: Optical margin alignment (single output — OMA on) ────────────────
{
  const results = await runMt15();
  const r = results[0];
  if (r) write(r.name, r.svg);
}

// ─── mt-17: Line heights sweep — pick 2.0× (highest-contrast variant) ────────
{
  const results = await runMt17();
  const r = results.find((v) => v.name.includes('2_0x'));
  if (r) write(r.name, r.svg);
}

// ─── mt-18: Letter spacing sweep — pick 0.05 em variant ─────────────────────
{
  const results = await runMt18();
  const r = results.find((v) => v.name.includes('0_05em'));
  if (r) write(r.name, r.svg);
}

console.log('\n  Done.\n');
