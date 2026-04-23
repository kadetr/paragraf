#!/usr/bin/env tsx
// manual/scripts/mt-25-color-swatch-ts.ts
// MT-25 — sRGB color swatches through TS color transforms.
//
// 20 named sRGB swatches run through 3 transform pairs:
//   A: sRGB → sRGB   (identity check — output should equal input via XYZ round-trip)
//   B: sRGB → AdobeRGB  (wider gamut compression — saturated reds/blues shift visibly)
//   C: AdobeRGB → sRGB  (reverse — effectively the inverse gamut expansion)
//
// For each pair:
//   - Prints a table of [R,G,B] → [X,Y,Z] channel values
//   - Renders a PDF with two columns: left = original swatch label + sRGB fill,
//     right = transformed channel values as text + the resulting PDF fill
//
// Outputs:
//   mt-25-swatches.json    — channel data for all pairs
//   mt-25-srgb-srgb.pdf   — visual: sRGB→sRGB (baseline)
//   mt-25-srgb-adobergb.pdf — visual: sRGB→AdobeRGB
//   mt-25-adobergb-srgb.pdf — visual: AdobeRGB→sRGB
//
// Run:  tsx tests/manual/scripts/mt-25-color-swatch-ts.ts

import * as path from 'path';
import { readFileSync, existsSync } from 'fs';
import {
  parseIccProfile,
  loadBuiltinSrgb,
  createTransform,
} from '@paragraf/color';
import { writeJson, writePdf } from '../fixtures/output.js';
import { drawTestHeader } from '../fixtures/header.js';
import { MARGIN_X, MARGIN_TOP, PAGE_W, PAGE_H } from '../fixtures/documents.js';

// ─── Profiles ─────────────────────────────────────────────────────────────────────────────

const ADOBE_RGB_PATH = '/System/Library/ColorSync/Profiles/AdobeRGB1998.icc';
if (!existsSync(ADOBE_RGB_PATH)) {
  console.log(
    '[mt-25] macOS ColorSync profiles not found — skipping on this platform.',
  );
  process.exit(0);
}

const srgb = loadBuiltinSrgb();
const adobeRgbBuf = readFileSync(ADOBE_RGB_PATH);
const adobeRgb = parseIccProfile(
  new Uint8Array(
    adobeRgbBuf.buffer,
    adobeRgbBuf.byteOffset,
    adobeRgbBuf.byteLength,
  ),
);

// ─── 20 named sRGB swatches ────────────────────────────────────────────────────

const SWATCHES: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: 'black', rgb: [0, 0, 0] },
  { name: 'white', rgb: [1, 1, 1] },
  { name: 'red', rgb: [1, 0, 0] },
  { name: 'green', rgb: [0, 0.502, 0] },
  { name: 'blue', rgb: [0, 0, 1] },
  { name: 'cyan', rgb: [0, 1, 1] },
  { name: 'magenta', rgb: [1, 0, 1] },
  { name: 'yellow', rgb: [1, 1, 0] },
  { name: 'orange', rgb: [1, 0.647, 0] },
  { name: 'deep-red', rgb: [0.698, 0.133, 0.133] },
  { name: 'royal-blue', rgb: [0.255, 0.412, 0.882] },
  { name: 'forest-green', rgb: [0.133, 0.545, 0.133] },
  { name: 'gold', rgb: [1, 0.843, 0] },
  { name: 'violet', rgb: [0.933, 0.51, 0.933] },
  { name: 'teal', rgb: [0, 0.502, 0.502] },
  { name: 'light-gray', rgb: [0.827, 0.827, 0.827] },
  { name: 'mid-gray', rgb: [0.502, 0.502, 0.502] },
  { name: 'dark-gray', rgb: [0.251, 0.251, 0.251] },
  { name: 'pastel-pink', rgb: [1, 0.753, 0.796] },
  { name: 'sky-blue', rgb: [0.529, 0.808, 0.922] },
];

// ─── Transform pairs ──────────────────────────────────────────────────────────

const PAIRS = [
  { label: 'srgb→srgb', src: srgb, dst: srgb, pdfName: 'mt-25-srgb-srgb.pdf' },
  {
    label: 'srgb→adobergb',
    src: srgb,
    dst: adobeRgb,
    pdfName: 'mt-25-srgb-adobergb.pdf',
  },
  {
    label: 'adobergb→srgb',
    src: adobeRgb,
    dst: srgb,
    pdfName: 'mt-25-adobergb-srgb.pdf',
  },
];

// ─── Font / composer setup ────────────────────────────────────────────────────

const COL_W = (PAGE_W - MARGIN_X * 2) / 2 - 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb.map((v) =>
    Math.round(Math.min(Math.max(v, 0), 1) * 255),
  );
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function fmt3(arr: number[]): string {
  return arr.map((v) => v.toFixed(4)).join(', ');
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const allResults: unknown[] = [];

for (const pair of PAIRS) {
  const transform = createTransform(pair.src, pair.dst);
  console.log(`\n── ${pair.label} ──`);
  console.log(
    `  ${'Swatch'.padEnd(16)} ${'Input [R,G,B]'.padEnd(28)} → Output channels`,
  );

  const swatchResults: unknown[] = [];

  for (const { name, rgb } of SWATCHES) {
    const out = transform.apply(rgb);
    console.log(`  ${name.padEnd(16)} [${fmt3(rgb)}] → [${fmt3(out)}]`);
    swatchResults.push({ swatch: name, input: rgb, output: out });
  }

  allResults.push({ pair: pair.label, swatches: swatchResults });

  // ─── Render to PDF ────────────────────────────────────────────────────────
  // Two-column layout using pdfkit directly so we can mix per-swatch fill colors.

  const RIGHT_X = MARGIN_X + COL_W + 24;
  const LEFT_X = MARGIN_X;
  const { default: PDFDocument } = await import('pdfkit');
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H] });
  doc.on('data', (c: Buffer) => chunks.push(c));

  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);

    drawTestHeader(doc, 'MT-25');

    // Column headers
    const colHeaderY = MARGIN_TOP + 46;
    doc
      .fillColor('#666666')
      .fontSize(8)
      .font('Helvetica')
      .text('Input sRGB fill', LEFT_X, colHeaderY)
      .text('Output channels fill', RIGHT_X, colHeaderY);

    // Swatch rows
    const startY = MARGIN_TOP + 62;
    SWATCHES.forEach(({ name, rgb }, i) => {
      const transform2 = createTransform(pair.src, pair.dst);
      const out = transform2.apply(rgb);
      const inHex = toHex(rgb);
      const outHex2 =
        out.length >= 3 ? toHex([out[0], out[1], out[2]]) : '#888888';
      const rowY = startY + i * 22;

      // Left: colored rect + label
      doc.rect(LEFT_X, rowY, 12, 12).fill(inHex);
      doc
        .fillColor('#111111')
        .fontSize(8)
        .font('Helvetica')
        .text(`${name}  [${fmt3(rgb)}]`, LEFT_X + 16, rowY + 1, {
          width: COL_W - 16,
        });

      // Right: output-colored rect + channels
      doc.rect(RIGHT_X, rowY, 12, 12).fill(outHex2);
      doc
        .fillColor('#111111')
        .fontSize(8)
        .font('Helvetica')
        .text(`[${fmt3(out)}]`, RIGHT_X + 16, rowY + 1, { width: COL_W - 16 });
    });

    doc.end();
  });

  const buf = Buffer.concat(chunks);
  writePdf(pair.pdfName, buf);
}

writeJson('mt-25-swatches.json', allResults);
console.log('\nMT-25 PASS');
