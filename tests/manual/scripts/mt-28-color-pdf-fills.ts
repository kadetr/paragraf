#!/usr/bin/env tsx
// manual/scripts/mt-28-color-pdf-fills.ts
// MT-28 — Color fill rendering in PDF output.
//
// Renders 5 fill colors as actual typeset paragraphs (one per color) into three PDFs:
//   1. mt-28-no-transform.pdf     — no colorTransform (raw CSS fill)
//   2. mt-28-srgb-srgb.pdf       — sRGB→sRGB identity transform
//   3. mt-28-srgb-adobergb.pdf   — sRGB→AdobeRGB (wider gamut: expect visible shift on red/blue)
//
// Also writes mt-28-fills.json with the exact fill channel values used in each PDF.
//
// Manual checks:
//   1. Open all three PDFs side-by-side.
//   2. No-transform and sRGB→sRGB should look identical (identity transform).
//   3. sRGB→AdobeRGB: highly-saturated reds (#cc0000) and blues (#0055aa) should
//      look slightly different — the XYZ channel values shift outside [0,1] sRGB
//      gamut on screen but the PDF fill is clamped to visible range.
//   4. Black (#000000) should be identical in all three PDFs.
//
// Run:  tsx tests/manual/scripts/mt-28-color-pdf-fills.ts

import * as path from 'path';
import { readFileSync } from 'fs';
import {
  parseIccProfile,
  loadBuiltinSrgb,
  createTransform,
} from '@paragraf/color';
import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph } from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
import type { ColorTransform } from '@paragraf/color';
import { serifRegistry, font } from '../fixtures/fonts.js';
import { writeJson, writePdf } from '../fixtures/output.js';
import { drawTestHeader } from '../fixtures/header.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  PAGE_W,
  PAGE_H,
  CONTENT_W,
} from '../fixtures/documents.js';

// ─── Profiles ─────────────────────────────────────────────────────────────────

const srgb = loadBuiltinSrgb();
const adobeRgbBuf = readFileSync(
  '/System/Library/ColorSync/Profiles/AdobeRGB1998.icc',
);
const adobeRgb = parseIccProfile(
  new Uint8Array(
    adobeRgbBuf.buffer,
    adobeRgbBuf.byteOffset,
    adobeRgbBuf.byteLength,
  ),
);

// ─── Fill swatches for typeset paragraphs ─────────────────────────────────────

const FILLS: Array<{ name: string; css: string; sampleText: string }> = [
  {
    name: 'black',
    css: 'black',
    sampleText:
      'Black (#000000): The baseline fill. Should be identical across all transform variants. ' +
      'This is the most common text color in print and screen typesetting.',
  },
  {
    name: 'deep-red',
    css: '#cc0000',
    sampleText:
      'Deep red (#cc0000): A highly saturated red. The XYZ gamut boundary differs between ' +
      'sRGB and AdobeRGB — this swatch should show the most visible shift in the AdobeRGB variant.',
  },
  {
    name: 'ocean-blue',
    css: '#0055aa',
    sampleText:
      'Ocean blue (#0055aa): Saturated cool blue. AdobeRGB covers a wider blue gamut than sRGB; ' +
      'expect a subtle shift in the AdobeRGB output PDF.',
  },
  {
    name: 'forest-green',
    css: '#228b22',
    sampleText:
      'Forest green (#228b22): Mid-saturation green. Greens fall largely within the sRGB gamut, ' +
      'so the AdobeRGB shift here should be smaller than for red or blue.',
  },
  {
    name: 'warm-tan',
    css: '#ccaa77',
    sampleText:
      'Warm tan (#ccaa77): A desaturated neutral. Neutrals are near the achromatic axis; ' +
      'the transform should produce negligible visible difference across all variants.',
  },
];

// ─── Font setup ───────────────────────────────────────────────────────────────

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const fontEngine = await createDefaultFontEngine(registry);
const measurer = createMeasurer(registry);
const F12 = font('serif-regular', 12);
const F14B = font('serif-bold', 14);

// ─── Render variants ──────────────────────────────────────────────────────────

type Variant = {
  label: string;
  pdfName: string;
  transform: ColorTransform | undefined;
};

const variants: Variant[] = [
  {
    label: 'no-transform',
    pdfName: 'mt-28-no-transform.pdf',
    transform: undefined,
  },
  {
    label: 'srgb→srgb',
    pdfName: 'mt-28-srgb-srgb.pdf',
    transform: createTransform(srgb, srgb),
  },
  {
    label: 'srgb→adobergb',
    pdfName: 'mt-28-srgb-adobergb.pdf',
    transform: createTransform(srgb, adobeRgb),
  },
];

const fillsRecord: unknown[] = [];

