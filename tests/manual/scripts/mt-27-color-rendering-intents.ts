#!/usr/bin/env tsx
// manual/scripts/mt-27-color-rendering-intents.ts
// MT-27 — Rendering intent behaviour on matrix profiles.
//
// Runs all 4 ICC rendering intents through sRGB → AdobeRGB for 20 swatches:
//   perceptual | relative | saturation | absolute
//
// Hypothesis: all 4 produce identical output for matrix+TRC profiles because
// matrix profiles have no intent-specific LUTs. This test verifies that claim.
//
// If any intent produces a different result, it is flagged as unexpected.
//
// Outputs:
//   mt-27-intents.json           — per-intent channel table + identity check
//   mt-27-intents.pdf            — 4-column visual: one column per intent
//
// Run:  tsx tests/manual/scripts/mt-27-color-rendering-intents.ts

import { readFileSync, existsSync } from 'fs';
import {
  parseIccProfile,
  loadBuiltinSrgb,
  createTransform,
} from '@paragraf/color';
import type { RenderingIntent } from '@paragraf/color';
import { writeJson, writePdf } from '../fixtures/output.js';
import { drawTestHeader } from '../fixtures/header.js';
import { MARGIN_X, MARGIN_TOP, PAGE_W, PAGE_H } from '../fixtures/documents.js';

// ─── Profiles ─────────────────────────────────────────────────────────────────────────────

const ADOBE_RGB_PATH = '/System/Library/ColorSync/Profiles/AdobeRGB1998.icc';
if (!existsSync(ADOBE_RGB_PATH)) {
  console.log(
    '[mt-27] macOS ColorSync profiles not found — skipping on this platform.',
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

// ─── Swatches ─────────────────────────────────────────────────────────────────

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

const INTENTS: RenderingIntent[] = [
  'perceptual',
  'relative',
  'saturation',
  'absolute',
];

// ─── Build transforms per intent ──────────────────────────────────────────────

const transforms = Object.fromEntries(
  INTENTS.map((intent) => [intent, createTransform(srgb, adobeRgb, intent)]),
) as Record<RenderingIntent, ReturnType<typeof createTransform>>;

// ─── Run ──────────────────────────────────────────────────────────────────────

let allIdentical = true;
const rows: unknown[] = [];

console.log('\n── MT-27: sRGB → AdobeRGB — all 4 rendering intents ──');
console.log(`  ${'Swatch'.padEnd(16)} ${'Identical?'.padEnd(12)} Notes`);

for (const { name, rgb } of SWATCHES) {
  const outputs = INTENTS.map((intent) => transforms[intent].apply(rgb));
  const [ref, ...rest] = outputs;
  const identical = rest.every((out) =>
    out.every((v, i) => Math.abs(v - ref[i]) < 1e-10),
  );
  if (!identical) allIdentical = false;

  const note = identical ? '' : 'UNEXPECTED DIFFERENCE';
  console.log(
    `  ${name.padEnd(16)} ${(identical ? 'yes' : 'NO').padEnd(12)} ${note}`,
  );

  rows.push({
    swatch: name,
    input: rgb,
    outputs: Object.fromEntries(
      INTENTS.map((intent, i) => [intent, outputs[i]]),
    ),
    identical,
  });
}

console.log(
  `\n  All identical: ${allIdentical ? 'yes — expected for matrix profiles' : 'NO — unexpected, investigate'}`,
);

const result = {
  profilePair: 'sRGB → AdobeRGB1998',
  hypothesis:
    'All intents produce identical output for matrix+TRC profiles (no per-intent LUTs)',
  hypothesisConfirmed: allIdentical,
  rows,
};
writeJson('mt-27-intents.json', result);

// ─── PDF: 4-column layout, one per intent ─────────────────────────────────────

function toHex(ch: number[]): string {
  const [r, g, b] = ch.map((v) =>
    Math.round(Math.min(Math.max(v, 0), 1) * 255),
  );
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const COL_W = (PAGE_W - MARGIN_X * 2 - 36) / 4; // 4 columns with 12pt gaps
const { default: PDFDocument } = await import('pdfkit');
const chunks: Buffer[] = [];
const doc = new PDFDocument({ size: [PAGE_W, PAGE_H] });
doc.on('data', (c: Buffer) => chunks.push(c));

await new Promise<void>((resolve, reject) => {
  doc.on('end', resolve);
  doc.on('error', reject);

  drawTestHeader(doc, 'MT-27');
  doc
    .fillColor('#666666')
    .fontSize(7)
    .font('Helvetica')
    .text(
      'All columns should be visually identical for matrix+TRC profiles.',
      MARGIN_X,
      MARGIN_TOP + 5,
    );

  // Column headers
  INTENTS.forEach((intent, ci) => {
    const x = MARGIN_X + ci * (COL_W + 12);
    doc
      .fillColor('#444444')
      .fontSize(7)
      .font('Helvetica-Bold')
      .text(intent, x, MARGIN_TOP + 18, { width: COL_W });
  });

  // Swatch rows
  const startY = MARGIN_TOP + 30;
  SWATCHES.forEach(({ name, rgb }, ri) => {
    const rowY = startY + ri * 22;
    INTENTS.forEach((intent, ci) => {
      const x = MARGIN_X + ci * (COL_W + 12);
      const out = transforms[intent].apply(rgb);
      const hex = out.length >= 3 ? toHex(out) : '#888888';
      doc.rect(x, rowY, 12, 12).fill(hex);
      doc
        .fillColor('#111111')
        .fontSize(7)
        .font('Helvetica')
        .text(ci === 0 ? name : `(${intent.slice(0, 3)})`, x + 14, rowY + 2, {
          width: COL_W - 14,
        });
    });
  });

  doc.end();
});

writePdf('mt-27-intents.pdf', Buffer.concat(chunks));
console.log(
  `\nMT-27 ${allIdentical ? 'PASS' : 'FAIL (unexpected intent differences)'}`,
);
if (!allIdentical) process.exit(1);