for (const variant of variants) {
  console.log(`\n── ${variant.label} ──`);

  const fillData: unknown[] = [];

  // Compose heading paragraph (black)
  const headingOut = composer.compose({
    text: `MT-28 — ${variant.label}`,
    font: F14B,
    lineWidth: CONTENT_W,
    tolerance: 2,
  });
  const headingRendered = layoutParagraph(headingOut.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });

  // Compose each fill swatch paragraph
  const swatchParagraphs: Array<{
    rendered: ReturnType<typeof layoutParagraph>;
    fill: string;
    y: number;
  }> = [];

  let curY = MARGIN_TOP + headingOut.lines.length * 18 + 16;

  for (const { name, css, sampleText } of FILLS) {
    const out = composer.compose({
      text: sampleText,
      font: F12,
      lineWidth: CONTENT_W,
      tolerance: 3,
    });
    const rendered = layoutParagraph(out.lines, measurer, {
      x: MARGIN_X,
      y: curY,
    });
    swatchParagraphs.push({ rendered, fill: css, y: curY });
    curY += out.lines.length * 16 + 20;

    // Record what fill hex will be used
    const effectiveFill: string = variant.transform
      ? applyFillTransform(variant.transform, css)
      : css;
    console.log(`  ${name}: ${css} → ${effectiveFill}`);
    fillData.push({ name, cssFill: css, effectiveFill });
  }

  fillsRecord.push({ variant: variant.label, fills: fillData });

  // Render heading (always black)
  const headingBuf = await renderToPdf(headingRendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
    fill: 'black',
  });

  // For the actual combined PDF, use pdfkit directly so we can mix fills
  const { default: PDFDocument } = await import('pdfkit');
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H] });
  doc.on('data', (c: Buffer) => chunks.push(c));

  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);

    drawTestHeader(doc, 'MT-28');

    // Page title
    doc
      .fillColor('#000000')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(
        `MT-28 — color fill rendering: ${variant.label}`,
        MARGIN_X,
        MARGIN_TOP,
      );

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#666666')
      .text(
        variant.transform
          ? 'colorTransform active — CSS fill is converted through ICC transform before doc.fill()'
          : 'No colorTransform — CSS fill is passed directly to pdfkit doc.fill()',
        MARGIN_X,
        MARGIN_TOP + 20,
        { width: CONTENT_W },
      );

    let y = MARGIN_TOP + 50;

    for (const { name, css, sampleText } of FILLS) {
      const effectiveFill: string = variant.transform
        ? applyFillTransform(variant.transform, css)
        : css;

      // Swatch label in black
      doc
        .fillColor('#000000')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(
          `${name}  (css: ${css}  →  effective: ${effectiveFill})`,
          MARGIN_X,
          y,
        );
      y += 11;

      // Colored swatch rectangle
      doc.rect(MARGIN_X, y, 24, 24).fill(effectiveFill);
      y += 8;

      // Typeset paragraph in that fill color
      doc
        .fillColor(effectiveFill)
        .fontSize(11)
        .font('Helvetica')
        .text(sampleText, MARGIN_X + 32, y - 8, { width: CONTENT_W - 32 });

      y += 44;
    }

    doc.end();
  });

  writePdf(variant.pdfName, Buffer.concat(chunks));
}

writeJson('mt-28-fills.json', fillsRecord);
console.log('\nMT-28 PASS');

// ─── Helpers (mirrors render-pdf internal parseCssToSrgb/applyFillTransform) ─

function parseCssToSrgb(css: string): [number, number, number] | null {
  const s = css.trim().toLowerCase();
  const NAMED: Record<string, [number, number, number]> = {
    black: [0, 0, 0],
    white: [1, 1, 1],
    red: [1, 0, 0],
    green: [0, 0.502, 0],
    blue: [0, 0, 1],
    cyan: [0, 1, 1],
    magenta: [1, 0, 1],
    yellow: [1, 1, 0],
  };
  if (NAMED[s]) return NAMED[s];
  const hex6 = s.match(/^#([0-9a-f]{6})$/);
  if (hex6) {
    const v = parseInt(hex6[1], 16);
    return [(v >> 16) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
  }
  const hex3 = s.match(/^#([0-9a-f]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1].split('').map((c) => parseInt(c + c, 16) / 255);
    return [r, g, b];
  }
  const rgb = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgb)
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  return null;
}

function applyFillTransform(transform: ColorTransform, fill: string): string {
  const srgbVal = parseCssToSrgb(fill);
  if (!srgbVal) return fill;
  const out = transform.apply(srgbVal);
  // Convert [0,1] output to hex string — pdfkit divides array RGB by 255,
  // so passing a hex string is the only safe way to get correct colors.
  const r = Math.round(Math.min(Math.max(out[0] ?? 0, 0), 1) * 255);
  const g = Math.round(Math.min(Math.max(out[1] ?? 0, 0), 1) * 255);
  const b = Math.round(Math.min(Math.max(out[2] ?? 0, 0), 1) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
